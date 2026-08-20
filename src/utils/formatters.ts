export function formatNumber(num: number | undefined | null): string {
  if (num === undefined || num === null || isNaN(num)) return '0';
  return num.toLocaleString('ru-RU');
}

export function formatPercent(num: number | undefined | null): string {
  if (num === undefined || num === null || isNaN(num)) return '0%';
  return `${(Math.round(num * 10) / 10).toLocaleString('ru-RU')}%`;
}

export function formatKyivDateTime(isoDate: string | undefined | null): string {
  if (!isoDate) return '—';
  try {
    const d = new Date(isoDate);
    return d.toLocaleString('ru-RU', {
      timeZone: 'Europe/Kyiv',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch (e) {
    return isoDate;
  }
}

export function formatKyivTime(isoDate: string | undefined | null): string {
  if (!isoDate) return '—';
  try {
    const d = new Date(isoDate);
    return d.toLocaleTimeString('ru-RU', {
      timeZone: 'Europe/Kyiv',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch (e) {
    return isoDate;
  }
}

export function formatKyivDateOnly(isoDate: string | undefined | null): string {
  if (!isoDate) return '—';
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString('ru-RU', {
      timeZone: 'Europe/Kyiv',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch (e) {
    return isoDate;
  }
}

export function formatDuration(ms: number): string {
  if (isNaN(ms) || ms <= 0) return '0 с';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec} с`;
  return `${min} мин ${sec} с`;
}
