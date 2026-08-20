import React, { useState } from 'react';
import { Card, Badge, cn } from '../ui';
import { BreakdownItem } from '../../types';
import { PieChart, MapPin, Tag } from 'lucide-react';
import { formatNumber } from '../../utils/formatters';

interface BreakdownBarsProps {
  categories: BreakdownItem[];
  regions: BreakdownItem[];
}

export const BreakdownBars: React.FC<BreakdownBarsProps> = ({ categories, regions }) => {
  const [tab, setTab] = useState<'categories' | 'regions'>('categories');

  const items = tab === 'categories' ? categories : regions.slice(0, 10);
  const maxCount = Math.max(...items.map(i => i.count), 1);

  return (
    <Card className="p-5 flex flex-col justify-between">
      {/* Header with Switcher */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-surface-border">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab('categories')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              tab === 'categories'
                ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-surface-light'
            )}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Категории</span>
          </button>

          <button
            onClick={() => setTab('regions')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              tab === 'regions'
                ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-surface-light'
            )}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Регионы</span>
          </button>
        </div>

        <span className="text-[11px] text-slate-400 font-mono">
          {tab === 'categories' ? 'Распределение по типам' : 'Топ-10 стран'}
        </span>
      </div>

      {/* Bars List */}
      <div className="space-y-3">
        {items.map((item) => {
          const widthPct = Math.max(5, Math.min(100, (item.count / maxCount) * 100));

          return (
            <div key={item.name} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-brand-400" />
                  {item.name}
                </span>
                <div className="flex items-center gap-3 font-mono text-[11px]">
                  <span className="text-emerald-400 font-semibold">{formatNumber(item.suitable_count)} подх.</span>
                  <span className="text-slate-400">({item.pct}%)</span>
                  <span className="font-bold text-white">{formatNumber(item.count)}</span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 bg-surface-light rounded-full overflow-hidden border border-surface-border/60">
                <div
                  className="h-full bg-gradient-to-r from-brand-600 to-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
