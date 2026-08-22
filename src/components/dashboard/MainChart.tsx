import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { Card, Badge } from '../ui';
import { TimeseriesPoint } from '../../types';
import { TrendingUp } from 'lucide-react';
import { formatNumber } from '../../utils/formatters';

interface MainChartProps {
  points: TimeseriesPoint[];
  granularity: string;
  threshold: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/80 p-3.5 rounded-xl shadow-2xl text-xs space-y-2 font-mono z-50 min-w-[200px]">
        <p className="text-slate-400 font-semibold border-b border-slate-800 pb-1 flex items-center justify-between">
          <span>Время:</span>
          <span className="text-slate-200">{label}</span>
        </p>
        <div className="space-y-1.5 pt-0.5">
          <div className="text-sky-400 flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              Найдено ссылок:
            </span>
            <span className="font-bold text-white">{formatNumber(payload[0]?.value)}</span>
          </div>
          <div className="text-emerald-400 flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Подходящих:
            </span>
            <span className="font-bold text-white">{formatNumber(payload[1]?.value)}</span>
          </div>
          {payload[2] && (
            <div className="text-purple-400 flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-400" />
                Оценено:
              </span>
              <span className="font-bold text-white">{formatNumber(payload[2]?.value)}</span>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

export const MainChart: React.FC<MainChartProps> = ({ points, granularity, threshold }) => {
  return (
    <Card className="p-5 border-surface-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-surface-border/50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-brand-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">Динамика обработки и находок</h3>
            <p className="text-xs text-slate-400">Соотношение найденных парсером ссылок и прошедших скоринг LLM</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" size="sm" className="font-mono text-[11px]">
            Гранулярность: <span className="text-brand-300 font-bold ml-1">{granularity}</span>
          </Badge>
          <Badge variant="success" size="sm" className="font-mono text-[11px]">
            Порог: ≥ {threshold}
          </Badge>
        </div>
      </div>

      {/* Area Chart with Subtle Sleek Gradients */}
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorRawFound" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="colorSuitable" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f293d" vertical={false} opacity={0.6} />
            <XAxis
              dataKey="time"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#1f293d' }}
            />
            <YAxis
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#1f293d' }}
              tickFormatter={(v) => formatNumber(v)}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="top"
              align="right"
              wrapperStyle={{ paddingBottom: '12px', fontSize: '12px' }}
            />
            <Area
              type="monotone"
              name="Найдено ссылок"
              dataKey="rawFound"
              stroke="#38bdf8"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorRawFound)"
              activeDot={{ r: 5, fill: '#38bdf8', stroke: '#0f172a', strokeWidth: 2 }}
            />
            <Area
              type="monotone"
              name={`Подходящих (score ≥ ${threshold})`}
              dataKey="suitable"
              stroke="#10b981"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#colorSuitable)"
              activeDot={{ r: 6, fill: '#10b981', stroke: '#0f172a', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};
