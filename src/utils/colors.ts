export function getScoreBadgeClass(score: number): string {
  if (score >= 10) {
    return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-bold';
  }
  if (score >= 9) {
    return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold';
  }
  if (score >= 8) {
    return 'bg-green-500/20 text-green-300 border-green-500/40 font-semibold';
  }
  if (score >= 7) {
    return 'bg-lime-500/20 text-lime-300 border-lime-500/40 font-semibold';
  }
  if (score >= 6) {
    return 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-medium';
  }
  if (score >= 4) {
    return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
  }
  return 'bg-slate-700/40 text-slate-400 border-slate-700';
}

export function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'active':
    case 'running':
    case 'green':
    case 'healthy':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'paused':
    case 'idle':
    case 'yellow':
    case 'warning':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case 'stopped':
    case 'done':
    case 'down':
    case 'red':
      return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
    default:
      return 'bg-slate-700/50 text-slate-300 border-slate-600';
  }
}

export function getCategoryBadgeClass(category: string): string {
  switch (category) {
    case 'PMS':
      return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    case 'Channel Manager':
      return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
    case 'Booking Engine':
      return 'bg-teal-500/15 text-teal-400 border-teal-500/30';
    case 'RMS':
      return 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30';
    case 'OTA':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    default:
      return 'bg-slate-700/40 text-slate-400 border-slate-600/40';
  }
}
