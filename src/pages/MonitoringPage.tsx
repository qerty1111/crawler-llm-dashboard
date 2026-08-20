import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { ServiceHealth, HostMetrics, OllamaInstance } from '../types';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { Card, Button, Badge, Modal, cn } from '../components/ui';
import {
  Activity, Cpu, HardDrive, Zap, Play, Square, RotateCw,
  Server, ShieldAlert, CheckCircle2, AlertTriangle, Radio, RefreshCw
} from 'lucide-react';
import { formatNumber } from '../utils/formatters';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export const MonitoringPage: React.FC = () => {
  const { role } = useAuth();
  const { healthData } = useSocket();

  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [queues, setQueues] = useState<any>(null);
  const [hostMetrics, setHostMetrics] = useState<HostMetrics | null>(null);
  const [hostHistory, setHostHistory] = useState<HostMetrics[]>([]);
  const [ollamaList, setOllamaList] = useState<OllamaInstance[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Control confirmation modal
  const [controlAction, setControlAction] = useState<{ action: string; service?: string; name?: string } | null>(null);
  const [isControlling, setIsControlling] = useState(false);
  const [controlResult, setControlResult] = useState<string | null>(null);

  const loadHealth = async () => {
    try {
      const [healthRes, hostRes, ollamaRes] = await Promise.all([
        api.getSystemHealth(),
        api.getHostMetrics(),
        api.getOllamaInstances(),
      ]);

      setServices(healthRes.services || []);
      setQueues(healthRes.queues || null);
      setHostMetrics(hostRes.current || null);
      setHostHistory(hostRes.history || []);
      setOllamaList(ollamaRes.instances || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadHealth();
    const interval = setInterval(loadHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  // Update live host metrics from WebSocket healthData
  useEffect(() => {
    if (healthData?.host) {
      setHostMetrics(healthData.host);
    }
    if (healthData?.services) {
      setServices(healthData.services);
    }
  }, [healthData]);

  const handleExecuteControl = async () => {
    if (!controlAction) return;
    setIsControlling(true);
    try {
      const res = await api.controlService({
        action: controlAction.action,
        service: controlAction.service,
      });
      setControlResult(res.message);
      setTimeout(() => {
        setControlAction(null);
        setControlResult(null);
        loadHealth();
      }, 1500);
    } catch (err: any) {
      alert(err.message || 'Ошибка выполнения команды');
    } finally {
      setIsControlling(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Activity className="w-6 h-6 text-brand-400" />
            <span>Мониторинг системы и софтов</span>
          </h2>
          <p className="text-xs text-slate-400">
            Состояние парсеров, очередей LLM-скорера, ресурсов хоста (185.86.76.127) и инстансов Ollama
          </p>
        </div>

        {role === 'admin' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setControlAction({ action: 'reload_config', name: 'Перезагрузка конфигурации' })}
            className="gap-2 text-xs"
          >
            <RotateCw className="w-3.5 h-3.5 text-brand-400" />
            Перечитать конфиг промпта
          </Button>
        )}
      </div>

      {/* 1. Service Health Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {services.map((s) => {
          const isGreen = s.calculatedStatus === 'green';
          const isYellow = s.calculatedStatus === 'yellow';
          const isRed = s.calculatedStatus === 'red';

          return (
            <Card key={s.service} className="p-4 space-y-3 relative overflow-hidden">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn('w-2.5 h-2.5 rounded-full animate-pulse', isGreen ? 'bg-emerald-400' : isYellow ? 'bg-amber-400' : 'bg-rose-500')} />
                  <h4 className="font-bold text-xs text-white truncate max-w-[170px]" title={s.name}>
                    {s.service}
                  </h4>
                </div>

                <Badge variant={isGreen ? 'success' : isYellow ? 'warning' : 'danger'} size="sm">
                  {s.state?.toUpperCase()}
                </Badge>
              </div>

              <div className="space-y-1 font-mono text-[11px]">
                <div className="flex justify-between text-slate-400">
                  <span>Посл. запись:</span>
                  <span className={cn('font-bold', isGreen ? 'text-emerald-400' : isYellow ? 'text-amber-400' : 'text-rose-400')}>
                    {s.timeAgoStr}
                  </span>
                </div>
                {s.extra?.rate_per_min !== undefined && (
                  <div className="flex justify-between text-slate-400">
                    <span>Скорость:</span>
                    <span className="text-white">{s.extra.rate_per_min} /мин</span>
                  </div>
                )}
                {s.extra?.workers_active !== undefined && (
                  <div className="flex justify-between text-slate-400">
                    <span>Воркеры:</span>
                    <span className="text-brand-300">{s.extra.workers_active} / {s.extra.workers_total}</span>
                  </div>
                )}
              </div>

              {/* Admin Service Controls */}
              {role === 'admin' && (
                <div className="flex items-center gap-1.5 pt-2 border-t border-surface-border/50">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setControlAction({ action: 'start', service: s.service, name: s.name })}
                    className="flex-1 py-1 text-[11px] gap-1"
                  >
                    <Play className="w-3 h-3 text-emerald-400" />
                    Старт
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setControlAction({ action: 'stop', service: s.service, name: s.name })}
                    className="flex-1 py-1 text-[11px] gap-1"
                  >
                    <Square className="w-3 h-3 text-rose-400" />
                    Стоп
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* 2. Queues & Scorer Lag Card */}
      {queues && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Card className="p-5 xl:col-span-1 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-surface-border">
              <Zap className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white">Очереди и отставание LLM</h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-surface-light rounded-xl border border-surface-border font-mono">
                <span className="text-[10px] text-slate-400 uppercase">Очередь Этап 1</span>
                <p className="text-xl font-bold text-amber-400 mt-1">{formatNumber(queues.stage1)}</p>
                <span className="text-[10px] text-slate-500">raw_sites − s1_done</span>
              </div>

              <div className="p-3 bg-surface-light rounded-xl border border-surface-border font-mono">
                <span className="text-[10px] text-slate-400 uppercase">Очередь Этап 2</span>
                <p className="text-xl font-bold text-purple-400 mt-1">{formatNumber(queues.stage2)}</p>
                <span className="text-[10px] text-slate-500">filtered − s2_done</span>
              </div>
            </div>

            {/* Lag Time */}
            <div className="p-3.5 bg-surface-light rounded-xl border border-surface-border space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Отставание скорера от парсера:</span>
                <span className="font-mono font-bold text-emerald-400">{queues.lagFormatted}</span>
              </div>
              <p className="text-[10px] text-slate-500">Возраст самой старой необработанной записи в raw_sites</p>
            </div>
          </Card>

          {/* Queue Trend Chart */}
          <Card className="p-5 xl:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-white">Динамика размера очередей</h3>
              <span className="text-xs font-mono text-slate-400">Суммарная очередь: {formatNumber(queues.total)}</span>
            </div>

            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={queues.history} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f293d" vertical={false} />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '11px' }} />
                  <Area type="monotone" name="Этап 1" dataKey="stage1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} />
                  <Area type="monotone" name="Этап 2" dataKey="stage2" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {/* 3. Host Metrics Card (CPU, RAM, Disk, GPU) */}
      {hostMetrics && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Cpu className="w-4 h-4 text-brand-400" />
            <span>Ресурсы хоста (185.86.76.127: Ubuntu 24.04 LTS)</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* CPU */}
            <Card className="p-4 space-y-2 font-mono">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-sans">CPU (8 ядер / 16 потоков)</span>
                <span className="font-bold text-white">{hostMetrics.cpu_pct}%</span>
              </div>
              <div className="w-full h-2 bg-surface-light rounded-full overflow-hidden">
                <div className="h-full bg-brand-500 rounded-full" style={{ width: `${hostMetrics.cpu_pct}%` }} />
              </div>
              {/* Cores mini bars */}
              <div className="grid grid-cols-8 gap-1 pt-1">
                {hostMetrics.cpu_cores.map((c, i) => (
                  <div key={i} className="h-6 bg-surface-lighter rounded flex flex-col justify-end p-0.5" title={`Ядро ${i}: ${c}%`}>
                    <div className="bg-brand-400 rounded-sm w-full" style={{ height: `${c}%` }} />
                  </div>
                ))}
              </div>
            </Card>

            {/* RAM */}
            <Card className="p-4 space-y-2 font-mono">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-sans">RAM Память</span>
                <span className="font-bold text-purple-400">{hostMetrics.ram_pct}%</span>
              </div>
              <div className="w-full h-2 bg-surface-light rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 rounded-full" style={{ width: `${hostMetrics.ram_pct}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 pt-2">
                <span>Использовано: {(hostMetrics.ram_used_mb / 1024).toFixed(1)} GB</span>
                <span>Всего: {(hostMetrics.ram_total_mb / 1024).toFixed(0)} GB</span>
              </div>
            </Card>

            {/* Disk */}
            <Card className="p-4 space-y-2 font-mono">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-sans">NVMe Диск (БД + Кеш)</span>
                <span className="font-bold text-cyan-400">{hostMetrics.disk_pct}%</span>
              </div>
              <div className="w-full h-2 bg-surface-light rounded-full overflow-hidden">
                <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${hostMetrics.disk_pct}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 pt-2">
                <span>Свободно: {hostMetrics.disk_free_gb} GB</span>
                <span>Всего: {hostMetrics.disk_total_gb} GB</span>
              </div>
            </Card>

            {/* Network */}
            <Card className="p-4 space-y-2 font-mono">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-sans">Сетевой трафик</span>
                <span className="font-bold text-emerald-400">{hostMetrics.net_in_mb} MB/s</span>
              </div>
              <div className="space-y-1 pt-1 text-[11px]">
                <div className="flex justify-between text-slate-400">
                  <span>Входящий (Парсер):</span>
                  <span className="text-emerald-300 font-bold">{hostMetrics.net_in_mb} MB/s</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Исходящий (LLM API):</span>
                  <span className="text-sky-300 font-bold">{hostMetrics.net_out_mb} MB/s</span>
                </div>
              </div>
            </Card>
          </div>

          {/* GPUs Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {hostMetrics.gpu.map((gpu) => (
              <Card key={gpu.idx} className="p-4 space-y-3 font-mono">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-white font-sans">GPU #{gpu.idx}: {gpu.name}</span>
                  <Badge variant="success" size="sm">
                    {gpu.temp_c} °C
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <div className="flex justify-between text-slate-400 font-sans">
                      <span>Загрузка ядра:</span>
                      <span className="font-bold text-emerald-400">{gpu.util_pct}%</span>
                    </div>
                    <div className="w-full h-2 bg-surface-light rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${gpu.util_pct}%` }} />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-slate-400 font-sans">
                      <span>VRAM:</span>
                      <span className="font-bold text-purple-400">
                        {Math.round(gpu.mem_used_mb / 1024)} / {Math.round(gpu.mem_total_mb / 1024)} GB
                      </span>
                    </div>
                    <div className="w-full h-2 bg-surface-light rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 rounded-full"
                        style={{ width: `${(gpu.mem_used_mb / gpu.mem_total_mb) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 4. 8 Ollama Instances Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Server className="w-4 h-4 text-purple-400" />
            <span>8 Инстансов Ollama (LLM Кластер: Порты 11434–11441)</span>
          </h3>
          <Badge variant="purple" size="sm" className="font-mono">
            Все инстансы онлайн (8 / 8)
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {ollamaList.map((inst) => (
            <Card key={inst.port} className="p-3 space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-xs">Порт :{inst.port}</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              </div>

              <div className="text-[11px] font-sans text-brand-300 truncate" title={inst.model}>
                {inst.model}
              </div>

              <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-400 pt-1 border-t border-surface-border/60">
                <div>Пинг: <span className="text-emerald-400 font-bold">{inst.latency_ms} ms</span></div>
                <div>VRAM: <span className="text-white">{(inst.vram_mb / 1024).toFixed(1)} GB</span></div>
                <div>Активно: <span className="text-amber-400 font-bold">{inst.active_requests}</span></div>
                <div>Оценок: <span className="text-slate-300">{formatNumber(inst.total_evaluations)}</span></div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Service Control Confirmation Modal */}
      <Modal isOpen={Boolean(controlAction)} onClose={() => setControlAction(null)} title="Подтверждение управления службой">
        <div className="space-y-4 text-xs text-slate-200">
          <p>
            Вы уверены, что хотите выполнить команду{' '}
            <span className="font-bold text-amber-300 uppercase font-mono">{controlAction?.action}</span> для{' '}
            <span className="font-bold text-white">{controlAction?.name || controlAction?.service}</span>?
          </p>

          <p className="text-slate-400 text-[11px]">
            Это действие будет записано в журнал аудита действий администратора (Audit Log).
          </p>

          {controlResult && (
            <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-300 font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{controlResult}</span>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setControlAction(null)} disabled={isControlling}>
              Отмена
            </Button>
            <Button variant="danger" onClick={handleExecuteControl} disabled={isControlling}>
              {isControlling ? 'Выполнение...' : 'Подтвердить команду'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
