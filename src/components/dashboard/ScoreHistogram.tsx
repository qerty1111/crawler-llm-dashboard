import React from 'react';
import { Card, Badge, cn } from '../ui';
import { ScoreHistogramItem } from '../../types';
import { BarChart3, ChevronRight } from 'lucide-react';
import { formatNumber } from '../../utils/formatters';

interface ScoreHistogramProps {
  items: ScoreHistogramItem[];
  threshold: number;
  onSelectScore?: (score: number) => void;
}

export const ScoreHistogram: React.FC<ScoreHistogramProps> = ({ items, threshold, onSelectScore }) => {
  const maxCount = Math.max(...items.map(i => i.count), 1);

  return (
    <Card className="p-5 flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">Распределение оценок (0–10)</h3>
            <p className="text-xs text-slate-400">Финальные баллы нейросети Этапа 2. Нажмите на столбец для выборки ссылок</p>
          </div>
        </div>

        <Badge variant="success" size="sm" className="font-mono text-[11px]">
          Порог: ≥ {threshold}
        </Badge>
      </div>

      {/* Histogram Bars */}
      <div className="pt-4 pb-2">
        <div className="grid grid-cols-11 gap-2 items-end h-44 border-b border-surface-border pb-2 relative">
          {items.map((item) => {
            const heightPct = Math.max(6, Math.round((item.count / maxCount) * 100));
            const isPassing = item.score >= threshold;

            return (
              <button
                key={item.score}
                onClick={() => onSelectScore?.(item.score)}
                title={`Оценка ${item.score}: ${formatNumber(item.count)} ссылок (${item.pct}%)`}
                className="group flex flex-col items-center h-full justify-end focus:outline-none transition-all"
              >
                {/* Count tooltip on top of bar */}
                <span className="text-[10px] font-mono text-slate-400 group-hover:text-white opacity-80 group-hover:opacity-100 mb-1 transition-colors">
                  {item.count > 999 ? `${(item.count / 1000).toFixed(1)}k` : item.count}
                </span>

                {/* Column */}
                <div
                  className={cn(
                    'w-full rounded-t-lg transition-all duration-200 group-hover:scale-y-105 origin-bottom relative',
                    isPassing
                      ? item.score === 10
                        ? 'bg-gradient-to-t from-cyan-600 to-cyan-400 shadow-md shadow-cyan-500/20'
                        : item.score >= 8
                        ? 'bg-gradient-to-t from-emerald-600 to-emerald-400 shadow-md shadow-emerald-500/20'
                        : 'bg-gradient-to-t from-lime-600 to-lime-400 shadow-md shadow-lime-500/20'
                      : 'bg-slate-700/40 hover:bg-slate-600/60 border border-slate-700/50'
                  )}
                  style={{ height: `${heightPct}%` }}
                >
                  {item.score === threshold && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-emerald-400/30" />
                  )}
                </div>

                {/* Score Label on X-axis */}
                <span
                  className={cn(
                    'text-xs font-mono font-bold mt-2',
                    isPassing ? 'text-emerald-400' : 'text-slate-500'
                  )}
                >
                  {item.score}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-surface-border/40">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-slate-700 border border-slate-600" />
          Ниже порога (отсекаются)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
          Подходят клиенту (score ≥ {threshold})
        </span>
      </div>
    </Card>
  );
};
