import { Request, Response, NextFunction } from 'express';
import { db } from '../db/store.js';
import { User, UserRole } from '../types.js';

export interface AuthenticatedRequest extends Request {
  user?: User;
  userId?: number;
  userRole?: UserRole;
  userThreshold?: number;
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Check Authorization header or cookie
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.token;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : cookieToken;

  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const session = db.sessions.find(s => s.token === token && new Date(s.expires_at) > new Date());
  if (!session) {
    return res.status(401).json({ error: 'Сессия истекла или недействительна' });
  }

  const user = db.users.find(u => u.id === session.user_id && u.is_active);
  if (!user) {
    return res.status(401).json({ error: 'Пользователь заблокирован или не найден' });
  }

  // Extend session on activity (12 hours)
  session.expires_at = new Date(Date.now() + 12 * 3600 * 1000).toISOString();

  const settings = db.userSettings.get(user.id);
  const threshold = settings?.score_threshold ?? 7;

  req.user = user;
  req.userId = user.id;
  req.userRole = user.role;
  req.userThreshold = threshold;

  next();
}

export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.userRole || !allowedRoles.includes(req.userRole)) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }
    next();
  };
}
