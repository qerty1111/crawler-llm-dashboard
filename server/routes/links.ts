import { Router, Response } from 'express';
import { db } from '../db/store.js';
import { AuthenticatedRequest, authMiddleware } from '../middleware/auth.js';

export const linksRouter = Router();

// GET /api/links
linksRouter.get('/', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const isClient = req.userRole === 'client';
  const effectiveClientId = isClient ? req.userId! : (req.query.client_id ? Number(req.query.client_id) : 0);

  const threshold = req.query.threshold ? Number(req.query.threshold) : (req.userThreshold ?? 7);
  const minScore = req.query.min_score !== undefined ? Number(req.query.min_score) : threshold;
  const maxScore = req.query.max_score !== undefined ? Number(req.query.max_score) : 10;

  const projectId = req.query.project_id ? Number(req.query.project_id) : undefined;
  const queryId = req.query.query_id ? Number(req.query.query_id) : undefined;
  const domainFilter = req.query.domain ? String(req.query.domain).toLowerCase().trim() : undefined;
  const categoryFilter = req.query.category ? String(req.query.category).trim() : undefined;
  const regionFilter = req.query.region ? String(req.query.region).toLowerCase().trim() : undefined;
  const searchFilter = req.query.search ? String(req.query.search).toLowerCase().trim() : undefined;

  const fromTime = req.query.from ? new Date(req.query.from as string).getTime() : undefined;
  const toTime = req.query.to ? new Date(req.query.to as string).getTime() : undefined;

  // Keyset cursor: formatted as "ISO_DATE_id" (e.g. "2026-08-20T12:00:00.000Z_12345")
  const cursor = req.query.cursor ? String(req.query.cursor) : undefined;
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 50));

  let cursorDate: number | null = null;
  let cursorId: number | null = null;
  if (cursor) {
    const parts = cursor.split('_');
    if (parts.length === 2) {
      cursorDate = new Date(parts[0]).getTime();
      cursorId = Number(parts[1]);
    }
  }

  // Filter items
  const filtered = db.factClassified.filter(item => {
    // Client isolation
    if (effectiveClientId > 0 && item.owner_user_id !== effectiveClientId) {
      return false;
    }

    // Score filter
    if (item.score < minScore || item.score > maxScore) {
      return false;
    }

    // Project & Query
    if (projectId && item.project_id !== projectId) {
      return false;
    }
    if (queryId && item.query_id !== queryId) {
      return false;
    }

    // Time filter
    const classifiedTime = new Date(item.classified_at).getTime();
    if (fromTime && classifiedTime < fromTime) return false;
    if (toTime && classifiedTime > toTime) return false;

    // String filters
    if (domainFilter && !item.domain.toLowerCase().includes(domainFilter)) {
      return false;
    }
    if (categoryFilter && item.category !== categoryFilter) {
      return false;
    }
    if (regionFilter && item.region.toLowerCase() !== regionFilter) {
      return false;
    }
    if (searchFilter) {
      const matchUrl = item.url.toLowerCase().includes(searchFilter);
      const matchTitle = item.title.toLowerCase().includes(searchFilter);
      const matchSnippet = item.snippet.toLowerCase().includes(searchFilter);
      const matchTags = item.page_tags.toLowerCase().includes(searchFilter);
      const matchQuery = item.query_orig.toLowerCase().includes(searchFilter);
      if (!matchUrl && !matchTitle && !matchSnippet && !matchTags && !matchQuery) {
        return false;
      }
    }

    return true;
  });

  const totalCount = filtered.length;

  // Keyset pagination: items are already sorted by classified_at DESC, id DESC
  let paginated = filtered;
  if (cursorDate !== null && cursorId !== null) {
    paginated = filtered.filter(item => {
      const t = new Date(item.classified_at).getTime();
      if (t < cursorDate!) return true;
      if (t === cursorDate! && item.id < cursorId!) return true;
      return false;
    });
  }

  const items = paginated.slice(0, limit);
  const lastItem = items[items.length - 1];
  const nextCursor = (items.length === limit && lastItem) ? `${lastItem.classified_at}_${lastItem.id}` : null;

  return res.json({
    items,
    nextCursor,
    totalCount,
    limit,
    filters: {
      minScore,
      maxScore,
      projectId,
      queryId,
      domain: domainFilter,
      category: categoryFilter,
      region: regionFilter,
      search: searchFilter,
    },
  });
});
