import { Router, Response } from 'express';
import { db } from '../db/store.js';
import { AuthenticatedRequest, authMiddleware } from '../middleware/auth.js';

export const settingsRouter = Router();

// GET /api/settings/threshold
settingsRouter.get('/threshold', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const targetUserId = (req.userRole !== 'client' && req.query.user_id) ? Number(req.query.user_id) : req.userId!;
  const settings = db.userSettings.get(targetUserId);

  return res.json({
    user_id: targetUserId,
    score_threshold: settings?.score_threshold ?? 7,
    min_available: 6, // S1_MIN_SCORE
    max_available: 10,
    warnings: {
      under7: 'При таком пороге в выдачу попадёт много нерелевантных сайтов',
      is10: 'При таком пороге результатов будет крайне мало',
      notice: 'Порог не влияет на работу софта и расход бюджета — это фильтр отображения.',
    },
  });
});

// PUT /api/settings/threshold
settingsRouter.put('/threshold', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const { score_threshold } = req.body;
  const targetUserId = (req.userRole !== 'client' && req.body.user_id) ? Number(req.body.user_id) : req.userId!;

  const newThreshold = Number(score_threshold);
  if (isNaN(newThreshold) || newThreshold < 6 || newThreshold > 10) {
    return res.status(400).json({ error: 'Порог оценки должен быть целым числом от 6 до 10' });
  }

  const prevSettings = db.userSettings.get(targetUserId);
  const oldVal = prevSettings?.score_threshold ?? 7;

  db.userSettings.set(targetUserId, {
    user_id: targetUserId,
    score_threshold: newThreshold,
    updated_at: new Date().toISOString(),
  });

  db.addAuditLog(
    req.userId,
    req.user?.login,
    'change_threshold',
    'user_settings',
    String(targetUserId),
    { old_threshold: oldVal, new_threshold: newThreshold },
    req.ip
  );

  return res.json({
    user_id: targetUserId,
    score_threshold: newThreshold,
    success: true,
  });
});
