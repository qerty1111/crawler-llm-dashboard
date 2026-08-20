import { Router, Response } from 'express';
import { db } from '../db/store.js';
import { AuthenticatedRequest, authMiddleware } from '../middleware/auth.js';

export const projectsRouter = Router();

// GET /api/projects
projectsRouter.get('/', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const isClient = req.userRole === 'client';
  const effectiveClientId = isClient ? req.userId! : (req.query.client_id ? Number(req.query.client_id) : 0);
  const threshold = req.userThreshold ?? 7;

  const projectsList = db.projects.filter(p => {
    if (effectiveClientId > 0 && p.owner_user_id !== effectiveClientId) {
      return false;
    }
    return true;
  });

  const projectsWithStats = projectsList.map(project => {
    const owner = db.users.find(u => u.id === project.owner_user_id);
    const queries = db.queries.filter(q => q.project_id === project.id);
    const facts = db.factClassified.filter(f => f.project_id === project.id);
    const suitable = facts.filter(f => f.score >= threshold);

    return {
      ...project,
      owner_login: owner?.login || 'unknown',
      owner_name: owner?.full_name || '',
      query_count: queries.length,
      active_query_count: queries.filter(q => q.status === 'active').length,
      raw_found: Math.max(facts.length * 4, queries.length * 240),
      classified: facts.length,
      suitable: suitable.length,
      conversion_pct: facts.length > 0 ? Math.round((suitable.length / facts.length) * 1000) / 10 : 0,
    };
  });

  return res.json({ projects: projectsWithStats });
});

// POST /api/projects
projectsRouter.post('/', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const { name, description } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Название проекта обязательно' });
  }

  const targetUserId = req.userRole === 'client' ? req.userId! : (req.body.owner_user_id ? Number(req.body.owner_user_id) : req.userId!);

  const newProject = {
    id: db.getNextProjectId(),
    owner_user_id: targetUserId,
    name: name.trim(),
    description: description ? description.trim() : '',
    is_archived: false,
    created_at: new Date().toISOString(),
  };

  db.projects.unshift(newProject);
  db.addAuditLog(req.userId, req.user?.login, 'create_project', 'project', String(newProject.id), newProject, req.ip);

  return res.status(201).json(newProject);
});

// PATCH /api/projects/:id
projectsRouter.patch('/:id', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const project = db.projects.find(p => p.id === id);

  if (!project) {
    return res.status(404).json({ error: 'Проект не найден' });
  }

  if (req.userRole === 'client' && project.owner_user_id !== req.userId) {
    return res.status(403).json({ error: 'Нет доступа к данному проекту' });
  }

  const { name, description, is_archived } = req.body;
  if (name !== undefined) project.name = name.trim();
  if (description !== undefined) project.description = description.trim();
  if (is_archived !== undefined) project.is_archived = Boolean(is_archived);

  db.addAuditLog(req.userId, req.user?.login, 'update_project', 'project', String(project.id), req.body, req.ip);

  return res.json(project);
});

// DELETE /api/projects/:id
projectsRouter.delete('/:id', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const projectIndex = db.projects.findIndex(p => p.id === id);

  if (projectIndex === -1) {
    return res.status(404).json({ error: 'Проект не найден' });
  }

  const project = db.projects[projectIndex];
  if (req.userRole === 'client' && project.owner_user_id !== req.userId) {
    return res.status(403).json({ error: 'Нет доступа к данному проекту' });
  }

  // Check if has queries
  const hasQueries = db.queries.some(q => q.project_id === id && q.status === 'active');
  if (hasQueries) {
    return res.status(400).json({ error: 'Нельзя удалить проект с активными запросами. Сначала остановите их.' });
  }

  db.projects.splice(projectIndex, 1);
  db.addAuditLog(req.userId, req.user?.login, 'delete_project', 'project', String(id), { name: project.name }, req.ip);

  return res.json({ success: true });
});
