import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePeriod } from '../context/PeriodContext';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import {
  KpiResponse, TimeseriesPoint, FunnelStage, ScoreHistogramItem,
  TopQueryItem, TopDomainItem, WorstQueryItem, BreakdownItem
} from '../types';
import { KpiGrid } from '../components/dashboard/KpiGrid';
import { MainChart } from '../components/dashboard/MainChart';
import { FunnelView } from '../components/dashboard/FunnelView';
import { ScoreHistogram } from '../components/dashboard/ScoreHistogram';
import { TopTables } from '../components/dashboard/TopTables';
import { BreakdownBars } from '../components/dashboard/BreakdownBars';
import { LiveFeed } from '../components/dashboard/LiveFeed';
import { Skeleton, Card } from '../components/ui';

export const DashboardPage: React.FC = () => {
  const { fromIso, toIso } = usePeriod();
  const { scoreThreshold } = useAuth();
  const { kpiTick } = useSocket();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [kpis, setKpis] = useState<KpiResponse | null>(null);
  const [timeseries, setTimeseries] = useState<{ points: TimeseriesPoint[]; granularity: string }>({
    points: [],
    granularity: '1 мин',
  });
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
  const [histogramItems, setHistogramItems] = useState<ScoreHistogramItem[]>([]);
  const [topQueries, setTopQueries] = useState<TopQueryItem[]>([]);
  const [topDomains, setTopDomains] = useState<TopDomainItem[]>([]);
  const [worstQueries, setWorstQueries] = useState<WorstQueryItem[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<BreakdownItem[]>([]);
  const [regionBreakdown, setRegionBreakdown] = useState<BreakdownItem[]>([]);

  const loadAllData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [
        kpiData,
        tsData,
        funnelData,
        histData,
        queriesTop,
        domainsTop,
        worstTop,
        catData,
        regData,
      ] = await Promise.all([
        api.getKpi({ from: fromIso, to: toIso, threshold: scoreThreshold }),
        api.getTimeseries({ from: fromIso, to: toIso, threshold: scoreThreshold }),
        api.getFunnel({ from: fromIso, to: toIso, threshold: scoreThreshold }),
        api.getHistogram({ from: fromIso, to: toIso, threshold: scoreThreshold }),
        api.getTop({ from: fromIso, to: toIso, type: 'queries', threshold: scoreThreshold }),
        api.getTop({ from: fromIso, to: toIso, type: 'domains', threshold: scoreThreshold }),
        api.getTop({ from: fromIso, to: toIso, type: 'worst', threshold: scoreThreshold }),
        api.getBreakdown({ from: fromIso, to: toIso, dim: 'category', threshold: scoreThreshold }),
        api.getBreakdown({ from: fromIso, to: toIso, dim: 'region', threshold: scoreThreshold }),
      ]);

      setKpis(kpiData);
      setTimeseries({ points: tsData.points, granularity: tsData.granularity });
      setFunnelStages(funnelData.stages);
      setHistogramItems(histData.items);
      setTopQueries(queriesTop.items || []);
      setTopDomains(domainsTop.items || []);
      setWorstQueries(worstTop.items || []);
      setCategoryBreakdown(catData.items || []);
      setRegionBreakdown(regData.items || []);
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    } finally {
      setIsLoading(false);
    }
  }, [fromIso, toIso, scoreThreshold]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Handle live tick counter increment
  useEffect(() => {
    if (kpiTick && kpis) {
      setKpis(prev => {
        if (!prev) return prev;
        const isSuitable = kpiTick.score >= scoreThreshold;
        const newRaw = Number(prev.rawFound.value) + (kpiTick.rawFoundInc || 0);
        const newClassified = Number(prev.classified.value) + (kpiTick.classifiedInc || 0);
        const newSuitable = Number(prev.suitable.value) + (isSuitable ? 1 : 0);
        const conv = newClassified > 0 ? Math.round((newSuitable / newClassified) * 1000) / 10 : 0;

        return {
          ...prev,
          rawFound: {
            ...prev.rawFound,
            value: newRaw,
            formattedValue: newRaw.toLocaleString('ru-RU'),
          },
          classified: {
            ...prev.classified,
            value: newClassified,
            formattedValue: newClassified.toLocaleString('ru-RU'),
          },
          suitable: {
            ...prev.suitable,
            value: newSuitable,
            formattedValue: newSuitable.toLocaleString('ru-RU'),
          },
          conversionPct: {
            ...prev.conversionPct,
            value: conv,
            formattedValue: `${conv}%`,
          },
        };
      });
    }
  }, [kpiTick, scoreThreshold]);

  const handleScoreDrilldown = (score: number) => {
    navigate(`/links?min_score=${score}&max_score=${score}`);
  };

  if (isLoading && !kpis) {
    return (
      <div className="space-y-6">
        {/* KPI Skeleton */}
        <div className="grid grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-6">
          <Skeleton className="col-span-2 h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Block 1: 10 KPI Tiles (5x2 grid) */}
      {kpis && <KpiGrid kpis={kpis} />}

      {/* Row 2: Main Chart (2 cols) & Funnel (1 col) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-stretch">
        <div className="xl:col-span-2">
          <MainChart
            points={timeseries.points}
            granularity={timeseries.granularity}
            threshold={scoreThreshold}
          />
        </div>
        <div>
          <FunnelView stages={funnelStages} threshold={scoreThreshold} />
        </div>
      </div>

      {/* Row 3: Score Histogram (1/2) & Category/Region Breakdown (1/2) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
        <ScoreHistogram
          items={histogramItems}
          threshold={scoreThreshold}
          onSelectScore={handleScoreDrilldown}
        />
        <BreakdownBars categories={categoryBreakdown} regions={regionBreakdown} />
      </div>

      {/* Row 4: Top 10 Tables (3/5) & Live WebSocket Feed (2/5) */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">
        <div className="xl:col-span-3">
          <TopTables
            topQueries={topQueries}
            topDomains={topDomains}
            worstQueries={worstQueries}
            threshold={scoreThreshold}
          />
        </div>
        <div className="xl:col-span-2">
          <LiveFeed />
        </div>
      </div>
    </div>
  );
};
