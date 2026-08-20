import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Project } from '../types';
import { Card, Button, Input, Modal, Badge } from '../components/ui';
import { FolderKanban, Plus, Search, Archive, ArrowRight, Edit3, Trash2, Globe } from 'lucide-react';
import { formatNumber, formatKyivDateOnly } from '../utils/formatters';

export const ProjectsPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const navigate = useNavigate();

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      const data = await api.getProjects();
      setProjects(data.projects || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      await api.createProject({ name: name.trim(), description: description.trim() });
      setName('');
      setDescription('');
      setIsCreateOpen(false);
      loadProjects();
    } catch (err: any) {
      alert(err.message || 'Ошибка создания проекта');
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject || !name.trim()) return;

    try {
      await api.updateProject(editingProject.id, { name: name.trim(), description: description.trim() });
      setIsEditOpen(false);
      setEditingProject(null);
      loadProjects();
    } catch (err: any) {
      alert(err.message || 'Ошибка обновления проекта');
    }
  };

  const toggleArchive = async (project: Project) => {
    try {
      await api.updateProject(project.id, { is_archived: !project.is_archived });
      loadProjects();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const openEditModal = (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProject(project);
    setName(project.name);
    setDescription(project.description || '');
    setIsEditOpen(true);
  };

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.description && p.description.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <FolderKanban className="w-6 h-6 text-brand-400" />
            <span>Проекты клиента</span>
          </h2>
          <p className="text-xs text-slate-400">Группировка поисковых запросов и результатов по тематическим направлениям</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Поиск по проектам..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-surface-light border border-surface-border rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500"
            />
          </div>
          <Button variant="primary" size="sm" onClick={() => { setName(''); setDescription(''); setIsCreateOpen(true); }} className="gap-2 text-xs">
            <Plus className="w-4 h-4" />
            Новый проект
          </Button>
        </div>
      </div>

      {/* Projects Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-56 bg-surface-lighter/50 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <Card className="p-12 text-center text-slate-500">
          <FolderKanban className="w-12 h-12 mx-auto mb-3 text-slate-600" />
          <p className="text-base font-semibold text-slate-300">Проектов не найдено</p>
          <p className="text-xs text-slate-500 mt-1">Создайте новый проект для группировки поисковых запросов</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <Card
              key={project.id}
              onClick={() => navigate(`/queries?project_id=${project.id}`)}
              className="p-5 flex flex-col justify-between hover:border-brand-500/50 cursor-pointer transition-all hover:scale-[1.01] group"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 font-bold text-xs">
                      #{project.id}
                    </span>
                    <h3 className="font-bold text-sm text-white group-hover:text-brand-300 transition-colors leading-tight">
                      {project.name}
                    </h3>
                  </div>

                  <Badge variant={project.is_archived ? 'outline' : 'success'} size="sm">
                    {project.is_archived ? 'Архив' : 'Активен'}
                  </Badge>
                </div>

                <p className="text-xs text-slate-400 line-clamp-2 mb-4">
                  {project.description || 'Описание не указано'}
                </p>
              </div>

              {/* Stats Box */}
              <div className="pt-3 border-t border-surface-border/60 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center bg-surface-light/80 p-2.5 rounded-xl font-mono">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase">Запросов</div>
                    <div className="font-bold text-white text-xs mt-0.5">{project.query_count || 0}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase">Оценено</div>
                    <div className="font-bold text-slate-300 text-xs mt-0.5">{formatNumber(project.classified)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase">Подходящих</div>
                    <div className="font-bold text-emerald-400 text-xs mt-0.5">{formatNumber(project.suitable)}</div>
                  </div>
                </div>

                {/* Footer buttons */}
                <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                  <span className="font-mono text-[10px]">Создан: {formatKyivDateOnly(project.created_at)}</span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => openEditModal(project, e)}
                      title="Редактировать"
                      className="p-1 rounded-lg hover:bg-surface-lighter hover:text-white transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleArchive(project); }}
                      title={project.is_archived ? 'Разархивировать' : 'В архив'}
                      className="p-1 rounded-lg hover:bg-surface-lighter hover:text-amber-300 transition-colors"
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-brand-400 flex items-center font-semibold text-xs ml-1 group-hover:translate-x-0.5 transition-transform">
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Создание нового проекта">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Название проекта"
            placeholder="Например: Отельные PMS системы EU"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">Описание</label>
            <textarea
              rows={3}
              placeholder="Краткое описание целей и тематики проекта..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-surface-light border border-surface-border rounded-lg p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-colors resize-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" type="button" onClick={() => setIsCreateOpen(false)}>Отмена</Button>
            <Button variant="primary" type="submit">Создать проект</Button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title="Редактирование проекта">
        <form onSubmit={handleEdit} className="space-y-4">
          <Input
            label="Название проекта"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">Описание</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-surface-light border border-surface-border rounded-lg p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-colors resize-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" type="button" onClick={() => setIsEditOpen(false)}>Отмена</Button>
            <Button variant="primary" type="submit">Сохранить</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
