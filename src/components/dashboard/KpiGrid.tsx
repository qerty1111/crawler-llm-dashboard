import React, { useState } from 'react';
import { Card, cn } from '../ui';
import { Sparkline } from './Sparkline';
import { KpiTileData, KpiResponse } from '../../types';
import { ArrowUpRight, ArrowDownRight, Minus, Info } from 'lucide-react';

interface KpiTileProps {
  data: KpiTileData;
  colorVariant?: 'blue' | 'emerald' | 'amber' | 'purple' | 'cyan';
}

export const KpiTile: React.FC<KpiTileProps> = ({ data, colorVariant = 'blue' }) => {
  const [isHovered, setIsHovered] = useState(false);
  const isUp = data.deltaDirection === 'up';
  const isDown = data.deltaDirection === 'down';

  // Determine delta badge color
  let deltaClass = 'text-slate-400 bg-slate-800/40 border-slate-700';
  if (isUp) {
    deltaClass = data.deltaIsPositive
      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
      : 'text-rose-400 bg-rose-500/10 border-rose-500/20';
  } else if (isDown) {
    deltaClass = data.deltaIsPositive
      ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
      : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  }

  const sparklineColors = {
    blue: '#3b82f6',
    emerald: '#10b981',
    amber: '#f59e0b',
    purple: '#8b5cf6',
    cyan: '#06b6d4',
  };

  return (
    <Card className="relative overflow-visible p-4 flex flex-col justify-between hover:border-slate-700 transition-all group z-10 hover:z-30">
      {/* Top row: Title and Tooltip */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-xs font-semibold text-slate-400 leading-tight group-hover:text-slate-200 transition-colors">
          {data.title}
        </span>
        <div
          className="relative"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <Info className="w-3.5 h-3.5 text-slate-500 hover:text-slate-200 cursor-help transition-colors" />
          {isHovered && (
            <div className="absolute right-0 top-full mt-1.5 w-56 p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-[11px] leading-relaxed text-slate-200 shadow-2xl z-50 pointer-events-none">
              {data.tooltip}
            </div>
          )}
        </div>
      </div>

      {/* Middle: Big Value */}
      <div className="flex items-baseline gap-1.5 my-1">
        <span className="text-2xl font-bold font-mono tracking-tight text-white">
          {data.formattedValue}
        </span>
      </div>

      {/* Bottom row: Delta badge & Sparkline */}
      <div className="flex items-center justify-between pt-2 mt-auto border-t border-surface-border/40">
        <div className={cn('inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-md border font-mono', deltaClass)}>
          {isUp && <ArrowUpRight className="w-3.5 h-3.5" />}
          {isDown && <ArrowDownRight className="w-3.5 h-3.5" />}
          {!isUp && !isDown && <Minus className="w-3 h-3" />}
          <span>{data.deltaPct !== undefined ? `${data.deltaPct > 0 ? '+' : ''}${data.deltaPct}%` : '0%'}</span>
        </div>

        <div className="opacity-80 group-hover:opacity-100 transition-opacity">
          <Sparkline data={data.sparkline} color={sparklineColors[colorVariant]} width={70} height={24} />
        </div>
      </div>
    </Card>
  );
};

export const KpiGrid: React.FC<{ kpis: KpiResponse }> = ({ kpis }) => {
  return (
    <div className="grid grid-cols-5 gap-4">
      <KpiTile data={kpis.queriesRun} colorVariant="blue" />
      <KpiTile data={kpis.rawFound} colorVariant="cyan" />
      <KpiTile data={kpis.classified} colorVariant="purple" />
      <KpiTile data={kpis.suitable} colorVariant="emerald" />
      <KpiTile data={kpis.conversionPct} colorVariant="emerald" />
      <KpiTile data={kpis.inQueue} colorVariant="amber" />
      <KpiTile data={kpis.errorsCount} colorVariant="amber" />
      <KpiTile data={kpis.uniqueDomains} colorVariant="blue" />
      <KpiTile data={kpis.speedPerMin} colorVariant="cyan" />
      <KpiTile data={kpis.avgProcessTime} colorVariant="purple" />
    </div>
  );
};
