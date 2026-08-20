import React, { useState } from 'react';
import { Card, Badge, cn } from '../ui';
import { TopQueryItem, TopDomainItem, WorstQueryItem } from '../../types';
import { Trophy, Globe, AlertTriangle, ExternalLink } from 'lucide-react';
import { formatNumber, formatPercent } from '../../utils/formatters';

interface TopTablesProps {
  topQueries: TopQueryItem[];
  topDomains: TopDomainItem[];
  worstQueries: WorstQueryItem[];
  threshold: number;
}

export const TopTables: React.FC<TopTablesProps> = ({
  topQueries,
  topDomains,
  worstQueries,
  threshold,
}) => {
  const [activeTab, setActiveTab] = useState<'queries' | 'domains' | 'worst'>('queries');

  return (
    <Card className="p-5">
      {/* Tab Switcher Header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-surface-border">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('queries')}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              activeTab === 'queries'
                ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-surface-light'
            )}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>Топ запросов</span>
          </button>

          <button
            onClick={() => setActiveTab('domains')}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              activeTab === 'domains'
                ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-surface-light'
            )}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Топ доменов</span>
          </button>

          <button
            onClick={() => setActiveTab('worst')}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              activeTab === 'worst'
                ? 'bg-amber-600 text-white shadow-sm shadow-amber-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-surface-light'
            )}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Худшие запросы</span>
          </button>
        </div>

        <span className="text-[11px] text-slate-400 font-mono">Топ-10 позиций</span>
      </div>

      {/* Tab 1: Top Queries */}
      {activeTab === 'queries' && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-surface-border">
                <th className="pb-2 font-semibold w-8">#</th>
                <th className="pb-2 font-semibold">Поисковый запрос</th>
                <th className="pb-2 font-semibold">Проект</th>
                <th className="pb-2 font-semibold text-right">Найдено</th>
                <th className="pb-2 font-semibold text-right">Подходящих</th>
                <th className="pb-2 font-semibold text-right">Конверсия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border/40 font-mono">
              {topQueries.map((q, idx) => (
                <tr key={q.id} className="hover:bg-surface-light/50 transition-colors">
                  <td className="py-2.5 text-slate-500 font-bold">{idx + 1}</td>
                  <td className="py-2.5 font-sans text-slate-200 font-medium truncate max-w-xs" title={q.text_orig}>
                    {q.text_orig}
                  </td>
                  <td className="py-2.5 font-sans text-slate-400 text-[11px] truncate max-w-[140px]">
                    {q.project_name}
                  </td>
                  <td className="py-2.5 text-right text-slate-400">{formatNumber(q.raw_found)}</td>
                  <td className="py-2.5 text-right font-bold text-emerald-400">{formatNumber(q.suitable)}</td>
                  <td className="py-2.5 text-right text-slate-300 font-semibold">{q.conversion_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Top Domains */}
      {activeTab === 'domains' && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-surface-border">
                <th className="pb-2 font-semibold w-8">#</th>
                <th className="pb-2 font-semibold">Домен</th>
                <th className="pb-2 font-semibold">Категория</th>
                <th className="pb-2 font-semibold text-right">Подходящих ссылок</th>
                <th className="pb-2 font-semibold text-right">Ср. оценка</th>
                <th className="pb-2 font-semibold text-right">Действие</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border/40 font-mono">
              {topDomains.map((d, idx) => (
                <tr key={d.domain} className="hover:bg-surface-light/50 transition-colors">
                  <td className="py-2.5 text-slate-500 font-bold">{idx + 1}</td>
                  <td className="py-2.5 text-slate-200 font-bold font-mono">{d.domain}</td>
                  <td className="py-2.5 font-sans">
                    <Badge variant="default" size="sm" className="text-[10px]">
                      {d.category}
                    </Badge>
                  </td>
                  <td className="py-2.5 text-right font-bold text-emerald-400">{formatNumber(d.suitable_count)}</td>
                  <td className="py-2.5 text-right text-cyan-400 font-bold">{d.avg_score} / 10</td>
                  <td className="py-2.5 text-right">
                    <a
                      href={d.top_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-brand-400 hover:text-brand-300 font-sans"
                    >
                      <span>Открыть</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 3: Worst Queries */}
      {activeTab === 'worst' && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-surface-border">
                <th className="pb-2 font-semibold w-8">#</th>
                <th className="pb-2 font-semibold">Неэффективный запрос</th>
                <th className="pb-2 font-semibold">Проект</th>
                <th className="pb-2 font-semibold text-right">Найдено ссылок</th>
                <th className="pb-2 font-semibold text-right">Оценено</th>
                <th className="pb-2 font-semibold text-right">Подходящих</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border/40 font-mono">
              {worstQueries.map((w, idx) => (
                <tr key={w.id} className="hover:bg-surface-light/50 transition-colors">
                  <td className="py-2.5 text-amber-500 font-bold">{idx + 1}</td>
                  <td className="py-2.5 font-sans text-slate-200 font-medium truncate max-w-xs" title={w.text_orig}>
                    {w.text_orig}
                  </td>
                  <td className="py-2.5 font-sans text-slate-400 text-[11px] truncate max-w-[140px]">
                    {w.project_name}
                  </td>
                  <td className="py-2.5 text-right text-amber-400 font-bold">{formatNumber(w.raw_found)}</td>
                  <td className="py-2.5 text-right text-slate-400">{formatNumber(w.classified)}</td>
                  <td className="py-2.5 text-right font-bold text-rose-400">{w.suitable}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};
