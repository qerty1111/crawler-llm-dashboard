import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { QueryItem, FactClassified } from '../types';
import { Card, Button, Badge, Skeleton, cn } from '../components/ui';
import { ArrowLeft, Play, Pause, Trash2, Globe, ExternalLink, Search, BarChart3, TrendingUp } from 'lucide-react';
import { formatNumber, formatKyivDateTime, formatKyivTime } from '../utils/formatters';
import { getScoreBadgeClass, getCategoryBadgeClass, getStatusBadgeClass } from '../utils/colors';

export const QueryDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [queryData, setQueryData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadQuery = async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const data = await api.getQueryDetail(Number(id));
      setQueryData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadQuery();
  }, [id]);

  const handleToggleStatus = async () => {
    if (!queryData?.query) return;
    const newStatus = queryData.query.status === 'active' ? 'paused' : 'active';
    try {
      await api.updateQuery(queryData.query.id, { status: newStatus });
      loadQuery();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async () => {
    if (!queryData?.query) return;
    if (!window.confirm(`Вы уверены, что хотите снять с обхода запрос: "${queryData.query.text_orig}"?`)) return;

    try {
      await api.deleteQuery(queryData.query.id);
      navigate('/queries');
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (isLoading || !queryData) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20" />
        <div className="grid grid-cols-4 gap-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  const { query, regionBreakdown, scoreHistogram, recentLinks } = queryData;

  return (
    <div className="space-y-6">
      {/* Header & Back button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/queries')} className="gap-1.5 text-xs">
            <ArrowLeft className="w-4 h-4" />
            Назад к запросам
          </Button>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white font-mono tracking-tight">
                {query.text_orig}
              </h2>
              <span className={cn('px-2 py-0.5 rounded-md border text-[11px] font-semibold', getStatusBadgeClass(query.status))}>
                {query.status === 'active' ? 'Активен' : query.status === 'paused' ? 'На паузе' : 'Остановлен'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Проект: <span className="text-slate-200 font-semibold">{query.project_name}</span> • Регионы: <span className="text-brand-300 font-mono">{query.regions.join(', ').toUpperCase()}</span>
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant={query.status === 'active' ? 'outline' : 'success'}
            size="sm"
            onClick={handleToggleStatus}
            className="gap-1.5 text-xs"
          >
            {query.status === 'active' ? (
              <>
                <Pause className="w-3.5 h-3.5 text-amber-400" />
                Пауза
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 text-white" />
                Возобновить
              </>
            )}
          </Button>
          <Button variant="danger" size="sm" onClick={handleDelete} className="gap-1.5 text-xs">
            <Trash2 className="w-3.5 h-3.5" />
            Снять с обхода
          </Button>
        </div>
      </div>

      {/* Query KPI Row */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <span className="text-xs text-slate-400">Найдено ссылок</span>
          <p className="text-2xl font-bold font-mono text-white mt-1">{formatNumber(query.raw_found)}</p>
        </Card>
        <Card className="p-4">
          <span className="text-xs text-slate-400">Оценено нейросетью</span>
          <p className="text-2xl font-bold font-mono text-purple-400 mt-1">{formatNumber(query.classified)}</p>
        </Card>
        <Card className="p-4">
          <span className="text-xs text-slate-400">Подходящих</span>
          <p className="text-2xl font-bold font-mono text-emerald-400 mt-1">{formatNumber(query.suitable)}</p>
        </Card>
        <Card className="p-4">
          <span className="text-xs text-slate-400">Конверсия</span>
          <p className="text-2xl font-bold font-mono text-cyan-400 mt-1">{query.conversion_pct}%</p>
        </Card>
      </div>

      {/* Middle Grid: Region Breakdown & Score Distribution */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Region Breakdown Table */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-surface-border">
            <Globe className="w-4 h-4 text-brand-400" />
            <h3 className="text-sm font-bold text-white">Разбивка по регионам поиска</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="text-slate-400 border-b border-surface-border">
                  <th className="pb-2">Регион</th>
                  <th className="pb-2 text-right">Найдено</th>
                  <th className="pb-2 text-right">Оценено</th>
                  <th className="pb-2 text-right">Подходящих</th>
                  <th className="pb-2 text-right">Конверсия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border/40">
                {regionBreakdown.map((r: any) => (
                  <tr key={r.region} className="hover:bg-surface-light/40">
                    <td className="py-2 text-slate-200 font-bold uppercase">{r.region}</td>
                    <td className="py-2 text-right text-slate-400">{formatNumber(r.found)}</td>
                    <td className="py-2 text-right text-slate-300">{formatNumber(r.classified)}</td>
                    <td className="py-2 text-right font-bold text-emerald-400">{formatNumber(r.suitable)}</td>
                    <td className="py-2 text-right text-slate-200 font-semibold">{r.conversion_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Score Histogram */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-surface-border">
            <BarChart3 className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Распределение оценок для этого запроса</h3>
          </div>

          <div className="grid grid-cols-11 gap-2 items-end h-40 border-b border-surface-border pb-2">
            {scoreHistogram.map((item: any) => {
              const maxC = Math.max(...scoreHistogram.map((x: any) => x.count), 1);
              const heightPct = Math.max(8, Math.round((item.count / maxC) * 100));

              return (
                <div key={item.score} className="flex flex-col items-center h-full justify-end">
                  <span className="text-[10px] font-mono text-slate-400 mb-1">{item.count}</span>
                  <div
                    className={cn(
                      'w-full rounded-t-lg transition-all',
                      item.isSuitable
                        ? 'bg-gradient-to-t from-emerald-600 to-emerald-400 shadow-sm shadow-emerald-500/20'
                        : 'bg-slate-700/50'
                    )}
                    style={{ height: `${heightPct}%` }}
                  />
                  <span className="text-xs font-mono font-bold mt-2 text-slate-300">{item.score}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Recent Links Table */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-surface-border">
          <h3 className="text-sm font-bold text-white">Последние найденные ссылки по запросу</h3>
          <span className="text-xs text-slate-400 font-mono">Показано {recentLinks.length} записей</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-surface-border">
                <th className="pb-2 font-semibold">Оценка</th>
                <th className="pb-2 font-semibold">Домен</th>
                <th className="pb-2 font-semibold">Заголовок страницы</th>
                <th className="pb-2 font-semibold">Категория</th>
                <th className="pb-2 font-semibold">Регион</th>
                <th className="pb-2 font-semibold text-right">Время оценки</th>
                <th className="pb-2 font-semibold text-right">Ссылка</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border/40 font-mono">
              {recentLinks.map((link: FactClassified) => (
                <tr key={link.id} className="hover:bg-surface-light/50 transition-colors">
                  <td className="py-2.5 whitespace-nowrap">
                    <span className={cn('px-2 py-0.5 rounded-md border text-[11px] font-mono whitespace-nowrap inline-flex items-center justify-center min-w-[58px]', getScoreBadgeClass(link.score))}>
                      {link.score} / 10
                    </span>
                  </td>
                  <td className="py-2.5 text-slate-200 font-bold whitespace-nowrap">{link.domain}</td>
                  <td className="py-2.5 font-sans text-slate-300 truncate max-w-sm" title={link.title}>
                    {link.title}
                  </td>
                  <td className="py-2.5 font-sans whitespace-nowrap">
                    <span className={cn('px-2 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap inline-flex items-center', getCategoryBadgeClass(link.category))}>
                      {link.category}
                    </span>
                  </td>
                  <td className="py-2.5 uppercase text-slate-400 whitespace-nowrap">{link.region}</td>
                  <td className="py-2.5 text-right text-slate-400 whitespace-nowrap">{formatKyivDateTime(link.classified_at)}</td>
                  <td className="py-2.5 text-right whitespace-nowrap">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-brand-400 hover:text-brand-300 font-sans"
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
      </Card>
    </div>
  );
};
