import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { QueryItem, Project } from '../types';
import { Card, Button, Input, Select, Modal, Badge, cn } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { Search, Plus, Play, Pause, Trash2, ExternalLink, Globe, ArrowUpDown, Filter, Eye } from 'lucide-react';
import { formatNumber, formatKyivDateTime } from '../utils/formatters';
import { getStatusBadgeClass } from '../utils/colors';

export const QueriesPage: React.FC = () => {
  const [queries, setQueries] = useState<QueryItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [regionsList, setRegionsList] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [searchParams, setSearchParams] = useSearchParams();
  const projectFilter = searchParams.get('project_id') || '';
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<keyof QueryItem>('id');
  const [sortAsc, setSortAsc] = useState(false);

  // Add query modal state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newProjectId, setNewProjectId] = useState('');
  const [newText, setNewText] = useState('');
  const [selectedRegions, setSelectedRegions] = useState<string[]>(['wt-wt']);

  const { role } = useAuth();
  const navigate = useNavigate();

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [queriesRes, projectsRes] = await Promise.all([
        api.getQueries({
          project_id: projectFilter || undefined,
          status: statusFilter || undefined,
          search: searchQuery || undefined,
        }),
        api.getProjects(),
      ]);
      setQueries(queriesRes.queries || []);
      setRegionsList(queriesRes.regionsList || []);
      setProjects(projectsRes.projects || []);
      if (projectsRes.projects.length > 0 && !newProjectId) {
        setNewProjectId(String(projectsRes.projects[0].id));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [projectFilter, statusFilter]);

  const handleAddQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim() || !newProjectId) return;

    try {
      await api.createQuery({
        project_id: Number(newProjectId),
        text_orig: newText.trim(),
        regions: selectedRegions,
      });
      setNewText('');
      setSelectedRegions(['wt-wt']);
      setIsAddOpen(false);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Ошибка добавления запроса');
    }
  };

  const handleToggleStatus = async (query: QueryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus = query.status === 'active' ? 'paused' : 'active';
    try {
      await api.updateQuery(query.id, { status: newStatus });
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (query: QueryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Вы уверены, что хотите снять с обхода запрос: "${query.text_orig}"?`)) return;

    try {
      await api.deleteQuery(query.id);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const toggleRegion = (r: string) => {
    if (r === 'wt-wt') {
      setSelectedRegions(['wt-wt']);
      return;
    }
    const filtered = selectedRegions.filter(x => x !== 'wt-wt');
    if (filtered.includes(r)) {
      const next = filtered.filter(x => x !== r);
      setSelectedRegions(next.length === 0 ? ['wt-wt'] : next);
    } else {
      setSelectedRegions([...filtered, r]);
    }
  };

  const handleSort = (field: keyof QueryItem) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const sortedQueries = [...queries].sort((a: any, b: any) => {
    const valA = a[sortField] ?? 0;
    const valB = b[sortField] ?? 0;
    if (typeof valA === 'string') {
      return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    return sortAsc ? valA - valB : valB - valA;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Search className="w-6 h-6 text-brand-400" />
            <span>Поисковые запросы</span>
          </h2>
          <p className="text-xs text-slate-400">Управление запросами парсера, целевыми регионами и статусами обхода</p>
        </div>

        <Button variant="primary" size="sm" onClick={() => setIsAddOpen(true)} className="gap-2 text-xs">
          <Plus className="w-4 h-4" />
          Добавить запрос
        </Button>
      </div>

      {/* Filters Bar */}
      <Card className="p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative w-72">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Поиск по тексту запроса..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadData()}
              className="w-full bg-surface-light border border-surface-border rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500"
            />
          </div>

          {/* Project Filter */}
          <select
            value={projectFilter}
            onChange={(e) => {
              if (e.target.value) {
                setSearchParams({ project_id: e.target.value });
              } else {
                setSearchParams({});
              }
            }}
            className="bg-surface-light border border-surface-border rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
          >
            <option value="">Все проекты</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-surface-light border border-surface-border rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
          >
            <option value="">Все статусы</option>
            <option value="active">Активен (В обходе)</option>
            <option value="paused">На паузе</option>
            <option value="stopped">Остановлен</option>
          </select>
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Всего запросов: <span className="font-bold text-white">{sortedQueries.length}</span>
        </div>
      </Card>

      {/* Queries Table */}
      <Card className="p-0 overflow-hidden border-surface-border">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-light border-b border-surface-border text-slate-400 select-none">
              <tr>
                <th className="py-3 px-4 font-semibold w-12 cursor-pointer" onClick={() => handleSort('id')}>
                  <span className="flex items-center gap-1"># <ArrowUpDown className="w-3 h-3" /></span>
                </th>
                <th className="py-3 px-4 font-semibold cursor-pointer" onClick={() => handleSort('text_orig')}>
                  <span className="flex items-center gap-1">Текст запроса <ArrowUpDown className="w-3 h-3" /></span>
                </th>
                <th className="py-3 px-4 font-semibold">Проект</th>
                {(role === 'admin' || role === 'manager') && (
                  <th className="py-3 px-4 font-semibold">Клиент</th>
                )}
                <th className="py-3 px-4 font-semibold">Регионы</th>
                <th className="py-3 px-4 font-semibold cursor-pointer" onClick={() => handleSort('status')}>
                  <span className="flex items-center gap-1">Статус <ArrowUpDown className="w-3 h-3" /></span>
                </th>
                <th className="py-3 px-4 font-semibold text-right cursor-pointer" onClick={() => handleSort('raw_found')}>
                  <span className="flex items-center justify-end gap-1">Найдено <ArrowUpDown className="w-3 h-3" /></span>
                </th>
                <th className="py-3 px-4 font-semibold text-right cursor-pointer" onClick={() => handleSort('classified')}>
                  <span className="flex items-center justify-end gap-1">Оценено <ArrowUpDown className="w-3 h-3" /></span>
                </th>
                <th className="py-3 px-4 font-semibold text-right cursor-pointer" onClick={() => handleSort('suitable')}>
                  <span className="flex items-center justify-end gap-1">Подходящих <ArrowUpDown className="w-3 h-3" /></span>
                </th>
                <th className="py-3 px-4 font-semibold text-right cursor-pointer" onClick={() => handleSort('conversion_pct')}>
                  <span className="flex items-center justify-end gap-1">Конверсия <ArrowUpDown className="w-3 h-3" /></span>
                </th>
                <th className="py-3 px-4 font-semibold text-right">Действия</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-surface-border/40 font-mono">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={11} className="py-4 px-4">
                      <div className="h-5 bg-surface-lighter rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : sortedQueries.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500 font-sans">
                    Запросов не найдено
                  </td>
                </tr>
              ) : (
                sortedQueries.map((q) => (
                  <tr
                    key={q.id}
                    onClick={() => navigate(`/queries/${q.id}`)}
                    className="hover:bg-surface-light/60 transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4 text-slate-500 font-bold">#{q.id}</td>
                    <td className="py-3 px-4 font-sans font-semibold text-slate-100 max-w-sm truncate" title={q.text_orig}>
                      {q.text_orig}
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-400 text-[11px] truncate max-w-[130px]">
                      {q.project_name}
                    </td>
                    {(role === 'admin' || role === 'manager') && (
                      <td className="py-3 px-4 font-sans text-brand-300 text-[11px] truncate max-w-[120px]">
                        @{q.owner_login}
                      </td>
                    )}
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-300 bg-surface-lighter px-2 py-0.5 rounded-md font-sans">
                        <Globe className="w-3 h-3 text-slate-400" />
                        {q.regions_count}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-sans">
                      <span className={cn('px-2 py-0.5 rounded-md border text-[11px] font-semibold', getStatusBadgeClass(q.status))}>
                        {q.status === 'active' ? 'Активен' : q.status === 'paused' ? 'Пауза' : q.status === 'done' ? 'Завершен' : 'Остановлен'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-400">{formatNumber(q.raw_found)}</td>
                    <td className="py-3 px-4 text-right text-slate-300">{formatNumber(q.classified)}</td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-400">{formatNumber(q.suitable)}</td>
                    <td className="py-3 px-4 text-right text-slate-200 font-semibold">{q.conversion_pct}%</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 font-sans">
                        <button
                          onClick={(e) => handleToggleStatus(q, e)}
                          title={q.status === 'active' ? 'Поставить на паузу' : 'Возобновить'}
                          className="p-1.5 rounded-lg bg-surface-lighter hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                        >
                          {q.status === 'active' ? <Pause className="w-3.5 h-3.5 text-amber-400" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
                        </button>
                        <button
                          onClick={(e) => handleDelete(q, e)}
                          title="Снять с обхода"
                          className="p-1.5 rounded-lg bg-surface-lighter hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Query Modal */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Добавление нового запроса" maxWidth="lg">
        <form onSubmit={handleAddQuery} className="space-y-4">
          <Select
            label="Проект"
            value={newProjectId}
            onChange={(e) => setNewProjectId(e.target.value)}
            required
          >
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>

          <Input
            label="Оригинальный запрос (английский)"
            placeholder="Например: best hotel property management system cloud"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            required
            autoFocus
          />

          {/* Region Chips Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Целевые регионы поиска
              </label>
              <span className="text-[11px] text-slate-400 font-mono">
                Выбрано: {selectedRegions.includes('wt-wt') ? 'Все (Global)' : `${selectedRegions.length} стран`}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-surface-light rounded-xl border border-surface-border">
              <button
                type="button"
                onClick={() => setSelectedRegions(['wt-wt'])}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-mono font-bold uppercase transition-all',
                  selectedRegions.includes('wt-wt')
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-surface-lighter text-slate-400 hover:text-white'
                )}
              >
                Global (wt-wt)
              </button>

              {regionsList.filter(r => r !== 'wt-wt').map(r => {
                const isSelected = selectedRegions.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleRegion(r)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs font-mono font-bold uppercase transition-all',
                      isSelected
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'bg-surface-lighter text-slate-400 hover:text-white'
                    )}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" type="button" onClick={() => setIsAddOpen(false)}>Отмена</Button>
            <Button variant="primary" type="submit">Добавить в парсер</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
