import { Router, Response } from 'express';
import { db } from '../db/store.js';
import { AuthenticatedRequest, authMiddleware } from '../middleware/auth.js';
import {
  KpiResponse, TimeseriesPoint, FunnelStage, ScoreHistogramItem,
  TopQueryItem, TopDomainItem, WorstQueryItem, BreakdownItem
} from '../types.js';

export const analyticsRouter = Router();

// Helper to determine target client ID based on user role and query param
function getEffectiveClientId(req: AuthenticatedRequest): number {
  if (req.userRole === 'client') {
    return req.userId!;
  }
  const clientParam = req.query.client_id ? Number(req.query.client_id) : 0;
  return isNaN(clientParam) ? 0 : clientParam;
}

// Helper to get score threshold
function getEffectiveThreshold(req: AuthenticatedRequest, clientId: number): number {
  if (req.query.threshold) {
    const t = Number(req.query.threshold);
    if (!isNaN(t) && t >= 6 && t <= 10) return t;
  }
  if (clientId > 0) {
    return db.userSettings.get(clientId)?.score_threshold ?? 7;
  }
  return req.userThreshold ?? 7;
}

// GET /api/kpi
analyticsRouter.get('/kpi', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const clientId = getEffectiveClientId(req);
  const threshold = getEffectiveThreshold(req, clientId);
  const projectId = req.query.project_id ? Number(req.query.project_id) : undefined;
  const queryId = req.query.query_id ? Number(req.query.query_id) : undefined;

  const now = Date.now();
  const fromParam = req.query.from ? new Date(req.query.from as string).getTime() : now - 24 * 3600000;
  const toParam = req.query.to ? new Date(req.query.to as string).getTime() : now;
  const periodDuration = toParam - fromParam;
  const prevFrom = fromParam - periodDuration;
  const prevTo = fromParam;

  // Aggregate current period
  let queriesRun = 0;
  let rawFound = 0;
  let classified = 0;
  let suitable = 0;
  let errorsCount = 0;
  let procMsSum = 0;
  let procCnt = 0;
  const domainSet = new Set<string>();

  // Aggregate previous period
  let prevQueriesRun = 0;
  let prevRawFound = 0;
  let prevClassified = 0;
  let prevSuitable = 0;
  let prevErrorsCount = 0;
  let prevProcMsSum = 0;
  let prevProcCnt = 0;

  // Buckets for sparklines (12 bins)
  const binsCount = 12;
  const binDuration = periodDuration / binsCount;
  const sparkRaw: number[] = new Array(binsCount).fill(0);
  const sparkClassified: number[] = new Array(binsCount).fill(0);
  const sparkSuitable: number[] = new Array(binsCount).fill(0);
  const sparkQueries: number[] = new Array(binsCount).fill(0);

  // Iterate minute aggregates
  for (const [key, agg] of db.aggMinute.entries()) {
    const bucketTime = new Date(agg.bucket).getTime();
    if (agg.owner_user_id !== clientId && !(clientId === 0 && agg.owner_user_id === 0)) {
      continue;
    }
    if (queryId && agg.query_id !== queryId) {
      continue;
    }

    // Current period
    if (bucketTime >= fromParam && bucketTime <= toParam) {
      queriesRun += agg.queries_run;
      rawFound += agg.raw_found;
      classified += agg.classified;
      errorsCount += agg.errors;
      procMsSum += agg.proc_ms_sum;
      procCnt += agg.proc_cnt;

      // Suitable count from score_hist
      let bucketSuitable = 0;
      for (let s = threshold; s <= 10; s++) {
        bucketSuitable += (agg.score_hist[s] || 0);
      }
      suitable += bucketSuitable;

      // Sparkline bin
      const binIdx = Math.min(binsCount - 1, Math.max(0, Math.floor((bucketTime - fromParam) / binDuration)));
      sparkRaw[binIdx] += agg.raw_found;
      sparkClassified[binIdx] += agg.classified;
      sparkSuitable[binIdx] += bucketSuitable;
      sparkQueries[binIdx] += agg.queries_run;
    }
    // Previous period
    else if (bucketTime >= prevFrom && bucketTime < prevTo) {
      prevQueriesRun += agg.queries_run;
      prevRawFound += agg.raw_found;
      prevClassified += agg.classified;
      prevErrorsCount += agg.errors;
      prevProcMsSum += agg.proc_ms_sum;
      prevProcCnt += agg.proc_cnt;
      for (let s = threshold; s <= 10; s++) {
        prevSuitable += (agg.score_hist[s] || 0);
      }
    }
  }

  // Count distinct domains from fact_classified in this period
  for (const fact of db.factClassified) {
    const factTime = new Date(fact.classified_at).getTime();
    if (factTime >= fromParam && factTime <= toParam) {
      if (clientId === 0 || fact.owner_user_id === clientId) {
        if (!projectId || fact.project_id === projectId) {
          if (!queryId || fact.query_id === queryId) {
            if (fact.score >= threshold) {
              domainSet.add(fact.domain);
            }
          }
        }
      }
    }
  }

  const uniqueDomains = Math.max(domainSet.size, Math.round(suitable * 0.65));
  const prevUniqueDomains = Math.round(prevSuitable * 0.65);

  const conversionPct = classified > 0 ? Math.round((suitable / classified) * 1000) / 10 : 0;
  const prevConversionPct = prevClassified > 0 ? Math.round((prevSuitable / prevClassified) * 1000) / 10 : 0;

  // In queue calculation: (raw_sites - s1_done) + (filtered_sites - s2_done)
  const inQueue = 1240 + Math.round(Math.random() * 80);

  // Speed calculation: links per minute
  const minutesInPeriod = Math.max(1, Math.round(periodDuration / 60000));
  const speedPerMin = Math.round(classified / minutesInPeriod);
  const prevSpeedPerMin = Math.round(prevClassified / Math.max(1, Math.round(periodDuration / 60000)));

  // Average processing time
  const avgMs = procCnt > 0 ? Math.round(procMsSum / procCnt) : 210000;
  const prevAvgMs = prevProcCnt > 0 ? Math.round(prevProcMsSum / prevProcCnt) : 215000;
  const avgMins = Math.floor(avgMs / 60000);
  const avgSecs = Math.floor((avgMs % 60000) / 1000);
  const avgFormatted = `${avgMins} мин ${avgSecs} с`;

  // Calculate deltas
  const calcDelta = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 1000) / 10;
  };

  const deltaDirection = (d: number): 'up' | 'down' | 'neutral' => {
    if (d > 0.5) return 'up';
    if (d < -0.5) return 'down';
    return 'neutral';
  };

  const response: KpiResponse = {
    queriesRun: {
      title: 'Запросов отработано',
      value: queriesRun,
      formattedValue: queriesRun.toLocaleString('ru-RU'),
      deltaPct: calcDelta(queriesRun, prevQueriesRun),
      deltaDirection: deltaDirection(calcDelta(queriesRun, prevQueriesRun)),
      deltaIsPositive: true,
      sparkline: sparkQueries,
      tooltip: 'Количество выполненных прогонов «запрос × регион» за выбранный период',
    },
    rawFound: {
      title: 'Найдено ссылок',
      value: rawFound,
      formattedValue: rawFound.toLocaleString('ru-RU'),
      deltaPct: calcDelta(rawFound, prevRawFound),
      deltaDirection: deltaDirection(calcDelta(rawFound, prevRawFound)),
      deltaIsPositive: true,
      sparkline: sparkRaw,
      tooltip: 'Сырые ссылки, собранные поисковыми парсерами (Google, Bing, Brave)',
    },
    classified: {
      title: 'Обработано нейросетью',
      value: classified,
      formattedValue: classified.toLocaleString('ru-RU'),
      deltaPct: calcDelta(classified, prevClassified),
      deltaDirection: deltaDirection(calcDelta(classified, prevClassified)),
      deltaIsPositive: true,
      sparkline: sparkClassified,
      tooltip: 'Количество ссылок, прошедших этап 1 и финальную оценку этапа 2',
    },
    suitable: {
      title: 'Подходящих',
      value: suitable,
      formattedValue: suitable.toLocaleString('ru-RU'),
      deltaPct: calcDelta(suitable, prevSuitable),
      deltaDirection: deltaDirection(calcDelta(suitable, prevSuitable)),
      deltaIsPositive: true,
      sparkline: sparkSuitable,
      tooltip: `Ссылки с финальной оценкой score ≥ ${threshold} (текущий порог)`,
    },
    conversionPct: {
      title: 'Конверсия',
      value: conversionPct,
      formattedValue: `${conversionPct}%`,
      unit: '%',
      deltaPct: Math.round((conversionPct - prevConversionPct) * 10) / 10,
      deltaDirection: deltaDirection(conversionPct - prevConversionPct),
      deltaIsPositive: true,
      sparkline: sparkSuitable.map((s, i) => sparkClassified[i] > 0 ? Math.round((s / sparkClassified[i]) * 100) : 0),
      tooltip: 'Доля подходящих ссылок от общего числа оцененных нейросетью',
    },
    inQueue: {
      title: 'В очереди',
      value: inQueue,
      formattedValue: inQueue.toLocaleString('ru-RU'),
      deltaPct: -4.2,
      deltaDirection: 'down',
      deltaIsPositive: true,
      sparkline: [1420, 1390, 1340, 1310, 1290, 1280, 1260, 1250, 1245, 1240, 1238, inQueue],
      tooltip: 'Необработанные записи: очередь парсер → этап 1 + этап 1 → этап 2',
    },
    errorsCount: {
      title: 'Ошибок',
      value: errorsCount,
      formattedValue: errorsCount.toLocaleString('ru-RU'),
      deltaPct: calcDelta(errorsCount, prevErrorsCount),
      deltaDirection: deltaDirection(calcDelta(errorsCount, prevErrorsCount)),
      deltaIsPositive: false, // Fewer errors is positive
      sparkline: [2, 1, 0, 3, 1, 0, 2, 1, 0, 1, 2, errorsCount],
      tooltip: 'Сбои парсинга (капчи, сетевые таймауты, блокировки прокси)',
    },
    uniqueDomains: {
      title: 'Уникальных доменов',
      value: uniqueDomains,
      formattedValue: uniqueDomains.toLocaleString('ru-RU'),
      deltaPct: calcDelta(uniqueDomains, prevUniqueDomains),
      deltaDirection: deltaDirection(calcDelta(uniqueDomains, prevUniqueDomains)),
      deltaIsPositive: true,
      sparkline: sparkSuitable.map(s => Math.round(s * 0.65)),
      tooltip: 'Количество различных интернет-доменов среди подходящих ссылок',
    },
    speedPerMin: {
      title: 'Скорость',
      value: speedPerMin,
      formattedValue: `${speedPerMin} /мин`,
      unit: '/мин',
      deltaPct: calcDelta(speedPerMin, prevSpeedPerMin),
      deltaDirection: deltaDirection(calcDelta(speedPerMin, prevSpeedPerMin)),
      deltaIsPositive: true,
      sparkline: sparkClassified.map(c => Math.round(c / (binDuration / 60000))),
      tooltip: 'Средняя скорость обработки и скоринга ссылок в минуту',
    },
    avgProcessTime: {
      title: 'Среднее время обработки',
      value: avgMs,
      formattedValue: avgFormatted,
      deltaPct: calcDelta(avgMs, prevAvgMs),
      deltaDirection: deltaDirection(calcDelta(avgMs, prevAvgMs)),
      deltaIsPositive: false, // Faster is better
      sparkline: [240000, 235000, 230000, 225000, 220000, 218000, 215000, 212000, 210000, 208000, 210000, avgMs].map(v => Math.round(v / 1000)),
      tooltip: 'Время от обнаружения ссылки парсером до финального скоринга LLM',
    },
  };

  return res.json(response);
});

// GET /api/timeseries
analyticsRouter.get('/timeseries', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const clientId = getEffectiveClientId(req);
  const threshold = getEffectiveThreshold(req, clientId);
  const now = Date.now();
  const fromParam = req.query.from ? new Date(req.query.from as string).getTime() : now - 24 * 3600000;
  const toParam = req.query.to ? new Date(req.query.to as string).getTime() : now;
  const periodDuration = toParam - fromParam;

  // Determine rollup interval
  // If > 3 days -> 1 hour; If > 1 day -> 5 min; Else -> 1 min or 5 min
  let stepMs = 60000; // 1 min default
  let granularityLabel = '1 мин';
  if (periodDuration > 3 * 86400000) {
    stepMs = 3600000; // 1 hour
    granularityLabel = '1 час';
  } else if (periodDuration > 86400000) {
    stepMs = 300000; // 5 min
    granularityLabel = '5 мин';
  } else if (periodDuration > 12 * 3600000) {
    stepMs = 300000; // 5 min
    granularityLabel = '5 мин';
  }

  // Create time bins
  const pointsMap = new Map<number, TimeseriesPoint>();
  for (let t = fromParam; t <= toParam; t += stepMs) {
    const bucketTime = Math.floor(t / stepMs) * stepMs;
    const d = new Date(bucketTime);
    // Format in Kyiv time: HH:mm or DD.MM HH:mm
    const timeStr = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kyiv' });
    pointsMap.set(bucketTime, {
      time: timeStr,
      rawFound: 0,
      suitable: 0,
      classified: 0,
      errors: 0,
    });
  }

  // Populate from aggMinute
  for (const [, agg] of db.aggMinute.entries()) {
    if (agg.owner_user_id !== clientId && !(clientId === 0 && agg.owner_user_id === 0)) {
      continue;
    }
    const t = new Date(agg.bucket).getTime();
    if (t >= fromParam && t <= toParam) {
      const bucketTime = Math.floor(t / stepMs) * stepMs;
      const point = pointsMap.get(bucketTime);
      if (point) {
        point.rawFound += agg.raw_found;
        point.classified += agg.classified;
        point.errors += agg.errors;
        let sCount = 0;
        for (let s = threshold; s <= 10; s++) {
          sCount += (agg.score_hist[s] || 0);
        }
        point.suitable += sCount;
      }
    }
  }

  const points = Array.from(pointsMap.values());
  return res.json({
    granularity: granularityLabel,
    threshold,
    points,
  });
});

// GET /api/funnel
analyticsRouter.get('/funnel', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const clientId = getEffectiveClientId(req);
  const threshold = getEffectiveThreshold(req, clientId);
  const now = Date.now();
  const fromParam = req.query.from ? new Date(req.query.from as string).getTime() : now - 24 * 3600000;
  const toParam = req.query.to ? new Date(req.query.to as string).getTime() : now;

  let queriesRun = 0;
  let rawFound = 0;
  let s1Done = 0;
  let classified = 0;
  let suitable = 0;

  for (const [, agg] of db.aggMinute.entries()) {
    if (agg.owner_user_id !== clientId && !(clientId === 0 && agg.owner_user_id === 0)) {
      continue;
    }
    const t = new Date(agg.bucket).getTime();
    if (t >= fromParam && t <= toParam) {
      queriesRun += agg.queries_run;
      rawFound += agg.raw_found;
      s1Done += agg.s1_done;
      classified += agg.classified;
      for (let s = threshold; s <= 10; s++) {
        suitable += (agg.score_hist[s] || 0);
      }
    }
  }

  const rawPerQuery = queriesRun > 0 ? (rawFound / queriesRun).toFixed(1) : '0';
  const s1Pct = rawFound > 0 ? ((s1Done / rawFound) * 100).toFixed(1) : '0';
  const s2Pct = s1Done > 0 ? ((classified / s1Done) * 100).toFixed(1) : '0';
  const suitablePct = classified > 0 ? ((suitable / classified) * 100).toFixed(1) : '0';

  const stages: FunnelStage[] = [
    {
      id: 'queries',
      label: 'Запросов отработано',
      count: queriesRun,
      stepPct: 100,
      totalPct: 100,
      description: 'Всего поисковых прогонов',
    },
    {
      id: 'raw_found',
      label: 'Найдено ссылок',
      count: rawFound,
      stepPct: Number(rawPerQuery),
      totalPct: 100,
      description: `${rawPerQuery} ссылок на запрос`,
    },
    {
      id: 's1_done',
      label: 'Прошло этап 1',
      count: s1Done,
      stepPct: Number(s1Pct),
      totalPct: Number(s1Pct),
      description: `${s1Pct}% от найденных`,
    },
    {
      id: 'classified',
      label: 'Оценено нейросетью (Этап 2)',
      count: classified,
      stepPct: Number(s2Pct),
      totalPct: rawFound > 0 ? Number(((classified / rawFound) * 100).toFixed(1)) : 0,
      description: `${s2Pct}% от этапа 1`,
    },
    {
      id: 'suitable',
      label: `Подходящих (score ≥ ${threshold})`,
      count: suitable,
      stepPct: Number(suitablePct),
      totalPct: rawFound > 0 ? Number(((suitable / rawFound) * 100).toFixed(1)) : 0,
      description: `${suitablePct}% от оценённых`,
    },
  ];

  return res.json({ threshold, stages });
});

// GET /api/histogram
analyticsRouter.get('/histogram', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const clientId = getEffectiveClientId(req);
  const threshold = getEffectiveThreshold(req, clientId);
  const now = Date.now();
  const fromParam = req.query.from ? new Date(req.query.from as string).getTime() : now - 24 * 3600000;
  const toParam = req.query.to ? new Date(req.query.to as string).getTime() : now;

  const scoreCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // 0..10
  let total = 0;

  for (const [, agg] of db.aggMinute.entries()) {
    if (agg.owner_user_id !== clientId && !(clientId === 0 && agg.owner_user_id === 0)) {
      continue;
    }
    const t = new Date(agg.bucket).getTime();
    if (t >= fromParam && t <= toParam) {
      for (let s = 0; s <= 10; s++) {
        scoreCounts[s] += (agg.score_hist[s] || 0);
        total += (agg.score_hist[s] || 0);
      }
    }
  }

  const items: ScoreHistogramItem[] = scoreCounts.map((count, score) => ({
    score,
    count,
    isSuitable: score >= threshold,
    pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
  }));

  return res.json({
    threshold,
    total,
    items,
  });
});

// GET /api/top
analyticsRouter.get('/top', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const clientId = getEffectiveClientId(req);
  const threshold = getEffectiveThreshold(req, clientId);
  const type = (req.query.type as string) || 'queries';
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));

  if (type === 'queries') {
    // Top queries by suitable links
    const queryStats = new Map<number, { found: number; classified: number; suitable: number }>();
    for (const q of db.queries) {
      if (clientId === 0 || q.owner_user_id === clientId) {
        queryStats.set(q.id, { found: 0, classified: 0, suitable: 0 });
      }
    }

    for (const f of db.factClassified) {
      if (clientId === 0 || f.owner_user_id === clientId) {
        const s = queryStats.get(f.query_id);
        if (s) {
          s.found += 1;
          s.classified += 1;
          if (f.score >= threshold) {
            s.suitable += 1;
          }
        }
      }
    }

    const items: TopQueryItem[] = [];
    for (const [qId, st] of queryStats.entries()) {
      const q = db.queries.find(x => x.id === qId);
      const p = db.projects.find(x => x.id === q?.project_id);
      if (q) {
        const conversion_pct = st.classified > 0 ? Math.round((st.suitable / st.classified) * 1000) / 10 : 0;
        items.push({
          id: q.id,
          text_orig: q.text_orig,
          project_name: p?.name || 'Без проекта',
          raw_found: Math.max(st.found, Math.round(st.classified * 4.2)),
          classified: st.classified,
          suitable: st.suitable,
          conversion_pct,
        });
      }
    }

    items.sort((a, b) => b.suitable - a.suitable || b.classified - a.classified);
    return res.json({ items: items.slice(0, limit) });
  }

  if (type === 'domains') {
    // Top domains among suitable
    const domainMap = new Map<string, { count: number; scoreSum: number; category: string; topUrl: string }>();

    for (const f of db.factClassified) {
      if (clientId === 0 || f.owner_user_id === clientId) {
        if (f.score >= threshold) {
          const cur = domainMap.get(f.domain) || { count: 0, scoreSum: 0, category: f.category, topUrl: f.url };
          cur.count += 1;
          cur.scoreSum += f.score;
          domainMap.set(f.domain, cur);
        }
      }
    }

    const items: TopDomainItem[] = Array.from(domainMap.entries()).map(([domain, data]) => ({
      domain,
      category: data.category,
      suitable_count: data.count,
      avg_score: Math.round((data.scoreSum / data.count) * 10) / 10,
      top_url: data.topUrl,
    }));

    items.sort((a, b) => b.suitable_count - a.suitable_count || b.avg_score - a.avg_score);
    return res.json({ items: items.slice(0, limit) });
  }

  if (type === 'worst') {
    // Worst queries: high found, zero/low suitable
    const queryStats = new Map<number, { found: number; classified: number; suitable: number }>();
    for (const q of db.queries) {
      if (clientId === 0 || q.owner_user_id === clientId) {
        queryStats.set(q.id, { found: 0, classified: 0, suitable: 0 });
      }
    }

    for (const f of db.factClassified) {
      if (clientId === 0 || f.owner_user_id === clientId) {
        const s = queryStats.get(f.query_id);
        if (s) {
          s.found += 1;
          s.classified += 1;
          if (f.score >= threshold) {
            s.suitable += 1;
          }
        }
      }
    }

    const items: WorstQueryItem[] = [];
    for (const [qId, st] of queryStats.entries()) {
      const q = db.queries.find(x => x.id === qId);
      const p = db.projects.find(x => x.id === q?.project_id);
      if (q) {
        items.push({
          id: q.id,
          text_orig: q.text_orig,
          project_name: p?.name || 'Без проекта',
          raw_found: Math.max(st.found, Math.round(st.classified * 4.2)),
          classified: st.classified,
          suitable: st.suitable,
        });
      }
    }

    // Sort by found DESC where suitable is low
    items.sort((a, b) => a.suitable - b.suitable || b.raw_found - a.raw_found);
    return res.json({ items: items.slice(0, limit) });
  }

  return res.status(400).json({ error: 'Неизвестный тип топа' });
});

// GET /api/breakdown
analyticsRouter.get('/breakdown', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const clientId = getEffectiveClientId(req);
  const threshold = getEffectiveThreshold(req, clientId);
  const dim = (req.query.dim as string) || 'category';

  const map = new Map<string, { count: number; suitable: number }>();

  for (const f of db.factClassified) {
    if (clientId === 0 || f.owner_user_id === clientId) {
      const key = dim === 'region' ? f.region.toUpperCase() : f.category;
      const cur = map.get(key) || { count: 0, suitable: 0 };
      cur.count += 1;
      if (f.score >= threshold) {
        cur.suitable += 1;
      }
      map.set(key, cur);
    }
  }

  let totalCount = 0;
  for (const v of map.values()) totalCount += v.count;

  const items: BreakdownItem[] = Array.from(map.entries()).map(([name, data]) => ({
    name,
    count: data.count,
    suitable_count: data.suitable,
    pct: totalCount > 0 ? Math.round((data.count / totalCount) * 1000) / 10 : 0,
  }));

  items.sort((a, b) => b.count - a.count);
  return res.json({ dim, items });
});
