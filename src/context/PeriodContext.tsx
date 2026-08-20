import React, { createContext, useContext, useState, useMemo } from 'react';

export type PeriodMode = 'today' | 'day' | 'range';

interface PeriodContextType {
  mode: PeriodMode;
  selectedDay: string; // YYYY-MM-DD
  rangeFrom: string; // YYYY-MM-DD
  rangeTo: string; // YYYY-MM-DD
  fromIso: string;
  toIso: string;
  label: string;
  setPeriodToday: () => void;
  setSelectedDay: (day: string) => void;
  setDateRange: (from: string, to: string) => void;
}

const PeriodContext = createContext<PeriodContextType | undefined>(undefined);

// Helper to get current YYYY-MM-DD in Europe/Kyiv
function getKyivTodayString(): string {
  const now = new Date();
  return now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' });
}

export const PeriodProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const todayStr = useMemo(() => getKyivTodayString(), []);
  const [mode, setMode] = useState<PeriodMode>('today');
  const [selectedDay, setSelectedDayState] = useState<string>(todayStr);
  const [rangeFrom, setRangeFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' });
  });
  const [rangeTo, setRangeTo] = useState<string>(todayStr);

  const { fromIso, toIso, label } = useMemo(() => {
    if (mode === 'today') {
      // 00:00:00 today to current moment
      const start = new Date(`${todayStr}T00:00:00+03:00`);
      const end = new Date();
      return {
        fromIso: start.toISOString(),
        toIso: end.toISOString(),
        label: 'Сегодня',
      };
    }

    if (mode === 'day') {
      const start = new Date(`${selectedDay}T00:00:00+03:00`);
      const end = new Date(`${selectedDay}T23:59:59+03:00`);
      return {
        fromIso: start.toISOString(),
        toIso: end.toISOString(),
        label: selectedDay === todayStr ? 'Сегодня' : selectedDay,
      };
    }

    // mode === 'range'
    const start = new Date(`${rangeFrom}T00:00:00+03:00`);
    const end = new Date(`${rangeTo}T23:59:59+03:00`);
    return {
      fromIso: start.toISOString(),
      toIso: end.toISOString(),
      label: `${rangeFrom} — ${rangeTo}`,
    };
  }, [mode, selectedDay, rangeFrom, rangeTo, todayStr]);

  const setPeriodToday = () => {
    setMode('today');
  };

  const setSelectedDay = (day: string) => {
    setSelectedDayState(day);
    setMode('day');
  };

  const setDateRange = (from: string, to: string) => {
    setRangeFrom(from);
    setRangeTo(to);
    setMode('range');
  };

  return (
    <PeriodContext.Provider
      value={{
        mode,
        selectedDay,
        rangeFrom,
        rangeTo,
        fromIso,
        toIso,
        label,
        setPeriodToday,
        setSelectedDay,
        setDateRange,
      }}
    >
      {children}
    </PeriodContext.Provider>
  );
};

export const usePeriod = () => {
  const context = useContext(PeriodContext);
  if (!context) {
    throw new Error('usePeriod must be used within a PeriodProvider');
  }
  return context;
};
