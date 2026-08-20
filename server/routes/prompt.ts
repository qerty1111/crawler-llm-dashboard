import { Router, Response } from 'express';
import { db } from '../db/store.js';
import { AuthenticatedRequest, authMiddleware } from '../middleware/auth.js';
import { PromptProfile, PromptBlocks } from '../types.js';

export const promptRouter = Router();

// Assembled prompt template generator
function assemblePrompt(stage: 1 | 2, blocks: PromptBlocks): string {
  const refSitesFormatted = blocks.reference_sites
    .map(r => `  - ${r.domain}: ${r.description}`)
    .join('\n');

  const categoriesFormatted = blocks.categories.join(', ');

  if (stage === 1) {
    return `### SYSTEM INSTRUCTIONS: STAGE 1 (RELEVANCE & FAST FILTER)
You are an expert hospitality tech research AI. Your goal is to evaluate whether the provided search result (title, snippet, URL) corresponds to a B2B SaaS hospitality technology vendor.

### 1. TARGET CRITERIA (WHAT WE ARE LOOKING FOR):
${blocks.target_description}

### 2. EXCLUSIONS (WHAT TO REJECT IMMEDIATELY):
${blocks.exclusions}

### 3. ALLOWED CATEGORIES:
[${categoriesFormatted}]

### 4. REFERENCE SITES (GOLD STANDARDS):
${refSitesFormatted}

### 5. OUTPUT FORMAT:
You MUST respond with a valid JSON object matching this exact schema:
{
  "s1_score": <integer 0-10>,
  "s1_category": "<one of the allowed categories or 'Unrelated'>",
  "s1_reasoning": "<concise explanation under 150 characters>"
}
NOTE: If s1_score < 6, the record will not proceed to deep Stage 2 evaluation.`;
  }

  return `### SYSTEM INSTRUCTIONS: STAGE 2 (DEEP CLASSIFICATION & VALUE SCORING)
You are a senior enterprise hotel software analyst. Evaluate the full page content, feature set, pricing and integration capabilities of the given hospitality vendor.

### 1. TARGET CRITERIA:
${blocks.target_description}

### 2. EXCLUSIONS:
${blocks.exclusions}

### 3. ALLOWED CATEGORIES:
[${categoriesFormatted}]

### 4. REFERENCE GOLD STANDARD VENDORS:
${refSitesFormatted}

### 5. SCORING GUIDELINES (0 to 10):
- 10: Perfect fit. Flagship enterprise PMS / Channel Manager / Direct Booking tech matching reference standards.
- 8-9: High quality B2B solution for hotels with clear SaaS product, pricing or demo, and direct integrations.
- 6-7: Relevant boutique or regional hospitality tool, but lacks extensive feature breadth or enterprise APIs.
- 4-5: Peripheral software (e.g. general POS, restaurant only, basic website builder).
- 0-3: Consumer travel OTA, travel blog, direct guest booking site, agency or non-software.

### 6. OUTPUT FORMAT:
Return ONLY a valid JSON object:
{
  "score": <integer 0-10>,
  "category": "<one of the allowed categories>",
  "reasoning": "<detailed 2-3 sentence technical justification>"
}`;
}

// GET /api/prompt/:stage
promptRouter.get('/:stage', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const stage = Number(req.params.stage) === 1 ? 1 : 2;
  const isClient = req.userRole === 'client';
  const targetUserId = isClient ? req.userId! : (req.query.user_id ? Number(req.query.user_id) : null);

  // Find profile: first check client-specific profile, then fallback to global default
  let profile = db.promptProfiles.find(p => p.stage === stage && p.owner_user_id === targetUserId);
  if (!profile) {
    profile = db.promptProfiles.find(p => p.stage === stage && p.owner_user_id === null);
  }

  if (!profile) {
    return res.status(404).json({ error: 'Профиль промпта не найден' });
  }

  const assembled = assemblePrompt(stage, profile.blocks);

  return res.json({
    profile,
    assembledPrompt: assembled,
    notice: 'Изменения применятся к ссылкам, оценённым после сохранения. Ранее оценённые ссылки не переоцениваются.',
  });
});

// PUT /api/prompt/:stage
promptRouter.put('/:stage', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const stage = Number(req.params.stage) === 1 ? 1 : 2;
  const isClient = req.userRole === 'client';
  const targetUserId = isClient ? req.userId! : (req.body.user_id ? Number(req.body.user_id) : null);

  const { target_description, exclusions, categories, reference_sites } = req.body;

  // Validation
  if (target_description && target_description.length > 1500) {
    return res.status(400).json({ error: 'Описание целевого продукта не должно превышать 1500 символов' });
  }
  if (exclusions && exclusions.length > 1500) {
    return res.status(400).json({ error: 'Список исключений не должен превышать 1500 символов' });
  }
  if (categories && Array.isArray(categories) && categories.length > 12) {
    return res.status(400).json({ error: 'Максимум 12 допустимых категорий' });
  }
  if (reference_sites && Array.isArray(reference_sites) && reference_sites.length > 30) {
    return res.status(400).json({ error: 'Максимум 30 эталонных сайтов' });
  }

  let profile = db.promptProfiles.find(p => p.stage === stage && p.owner_user_id === targetUserId);

  if (!profile) {
    // Clone from global default and create client profile
    const globalDefault = db.promptProfiles.find(p => p.stage === stage && p.owner_user_id === null)!;
    profile = {
      id: db.promptProfiles.length + 1,
      owner_user_id: targetUserId,
      stage,
      blocks: JSON.parse(JSON.stringify(globalDefault.blocks)),
      version: 1,
      updated_by: req.userId,
      updated_at: new Date().toISOString(),
    };
    db.promptProfiles.push(profile);
  }

  // Update blocks
  if (target_description !== undefined) profile.blocks.target_description = target_description.trim();
  if (exclusions !== undefined) profile.blocks.exclusions = exclusions.trim();
  if (categories !== undefined && Array.isArray(categories)) profile.blocks.categories = categories;
  if (reference_sites !== undefined && Array.isArray(reference_sites)) profile.blocks.reference_sites = reference_sites;

  profile.version += 1;
  profile.updated_by = req.userId;
  profile.updated_at = new Date().toISOString();

  // Save history
  db.promptHistory.unshift({
    id: db.promptHistory.length + 1,
    profile_id: profile.id,
    stage,
    blocks: JSON.parse(JSON.stringify(profile.blocks)),
    version: profile.version,
    actor_id: req.userId,
    actor_name: req.user?.login,
    created_at: new Date().toISOString(),
  });

  // Add audit log
  db.addAuditLog(
    req.userId,
    req.user?.login,
    'edit_prompt',
    'prompt_profiles',
    String(profile.id),
    { stage, version: profile.version },
    req.ip
  );

  const assembled = assemblePrompt(stage, profile.blocks);

  return res.json({
    profile,
    assembledPrompt: assembled,
    success: true,
    message: 'Профиль промпта успешно сохранен и передан скореру',
  });
});

// GET /api/prompt/:stage/history
promptRouter.get('/:stage/history', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const stage = Number(req.params.stage) === 1 ? 1 : 2;
  const isClient = req.userRole === 'client';
  const targetUserId = isClient ? req.userId! : (req.query.user_id ? Number(req.query.user_id) : null);

  const profile = db.promptProfiles.find(p => p.stage === stage && p.owner_user_id === targetUserId)
    || db.promptProfiles.find(p => p.stage === stage && p.owner_user_id === null);

  if (!profile) {
    return res.json({ history: [] });
  }

  const history = db.promptHistory.filter(h => h.profile_id === profile.id || h.stage === stage);
  return res.json({ history });
});
