import { Router, Response } from 'express';
import { db, REGIONS_LIST } from '../db/store.js';
import { AuthenticatedRequest, authMiddleware } from '../middleware/auth.js';
import { QueryRecord } from '../types.js';

export const queriesRouter = Router();

// GET /api/queries
queriesRouter.get('/', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const isClient = req.userRole === 'client';
  const effectiveClientId = isClient ? req.userId! : (req.query.client_id ? Number(req.query.client_id) : 0);
  const threshold = req.userThreshold ?? 7;

  const projectId = req.query.project_id ? Number(req.query.project_id) : undefined;
  const statusFilter = req.query.status ? String(req.query.status) : undefined;
  const search = req.query.search ? String(req.query.search).toLowerCase().trim() : undefined;

  let queriesList = db.queries.filter(q => {
    if (effectiveClientId > 0 && q.owner_user_id !== effectiveClientId) return false;
    if (projectId && q.project_id !== projectId) return false;
    if (statusFilter && q.status !== statusFilter) return false;
    if (search && !q.text_orig.toLowerCase().includes(search)) return false;
    return true;
  });

  const queriesWithStats = queriesList.map(q => {
    const project = db.projects.find(p => p.id === q.project_id);
    const owner = db.users.find(u => u.id === q.owner_user_id);
    const facts = db.factClassified.filter(f => f.query_id === q.id);
    const suitable = facts.filter(f => f.score >= threshold);

    return {
      ...q,
      project_name: project?.name || 'Без проекта',
      owner_login: owner?.login || 'unknown',
      owner_name: owner?.full_name || '',
      raw_found: Math.max(facts.length * 4, 180),
      classified: facts.length,
      suitable: suitable.length,
      conversion_pct: facts.length > 0 ? Math.round((suitable.length / facts.length) * 1000) / 10 : 0,
      regions_count: q.regions.length === 0 || q.regions.includes('wt-wt') ? 'Все (Global)' : `${q.regions.length} регионов`,
    };
  });

  return res.json({ queries: queriesWithStats, regionsList: REGIONS_LIST });
});

// GET /api/queries/:id
queriesRouter.get('/:id', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const query = db.queries.find(q => q.id === id);

  if (!query) {
    return res.status(404).json({ error: 'Запрос не найден' });
  }

  if (req.userRole === 'client' && query.owner_user_id !== req.userId) {
    return res.status(403).json({ error: 'Нет доступа к данному запросу' });
  }

  const threshold = req.userThreshold ?? 7;
  const project = db.projects.find(p => p.id === query.project_id);
  const owner = db.users.find(u => u.id === query.owner_user_id);
  const facts = db.factClassified.filter(f => f.query_id === query.id);
  const suitable = facts.filter(f => f.score >= threshold);

  // Region breakdown for this query
  const regionMap = new Map<string, { found: number; suitable: number }>();
  for (const r of query.regions.length > 0 ? query.regions : ['wt-wt']) {
    regionMap.set(r.toUpperCase(), { found: 0, suitable: 0 });
  }
  for (const f of facts) {
    const reg = f.region.toUpperCase();
    const cur = regionMap.get(reg) || { found: 0, suitable: 0 };
    cur.found += 1;
    if (f.score >= threshold) cur.suitable += 1;
    regionMap.set(reg, cur);
  }

  const regionBreakdown = Array.from(regionMap.entries()).map(([region, st]) => ({
    region,
    found: Math.max(st.found * 4, 25),
    classified: st.found,
    suitable: st.suitable,
    conversion_pct: st.found > 0 ? Math.round((st.suitable / st.found) * 1000) / 10 : 0,
  }));

  // Score distribution for this query (0..10)
  const scoreCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const f of facts) {
    if (f.score >= 0 && f.score <= 10) {
      scoreCounts[f.score]++;
    }
  }

  return res.json({
    query: {
      ...query,
      project_name: project?.name || 'Без проекта',
      owner_login: owner?.login || 'unknown',
      owner_name: owner?.full_name || '',
      raw_found: Math.max(facts.length * 4, 180),
      classified: facts.length,
      suitable: suitable.length,
      conversion_pct: facts.length > 0 ? Math.round((suitable.length / facts.length) * 1000) / 10 : 0,
    },
    regionBreakdown,
    scoreHistogram: scoreCounts.map((count, score) => ({
      score,
      count,
      isSuitable: score >= threshold,
    })),
    recentLinks: facts.slice(0, 20),
  });
});

// POST /api/queries
queriesRouter.post('/', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const { project_id, text_orig, regions } = req.body;

  if (!text_orig || !text_orig.trim()) {
    return res.status(400).json({ error: 'Текст поискового запроса обязателен' });
  }

  const pId = Number(project_id);
  const project = db.projects.find(p => p.id === pId);
  if (!project) {
    return res.status(400).json({ error: 'Указанный проект не существует' });
  }

  const targetUserId = req.userRole === 'client' ? req.userId! : project.owner_user_id;

  // Check unique (owner_user_id, text_orig)
  const duplicate = db.queries.some(q => q.owner_user_id === targetUserId && q.text_orig.toLowerCase() === text_orig.trim().toLowerCase());
  if (duplicate) {
    return res.status(400).json({ error: 'Такой запрос уже существует в ваших проектах' });
  }

  const cleanRegions = Array.isArray(regions) && regions.length > 0 ? regions : ['wt-wt'];

  const newQuery: QueryRecord = {
    id: db.getNextQueryId(),
    project_id: pId,
    owner_user_id: targetUserId,
    text_orig: text_orig.trim(),
    regions: cleanRegions,
    status: 'active',
    created_by: req.userId,
    created_at: new Date().toISOString(),
    first_seen_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
  };

  db.queries.unshift(newQuery);
  db.addAuditLog(req.userId, req.user?.login, 'create_query', 'query', String(newQuery.id), newQuery, req.ip);

  return res.status(201).json(newQuery);
});

// PATCH /api/queries/:id
queriesRouter.patch('/:id', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const query = db.queries.find(q => q.id === id);

  if (!query) {
    return res.status(404).json({ error: 'Запрос не найден' });
  }

  if (req.userRole === 'client' && query.owner_user_id !== req.userId) {
    return res.status(403).json({ error: 'Нет доступа к данному запросу' });
  }

  const { status, regions, project_id } = req.body;

  if (status !== undefined) {
    if (!['active', 'paused', 'done', 'stopped'].includes(status)) {
      return res.status(400).json({ error: 'Неверный статус запроса' });
    }
    query.status = status;
  }

  if (regions !== undefined && Array.isArray(regions)) {
    query.regions = regions;
  }

  if (project_id !== undefined) {
    const p = db.projects.find(x => x.id === Number(project_id));
    if (p) query.project_id = p.id;
  }

  db.addAuditLog(req.userId, req.user?.login, 'update_query', 'query', String(query.id), req.body, req.ip);

  return res.json(query);
});

// DELETE /api/queries/:id
queriesRouter.delete('/:id', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const queryIndex = db.queries.findIndex(q => q.id === id);

  if (queryIndex === -1) {
    return res.status(404).json({ error: 'Запрос не найден' });
  }

  const query = db.queries[queryIndex];
  if (req.userRole === 'client' && query.owner_user_id !== req.userId) {
    return res.status(403).json({ error: 'Нет доступа к данному запросу' });
  }

  db.queries.splice(queryIndex, 1);
  db.addAuditLog(req.userId, req.user?.login, 'delete_query', 'query', String(id), { text: query.text_orig }, req.ip);

  return res.json({ success: true });
});
