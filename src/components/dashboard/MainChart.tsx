import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
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
      <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-2xl text-xs space-y-1.5 font-mono z-50">
        <p className="text-slate-400 font-semibold mb-1 border-b border-slate-800 pb-1">{label}</p>
        <p className="text-sky-400 flex justify-between gap-4">
          <span>Найдено ссылок:</span>
          <span className="font-bold">{formatNumber(payload[0]?.value)}</span>
        </p>
        <p className="text-emerald-400 flex justify-between gap-4">
          <span>Подходящих:</span>
          <span className="font-bold">{formatNumber(payload[1]?.value)}</span>
        </p>
        {payload[2] && (
          <p className="text-purple-400 flex justify-between gap-4">
            <span>Оценено:</span>
            <span className="font-bold">{formatNumber(payload[2]?.value)}</span>
          </p>
        )}
      </div>
    );
  }
  return null;
};

export const MainChart: React.FC<MainChartProps> = ({ points, granularity, threshold }) => {
  return (
    <Card className="p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
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

      {/* Chart */}
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f293d" vertical={false} />
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
              wrapperStyle={{ paddingBottom: '10px', fontSize: '12px' }}
            />
            <Line
              type="monotone"
              name="Найдено ссылок"
              dataKey="rawFound"
              stroke="#38bdf8"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, fill: '#38bdf8' }}
            />
            <Line
              type="monotone"
              name={`Подходящих (score ≥ ${threshold})`}
              dataKey="suitable"
              stroke="#10b981"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 6, fill: '#10b981' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};
