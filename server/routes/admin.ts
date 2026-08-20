import { Router, Response } from 'express';
import { db } from '../db/store.js';
import { AuthenticatedRequest, authMiddleware, requireRole } from '../middleware/auth.js';
import { User } from '../types.js';

export const adminRouter = Router();

// GET /api/users (Admin and Manager)
adminRouter.get('/users', authMiddleware, requireRole(['admin', 'manager']), (req: AuthenticatedRequest, res: Response) => {
  const usersWithDetails = db.users.map(u => {
    const budget = db.budgets.get(u.id);
    const settings = db.userSettings.get(u.id);
    const queries = db.queries.filter(q => q.owner_user_id === u.id);
    const activeQueries = queries.filter(q => q.status === 'active');

    return {
      id: u.id,
      login: u.login,
      full_name: u.full_name,
      role: u.role,
      is_active: u.is_active,
      created_at: u.created_at,
      last_login_at: u.last_login_at,
      score_threshold: settings?.score_threshold ?? 7,
      queries_count: queries.length,
      active_queries_count: activeQueries.length,
      budget: budget ? {
        raw_limit: budget.raw_limit,
        raw_used: budget.raw_used,
        raw_pct: budget.raw_limit > 0 ? Math.round((budget.raw_used / budget.raw_limit) * 1000) / 10 : 0,
        llm_limit: budget.llm_limit,
        llm_used: budget.llm_used,
        llm_pct: budget.llm_limit > 0 ? Math.round((budget.llm_used / budget.llm_limit) * 1000) / 10 : 0,
      } : null,
    };
  });

  return res.json({ users: usersWithDetails });
});

// POST /api/users (Admin and Manager)
adminRouter.post('/users', authMiddleware, requireRole(['admin', 'manager']), (req: AuthenticatedRequest, res: Response) => {
  const { login, password, full_name, role, raw_limit, llm_limit } = req.body;

  if (!login || !password || !full_name || !role) {
    return res.status(400).json({ error: 'Все поля обязательны для заполнения' });
  }

  // Manager cannot create admin or manager
  if (req.userRole === 'manager' && (role === 'admin' || role === 'manager')) {
    return res.status(403).json({ error: 'Менеджер может создавать только аккаунты клиентов' });
  }

  if (db.users.some(u => u.login.toLowerCase() === login.trim().toLowerCase())) {
    return res.status(400).json({ error: 'Пользователь с таким логином уже существует' });
  }

  const newUser: User = {
    id: db.users.length + 1,
    login: login.trim(),
    password_hash: 'mock_hash',
    full_name: full_name.trim(),
    role: role,
    is_active: true,
    created_by: req.userId,
    created_at: new Date().toISOString(),
  };

  db.users.push(newUser);
  db.userSettings.set(newUser.id, {
    user_id: newUser.id,
    score_threshold: 7,
    updated_at: new Date().toISOString(),
  });

  const rawLim = Number(raw_limit) || 100000;
  const llmLim = Number(llm_limit) || 80000;

  db.budgets.set(newUser.id, {
    user_id: newUser.id,
    raw_limit: rawLim,
    llm_limit: llmLim,
    raw_used: 0,
    llm_used: 0,
    updated_at: new Date().toISOString(),
  });

  db.budgetLedger.push({
    id: db.getNextLedgerId(),
    user_id: newUser.id,
    delta_raw: rawLim,
    delta_llm: llmLim,
    reason: 'topup',
    actor_id: req.userId,
    actor_name: req.user?.login,
    created_at: new Date().toISOString(),
  });

  db.addAuditLog(req.userId, req.user?.login, 'create_user', 'user', String(newUser.id), { login: newUser.login, role: newUser.role }, req.ip);

  return res.status(201).json(newUser);
});

// PATCH /api/users/:id
adminRouter.patch('/users/:id', authMiddleware, requireRole(['admin', 'manager']), (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const user = db.users.find(u => u.id === id);

  if (!user) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }

  // Manager cannot edit admin or manager
  if (req.userRole === 'manager' && (user.role === 'admin' || user.role === 'manager')) {
    return res.status(403).json({ error: 'Недостаточно прав для редактирования данного пользователя' });
  }

  const { full_name, is_active, role, password, score_threshold } = req.body;

  if (full_name !== undefined) user.full_name = full_name.trim();
  if (is_active !== undefined) user.is_active = Boolean(is_active);
  if (role !== undefined && req.userRole === 'admin') user.role = role;
  if (score_threshold !== undefined) {
    const s = db.userSettings.get(user.id);
    if (s) s.score_threshold = Number(score_threshold);
  }

  db.addAuditLog(req.userId, req.user?.login, 'update_user', 'user', String(user.id), req.body, req.ip);

  return res.json(user);
});

// POST /api/users/:id/budget (Admin only)
adminRouter.post('/users/:id/budget', authMiddleware, requireRole(['admin']), (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const user = db.users.find(u => u.id === id);

  if (!user) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }

  const { delta_raw, delta_llm, reason, raw_limit, llm_limit } = req.body;

  let budget = db.budgets.get(id);
  if (!budget) {
    budget = {
      user_id: id,
      raw_limit: 0,
      llm_limit: 0,
      raw_used: 0,
      llm_used: 0,
      updated_at: new Date().toISOString(),
    };
    db.budgets.set(id, budget);
  }

  const oldState = { ...budget };

  if (raw_limit !== undefined) {
    budget.raw_limit = Number(raw_limit);
  } else if (delta_raw !== undefined) {
    budget.raw_limit += Number(delta_raw);
  }

  if (llm_limit !== undefined) {
    budget.llm_limit = Number(llm_limit);
  } else if (delta_llm !== undefined) {
    budget.llm_limit += Number(delta_llm);
  }

  budget.updated_at = new Date().toISOString();

  // Record ledger
  db.budgetLedger.push({
    id: db.getNextLedgerId(),
    user_id: id,
    delta_raw: delta_raw !== undefined ? Number(delta_raw) : (budget.raw_limit - oldState.raw_limit),
    delta_llm: delta_llm !== undefined ? Number(delta_llm) : (budget.llm_limit - oldState.llm_limit),
    reason: (reason as any) || 'topup',
    actor_id: req.userId,
    actor_name: req.user?.login,
    created_at: new Date().toISOString(),
  });

  // Record audit log
  db.addAuditLog(
    req.userId,
    req.user?.login,
    'topup_budget',
    'user',
    String(id),
    { before: oldState, after: budget, reason },
    req.ip
  );

  return res.json({
    budget,
    success: true,
    message: 'Бюджет успешно обновлен',
  });
});

// GET /api/audit (Admin only)
adminRouter.get('/audit', authMiddleware, requireRole(['admin']), (req: AuthenticatedRequest, res: Response) => {
  const actorFilter = req.query.actor ? String(req.query.actor).toLowerCase() : undefined;
  const actionFilter = req.query.action ? String(req.query.action) : undefined;
  const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 100));

  let logs = db.auditLogs.filter(l => {
    if (actorFilter && !l.actor_name?.toLowerCase().includes(actorFilter)) return false;
    if (actionFilter && l.action !== actionFilter) return false;
    return true;
  });

  return res.json({
    logs: logs.slice(0, limit),
    totalCount: logs.length,
  });
});
