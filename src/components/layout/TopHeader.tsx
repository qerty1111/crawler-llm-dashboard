import React, { useState } from 'react';
import { Calendar, Radio, Clock, SlidersHorizontal, Download, ChevronDown, Check } from 'lucide-react';
import { usePeriod, PeriodMode } from '../../context/PeriodContext';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { Badge, Button, cn } from '../ui';
import { formatKyivTime } from '../../utils/formatters';

export const TopHeader: React.FC<{ onOpenExport?: () => void }> = ({ onOpenExport }) => {
  const { mode, selectedDay, rangeFrom, rangeTo, setPeriodToday, setSelectedDay, setDateRange } = usePeriod();
  const { status, lastMessageTime } = useSocket();
  const { scoreThreshold, setScoreThreshold } = useAuth();
  const [showThresholdPopup, setShowThresholdPopup] = useState(false);

  return (
    <header className="h-16 border-b border-surface-border bg-surface px-6 flex items-center justify-between select-none">
      {/* Left: Period Selector */}
      <div className="flex items-center gap-3">
        <div className="flex items-center bg-surface-light border border-surface-border rounded-xl p-1 shadow-inner">
          <button
            onClick={setPeriodToday}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150',
              mode === 'today'
                ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            Сегодня
          </button>

          <div className="h-4 w-px bg-surface-border mx-1" />

          {/* Single Day Picker */}
          <div className="flex items-center gap-1.5 px-2">
            <span className="text-[11px] text-slate-400 font-medium">День:</span>
            <input
              type="date"
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              className={cn(
                'bg-transparent text-xs font-mono text-slate-200 focus:outline-none border-b border-transparent focus:border-brand-500 cursor-pointer',
                mode === 'day' && 'text-brand-400 font-bold'
              )}
            />
          </div>

          <div className="h-4 w-px bg-surface-border mx-1" />

          {/* Date Range Picker */}
          <div className="flex items-center gap-1.5 px-2">
            <span className="text-[11px] text-slate-400 font-medium">Период:</span>
            <input
              type="date"
              value={rangeFrom}
              onChange={(e) => setDateRange(e.target.value, rangeTo)}
              className={cn(
                'bg-transparent text-xs font-mono text-slate-200 focus:outline-none cursor-pointer',
                mode === 'range' && 'text-brand-400 font-bold'
              )}
            />
            <span className="text-slate-500">—</span>
            <input
              type="date"
              value={rangeTo}
              onChange={(e) => setDateRange(rangeFrom, e.target.value)}
              className={cn(
                'bg-transparent text-xs font-mono text-slate-200 focus:outline-none cursor-pointer',
                mode === 'range' && 'text-brand-400 font-bold'
              )}
            />
          </div>
        </div>

        <span className="text-[11px] text-slate-400 font-mono hidden xl:inline-block">
          Часовой пояс: <span className="text-slate-300">Europe/Kyiv (UTC+3)</span>
        </span>
      </div>

      {/* Right: Connection status, Quick threshold, Export CSV */}
      <div className="flex items-center gap-4">
        {/* Quick Threshold Widget */}
        <div className="relative">
          <button
            onClick={() => setShowThresholdPopup(!showThresholdPopup)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-light border border-surface-border hover:border-slate-600 text-xs text-slate-200 transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-brand-400" />
            <span>Порог:</span>
            <span className="font-mono font-bold text-emerald-400">≥ {scoreThreshold}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {showThresholdPopup && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-surface border border-surface-border rounded-xl p-4 shadow-2xl z-50 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-white">Быстрый порог оценки</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">score ≥ {scoreThreshold}</span>
              </div>
              <input
                type="range"
                min="6"
                max="10"
                step="1"
                value={scoreThreshold}
                onChange={(e) => setScoreThreshold(Number(e.target.value))}
                className="w-full accent-brand-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>6 (Мин.)</span>
                <span>7 (Норм.)</span>
                <span>8</span>
                <span>9</span>
                <span>10 (Строго)</span>
              </div>
              {scoreThreshold < 7 && (
                <p className="text-[11px] text-amber-400 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                  ⚠️ При пороге ниже 7 в выдачу попадёт много нерелевантных сайтов.
                </p>
              )}
              {scoreThreshold === 10 && (
                <p className="text-[11px] text-amber-400 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                  ⚠️ При пороге 10 результатов будет крайне мало.
                </p>
              )}
            </div>
          )}
        </div>

        {/* WebSocket Connection Status */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-light border border-surface-border">
          {status === 'online' && (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-semibold text-emerald-400">В эфире</span>
            </>
          )}

          {status === 'reconnecting' && (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
              </span>
              <span className="text-xs font-semibold text-amber-400">Переподключение...</span>
            </>
          )}

          {status === 'offline' && (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500"></span>
              <span className="text-xs font-semibold text-rose-400">
                Офлайн {lastMessageTime ? `(от ${formatKyivTime(lastMessageTime.toISOString())})` : ''}
              </span>
            </>
          )}
        </div>

        {/* Export Button */}
        {onOpenExport && (
          <Button variant="outline" size="sm" onClick={onOpenExport} className="gap-2 text-xs">
            <Download className="w-3.5 h-3.5 text-brand-400" />
            Экспорт CSV
          </Button>
        )}
      </div>
    </header>
  );
};
