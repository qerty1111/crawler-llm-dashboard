import { Router, Response } from 'express';
import { db } from '../db/store.js';
import { AuthenticatedRequest, authMiddleware } from '../middleware/auth.js';

export const exportRouter = Router();

function formatKyivDate(isoDate: string): string {
  const d = new Date(isoDate);
  // Format as YYYY-MM-DD HH:MM:SS in Europe/Kyiv
  return d.toLocaleString('sv-SE', { timeZone: 'Europe/Kyiv' }).replace('T', ' ');
}

function escapeCsvField(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val).replace(/"/g, '""');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str}"`;
  }
  return str;
}

// POST /api/export
exportRouter.post('/', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const isClient = req.userRole === 'client';
  const effectiveClientId = isClient ? req.userId! : (req.body.client_id ? Number(req.body.client_id) : 0);

  const {
    mode, // 'filtered' | 'all'
    min_score,
    max_score,
    project_id,
    query_id,
    domain,
    category,
    region,
    search,
    from,
    to,
  } = req.body;

  const threshold = req.userThreshold ?? 7;
  const filterMinScore = min_score !== undefined ? Number(min_score) : (mode === 'all' ? 0 : threshold);
  const filterMaxScore = max_score !== undefined ? Number(max_score) : 10;

  const fromTime = from ? new Date(from).getTime() : undefined;
  const toTime = to ? new Date(to).getTime() : undefined;

  let items = db.factClassified.filter(item => {
    if (effectiveClientId > 0 && item.owner_user_id !== effectiveClientId) {
      return false;
    }

    if (mode === 'filtered') {
      if (item.score < filterMinScore || item.score > filterMaxScore) return false;
      if (project_id && item.project_id !== Number(project_id)) return false;
      if (query_id && item.query_id !== Number(query_id)) return false;
      if (domain && !item.domain.toLowerCase().includes(String(domain).toLowerCase())) return false;
      if (category && item.category !== category) return false;
      if (region && item.region.toLowerCase() !== String(region).toLowerCase()) return false;
      if (search && !item.url.toLowerCase().includes(String(search).toLowerCase()) && !item.title.toLowerCase().includes(String(search).toLowerCase())) return false;

      const t = new Date(item.classified_at).getTime();
      if (fromTime && t < fromTime) return false;
      if (toTime && t > toTime) return false;
    } else {
      // mode === 'all': export all data for this client passing their base threshold
      if (item.score < threshold) return false;
    }

    return true;
  });

  // CSV Headers
  const headers = [
    'url',
    'domain',
    'title',
    'query_orig',
    'query_sent',
    'region',
    'category',
    'score',
    'found_at',
    'classified_at',
    'page_tags',
  ];

  // UTF-8 BOM
  const BOM = '\uFEFF';
  const csvRows = [headers.join(',')];

  for (const item of items) {
    const row = [
      escapeCsvField(item.url),
      escapeCsvField(item.domain),
      escapeCsvField(item.title),
      escapeCsvField(item.query_orig),
      escapeCsvField(item.query_sent),
      escapeCsvField(item.region),
      escapeCsvField(item.category),
      escapeCsvField(item.score),
      escapeCsvField(formatKyivDate(item.found_at)),
      escapeCsvField(formatKyivDate(item.classified_at)),
      escapeCsvField(item.page_tags),
    ];
    csvRows.push(row.join(','));
  }

  const csvContent = BOM + csvRows.join('\r\n');
  const filename = `crawler_export_${new Date().toISOString().slice(0, 10)}.csv`;

  db.addAuditLog(req.userId, req.user?.login, 'export_csv', 'export', filename, { rowCount: items.length, mode }, req.ip);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(csvContent);
});
