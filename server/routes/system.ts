import { Router, Response } from 'express';
import { db } from '../db/store.js';
import { AuthenticatedRequest, authMiddleware, requireRole } from '../middleware/auth.js';

export const systemRouter = Router();

// GET /api/system/health (Admin and Manager only)
systemRouter.get('/health', authMiddleware, requireRole(['admin', 'manager']), (req: AuthenticatedRequest, res: Response) => {
  const now = Date.now();
  const services = Array.from(db.serviceHealth.values()).map(s => {
    const lastRecordTime = new Date(s.last_record_at).getTime();
    const diffSec = Math.max(0, Math.floor((now - lastRecordTime) / 1000));
    const diffMin = Math.floor(diffSec / 60);

    let calculatedStatus: 'green' | 'yellow' | 'red' = 'green';
    if (diffMin >= 10 || s.state === 'down') {
      calculatedStatus = 'red';
    } else if (diffMin >= 2 || s.state === 'idle') {
      calculatedStatus = 'yellow';
    }

    const timeAgoStr = diffMin === 0 ? `${diffSec} с назад` : `${diffMin} мин назад`;

    return {
      ...s,
      calculatedStatus,
      timeAgoStr,
      secondsAgo: diffSec,
    };
  });

  // Calculate Queues
  const stage1Queue = 840 + Math.round(Math.random() * 50);
  const stage2Queue = 395 + Math.round(Math.random() * 30);
  const totalQueue = stage1Queue + stage2Queue;

  // Scorer lag: age of oldest unclassified record (e.g. 3m 42s)
  const lagSec = 222 + Math.round(Math.random() * 15);
  const lagFormatted = `${Math.floor(lagSec / 60)} мин ${lagSec % 60} с`;

  // Historical queue trend for the chart (last 12 hours)
  const queueHistory = [
    { time: '12ч назад', stage1: 1120, stage2: 520 },
    { time: '10ч назад', stage1: 1050, stage2: 480 },
    { time: '8ч назад', stage1: 980, stage2: 440 },
    { time: '6ч назад', stage1: 920, stage2: 410 },
    { time: '4ч назад', stage1: 890, stage2: 400 },
    { time: '2ч назад', stage1: 860, stage2: 395 },
    { time: 'Сейчас', stage1: stage1Queue, stage2: stage2Queue },
  ];

  return res.json({
    services,
    queues: {
      stage1: stage1Queue,
      stage2: stage2Queue,
      total: totalQueue,
      lagSec,
      lagFormatted,
      history: queueHistory,
    },
  });
});

// GET /api/system/host (Admin and Manager only)
systemRouter.get('/host', authMiddleware, requireRole(['admin', 'manager']), (req: AuthenticatedRequest, res: Response) => {
  const current = db.generateLiveHostMetrics();
  const history = db.hostMetricsHistory.slice(-36); // last 3 hours in 5-min intervals

  return res.json({
    current,
    history,
  });
});

// GET /api/system/ollama
systemRouter.get('/ollama', authMiddleware, requireRole(['admin', 'manager']), (req: AuthenticatedRequest, res: Response) => {
  return res.json({
    instances: db.ollamaInstances,
    totalInstances: db.ollamaInstances.length,
    healthyCount: db.ollamaInstances.filter(o => o.status === 'healthy').length,
  });
});

// POST /api/system/control (Admin only)
systemRouter.post('/control', authMiddleware, requireRole(['admin']), (req: AuthenticatedRequest, res: Response) => {
  const { action, service } = req.body;

  if (!['start', 'stop', 'restart', 'reload_config'].includes(action)) {
    return res.status(400).json({ error: 'Неизвестная команда управления' });
  }

  if (action === 'reload_config') {
    db.addAuditLog(req.userId, req.user?.login, 'reload_config', 'system', 'all', { message: 'Конфиг промпта и порогов перечитан службами' }, req.ip);
    return res.json({ success: true, message: 'Конфигурация успешно перезагружена на всех воркерах' });
  }

  const s = db.serviceHealth.get(service);
  if (!s) {
    return res.status(404).json({ error: 'Служба не найдена' });
  }

  if (action === 'start') {
    s.state = 'running';
    s.last_record_at = new Date().toISOString();
  } else if (action === 'stop') {
    s.state = 'down';
  } else if (action === 'restart') {
    s.state = 'running';
    s.last_record_at = new Date().toISOString();
  }

  db.addAuditLog(req.userId, req.user?.login, `${action}_service`, 'service', service, { state: s.state }, req.ip);

  return res.json({
    success: true,
    service: s,
    message: `Команда ${action} для службы ${s.name} успешно выполнена`,
  });
});
