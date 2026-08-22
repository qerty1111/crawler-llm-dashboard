import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { FactClassified, Project, QueryItem } from '../types';
import { usePeriod } from '../context/PeriodContext';
import { useAuth } from '../context/AuthContext';
import { Card, Button, Input, Select, Badge, Skeleton, cn } from '../components/ui';
import {
  Link2, Search, Filter, Download, ExternalLink, ChevronDown,
  ChevronRight, RefreshCw, X, SlidersHorizontal, Tag, Globe, Sparkles
} from 'lucide-react';
import { formatNumber, formatKyivDateTime } from '../utils/formatters';
import { getScoreBadgeClass, getCategoryBadgeClass } from '../utils/colors';

export const LinksPage: React.FC = () => {
  const { fromIso, toIso } = usePeriod();
  const { scoreThreshold, role } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filters from URL
  const projectIdParam = searchParams.get('project_id') || '';
  const queryIdParam = searchParams.get('query_id') || '';
  const minScoreParam = searchParams.get('min_score') !== null ? Number(searchParams.get('min_score')) : scoreThreshold;
  const maxScoreParam = searchParams.get('max_score') !== null ? Number(searchParams.get('max_score')) : 10;
  const domainParam = searchParams.get('domain') || '';
  const categoryParam = searchParams.get('category') || '';
  const regionParam = searchParams.get('region') || '';
  const searchParam = searchParams.get('search') || '';

  // Local filter states
  const [projectId, setProjectId] = useState(projectIdParam);
  const [queryId, setQueryId] = useState(queryIdParam);
  const [minScore, setMinScore] = useState(minScoreParam);
  const [maxScore, setMaxScore] = useState(maxScoreParam);
  const [domainFilter, setDomainFilter] = useState(domainParam);
  const [categoryFilter, setCategoryFilter] = useState(categoryParam);
  const [regionFilter, setRegionFilter] = useState(regionParam);
  const [searchFilter, setSearchFilter] = useState(searchParam);

  // Data states
  const [links, setLinks] = useState<FactClassified[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [queries, setQueries] = useState<QueryItem[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Infinite scroll observer
  const observerTarget = useRef<HTMLDivElement>(null);

  // Load filter dropdowns
  useEffect(() => {
    Promise.all([api.getProjects(), api.getQueries()]).then(([pRes, qRes]) => {
      setProjects(pRes.projects || []);
      setQueries(qRes.queries || []);
    });
  }, []);

  const fetchLinks = useCallback(async (reset = true) => {
    if (reset) {
      setIsLoading(true);
      setNextCursor(null);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const data = await api.getLinks({
        from: fromIso,
        to: toIso,
        project_id: projectId || undefined,
        query_id: queryId || undefined,
        min_score: minScore,
        max_score: maxScore,
        domain: domainFilter || undefined,
        category: categoryFilter || undefined,
        region: regionFilter || undefined,
        search: searchFilter || undefined,
        cursor: reset ? undefined : nextCursor || undefined,
        limit: 50,
      });

      if (reset) {
        setLinks(data.items || []);
      } else {
        setLinks(prev => [...prev, ...(data.items || [])]);
      }
      setTotalCount(data.totalCount || 0);
      setNextCursor(data.nextCursor || null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [fromIso, toIso, projectId, queryId, minScore, maxScore, domainFilter, categoryFilter, regionFilter, searchFilter, nextCursor]);

  // Initial fetch and on filter update
  useEffect(() => {
    fetchLinks(true);
  }, [fromIso, toIso, projectId, queryId, minScore, maxScore, domainFilter, categoryFilter, regionFilter, searchFilter]);

  // Infinite scroll IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && nextCursor && !isLoading && !isLoadingMore) {
          fetchLinks(false);
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [nextCursor, isLoading, isLoadingMore, fetchLinks]);

  const toggleRowExpansion = (id: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetFilters = () => {
    setProjectId('');
    setQueryId('');
    setMinScore(scoreThreshold);
    setMaxScore(10);
    setDomainFilter('');
    setCategoryFilter('');
    setRegionFilter('');
    setSearchFilter('');
    setSearchParams({});
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Link2 className="w-6 h-6 text-brand-400" />
            <span>Реестр найденных и оцененных ссылок</span>
          </h2>
          <p className="text-xs text-slate-400">
            Детальная витрина результатов LLM-классификатора с бесконечным скроллом и полнотекстовым поиском
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant="success" size="md" className="font-mono text-xs">
            Найдено: <span className="font-bold ml-1">{formatNumber(totalCount)}</span>
          </Badge>
          <Button variant="outline" size="sm" onClick={() => fetchLinks(true)} className="gap-1.5 text-xs">
            <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
            Обновить
          </Button>
        </div>
      </div>

      {/* Comprehensive Filter Toolbar */}
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {/* Search URL / Title */}
          <div className="col-span-2 relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Поиск по URL, заголовку, сниппету..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full bg-surface-light border border-surface-border rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500"
            />
          </div>

          {/* Project Select */}
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="bg-surface-light border border-surface-border rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
          >
            <option value="">Все проекты</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* Query Select */}
          <select
            value={queryId}
            onChange={(e) => setQueryId(e.target.value)}
            className="bg-surface-light border border-surface-border rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500 truncate"
          >
            <option value="">Все запросы</option>
            {queries.map(q => (
              <option key={q.id} value={q.id}>{q.text_orig}</option>
            ))}
          </select>

          {/* Category Select */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-surface-light border border-surface-border rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
          >
            <option value="">Все категории</option>
            <option value="PMS">PMS</option>
            <option value="Channel Manager">Channel Manager</option>
            <option value="Booking Engine">Booking Engine</option>
            <option value="RMS">RMS</option>
            <option value="OTA">OTA</option>
            <option value="Unrelated">Unrelated</option>
          </select>

          {/* Score Range Pickers */}
          <div className="flex items-center gap-2 bg-surface-light border border-surface-border rounded-xl px-3 py-1">
            <span className="text-[11px] text-slate-400 whitespace-nowrap">Балл:</span>
            <input
              type="number"
              min="0"
              max="10"
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-10 bg-transparent text-xs font-mono font-bold text-emerald-400 focus:outline-none text-center"
            />
            <span className="text-slate-500">—</span>
            <input
              type="number"
              min="0"
              max="10"
              value={maxScore}
              onChange={(e) => setMaxScore(Number(e.target.value))}
              className="w-10 bg-transparent text-xs font-mono font-bold text-emerald-400 focus:outline-none text-center"
            />
          </div>
        </div>

        {/* Reset Filter Button */}
        <div className="flex items-center justify-between pt-2 border-t border-surface-border/50 text-xs">
          <div className="flex items-center gap-2 text-slate-400 flex-wrap">
            <span>Активные фильтры:</span>
            {minScore > 0 && <Badge variant="success" size="sm">score ≥ {minScore}</Badge>}
            {categoryFilter && <Badge variant="purple" size="sm">{categoryFilter}</Badge>}
            {projectId && <Badge variant="info" size="sm">Проект #{projectId}</Badge>}
          </div>

          <button
            onClick={resetFilters}
            className="text-[11px] text-slate-400 hover:text-rose-400 transition-colors flex items-center gap-1 whitespace-nowrap ml-auto"
          >
            <X className="w-3 h-3" />
            Сбросить все фильтры
          </button>
        </div>
      </Card>

      {/* Main Links Table (Sticky Header & Keyset Scroll) */}
      <Card className="p-0 overflow-hidden border-surface-border">
        <div className="overflow-x-auto max-h-[700px] overflow-y-auto">
          <table className="w-full text-left text-xs min-w-[1000px]">
            <thead className="bg-surface-light sticky top-0 z-20 border-b border-surface-border text-slate-400 select-none shadow-sm">
              <tr>
                <th className="py-3 px-3 font-semibold w-8"></th>
                <th className="py-3 px-4 font-semibold w-28 whitespace-nowrap">Оценка</th>
                <th className="py-3 px-4 font-semibold w-48 whitespace-nowrap">Домен</th>
                <th className="py-3 px-4 font-semibold min-w-[280px]">Заголовок страницы и URL</th>
                <th className="py-3 px-4 font-semibold w-44 whitespace-nowrap">Категория</th>
                <th className="py-3 px-4 font-semibold w-48 whitespace-nowrap">Запрос-источник</th>
                <th className="py-3 px-4 font-semibold text-right w-40 whitespace-nowrap">Время оценки</th>
                <th className="py-3 px-4 font-semibold text-right w-16 whitespace-nowrap">Действие</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-surface-border/40 font-mono">
              {isLoading && links.length === 0 ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="py-4 px-4">
                      <div className="h-5 bg-surface-lighter rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : links.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500 font-sans">
                    <Link2 className="w-10 h-10 mx-auto mb-2 text-slate-600" />
                    <p className="text-sm font-semibold text-slate-300">За выбранный период данных нет</p>
                    <p className="text-xs text-slate-500 mt-1">Попробуйте изменить диапазон дат или снизить порог оценки</p>
                  </td>
                </tr>
              ) : (
                links.map((link) => {
                  const isExpanded = expandedRows.has(link.id);

                  return (
                    <React.Fragment key={`${link.id}_${link.classified_at}`}>
                      <tr
                        onClick={() => toggleRowExpansion(link.id)}
                        className={cn(
                          'hover:bg-surface-light/60 transition-colors cursor-pointer group',
                          isExpanded && 'bg-surface-light/40'
                        )}
                      >
                        {/* Expand Icon */}
                        <td className="py-3 px-3 text-slate-500">
                          <button type="button" className="p-1 rounded hover:text-white">
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-brand-400" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                        </td>

                        {/* Score Badge */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={cn('px-2.5 py-1 rounded-md border text-xs font-mono font-bold whitespace-nowrap inline-flex items-center justify-center min-w-[62px]', getScoreBadgeClass(link.score))}>
                            {link.score} / 10
                          </span>
                        </td>

                        {/* Domain & Region */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-mono font-bold text-slate-100 flex items-center gap-1.5 whitespace-nowrap">
                            <span>{link.domain}</span>
                            <span className="text-[10px] text-slate-400 font-sans uppercase bg-surface-lighter px-1.5 py-0.5 rounded whitespace-nowrap">
                              {link.region}
                            </span>
                          </div>
                        </td>

                        {/* Title & URL */}
                        <td className="py-3 px-4 max-w-md">
                          <p className="font-sans font-semibold text-slate-200 truncate" title={link.title}>
                            {link.title}
                          </p>
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="font-mono text-[11px] text-brand-400 hover:text-brand-300 truncate block mt-0.5 hover:underline"
                            title={link.url}
                          >
                            {link.url}
                          </a>
                        </td>

                        {/* Category */}
                        <td className="py-3 px-4 font-sans whitespace-nowrap">
                          <span className={cn('px-2.5 py-1 rounded-md border text-[11px] font-semibold whitespace-nowrap inline-flex items-center', getCategoryBadgeClass(link.category))}>
                            {link.category}
                          </span>
                        </td>

                        {/* Source Query */}
                        <td className="py-3 px-4 font-sans text-slate-400 text-[11px] truncate max-w-[180px] whitespace-nowrap" title={link.query_orig}>
                          {link.query_orig}
                        </td>

                        {/* Time */}
                        <td className="py-3 px-4 text-right text-slate-400 text-[11px] whitespace-nowrap font-mono">
                          {formatKyivDateTime(link.classified_at)}
                        </td>

                        {/* Action Link */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-brand-300 hover:bg-surface-lighter inline-flex items-center"
                            title="Открыть страницу"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </td>
                      </tr>

                      {/* Expandable Accordion Row: Snippet & HTML Page Tags */}
                      {isExpanded && (
                        <tr className="bg-surface-light/30 border-b border-surface-border">
                          <td colSpan={8} className="p-4 font-sans">
                            <div className="space-y-3 bg-surface p-4 rounded-xl border border-surface-border text-xs">
                              {/* Snippet */}
                              <div>
                                <span className="font-semibold text-slate-300 block mb-1">Сниппет из поисковой выдачи:</span>
                                <p className="text-slate-300 font-mono text-[11px] bg-surface-light p-2.5 rounded-lg border border-surface-border/60">
                                  {link.snippet || 'Сниппет отсутствует'}
                                </p>
                              </div>

                              {/* Page Tags & Metadata */}
                              <div>
                                <span className="font-semibold text-slate-300 block mb-1">Описание страницы по тегам (HTML metadata):</span>
                                <pre className="text-emerald-300/90 font-mono text-[11px] bg-slate-950 p-3 rounded-lg border border-surface-border overflow-x-auto whitespace-pre-wrap">
                                  {link.page_tags}
                                </pre>
                              </div>

                              <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-2 border-t border-surface-border/50">
                                <span>ID: #{link.id} • RawSiteID: #{link.raw_site_id}</span>
                                <span>Найдено: {formatKyivDateTime(link.found_at)}</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}

              {/* Bottom Skeletons on Keyset Loading */}
              {isLoadingMore && (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={`skel_${i}`}>
                    <td colSpan={8} className="py-4 px-4">
                      <div className="h-5 bg-surface-lighter rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Observer Target for Infinite Scroll */}
          <div ref={observerTarget} className="h-8" />
        </div>
      </Card>
    </div>
  );
};
