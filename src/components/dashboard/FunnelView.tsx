import React from 'react';
import { Card, Badge } from '../ui';
import { FunnelStage } from '../../types';
import { Filter, ArrowRight, Layers } from 'lucide-react';
import { formatNumber } from '../../utils/formatters';

interface FunnelViewProps {
  stages: FunnelStage[];
  threshold: number;
}

export const FunnelView: React.FC<FunnelViewProps> = ({ stages, threshold }) => {
  const stageGradients = [
    'from-blue-600 to-indigo-600',
    'from-indigo-600 to-purple-600',
    'from-purple-600 to-pink-600',
    'from-pink-600 to-amber-600',
    'from-amber-600 to-emerald-600',
  ];

  return (
    <Card className="p-5 flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <Layers className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">Воронка конверсии</h3>
            <p className="text-xs text-slate-400">Прохождение ссылок через все этапы фильтрации и скоринга</p>
          </div>
        </div>
        <Badge variant="purple" size="sm" className="font-mono text-[11px]">
          5 этапов
        </Badge>
      </div>

      {/* Funnel Steps */}
      <div className="space-y-3">
        {stages.map((stage, idx) => {
          const isLast = idx === stages.length - 1;
          const maxCount = stages[0]?.count || 1;
          const barWidthPct = Math.max(8, Math.min(100, (stage.count / maxCount) * 100));

          return (
            <div key={stage.id} className="space-y-1 group">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-300 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-surface-lighter flex items-center justify-center text-[10px] font-mono text-slate-400">
                    {idx + 1}
                  </span>
                  {stage.label}
                </span>
                <div className="flex items-center gap-3 font-mono">
                  <span className="text-slate-400 text-[11px]">{stage.description}</span>
                  <span className="font-bold text-white text-sm">{formatNumber(stage.count)}</span>
                </div>
              </div>

              {/* Bar */}
              <div className="w-full h-3 bg-surface-light rounded-lg overflow-hidden p-0.5 border border-surface-border">
                <div
                  className={`h-full rounded-md bg-gradient-to-r ${stageGradients[idx % stageGradients.length]} transition-all duration-500`}
                  style={{ width: `${barWidthPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
