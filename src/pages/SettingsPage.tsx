import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, Button, Input, Badge, cn } from '../components/ui';
import { api } from '../api/client';
import { Sliders, Zap, Lock, AlertTriangle, CheckCircle2, ShieldAlert, Info } from 'lucide-react';
import { formatNumber } from '../utils/formatters';

export const SettingsPage: React.FC = () => {
  const { user, scoreThreshold, setScoreThreshold, budget } = useAuth();

  const [sliderVal, setSliderVal] = useState<number>(scoreThreshold);
  const [isSaved, setIsSaved] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passError, setPassError] = useState<string | null>(null);
  const [passSuccess, setPassSuccess] = useState(false);
  const [isPassLoading, setIsPassLoading] = useState(false);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setSliderVal(val);
    setScoreThreshold(val);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setPassError('Пароль должен быть не менее 6 символов');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassError('Пароли не совпадают');
      return;
    }

    setIsPassLoading(true);
    setPassError(null);
    setPassSuccess(false);

    try {
      await api.changePassword({ currentPassword, newPassword });
      setPassSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPassError(err.message || 'Ошибка смены пароля');
    } finally {
      setIsPassLoading(false);
    }
  };

  const rawPct = budget && budget.raw_limit > 0 ? Math.round((budget.raw_used / budget.raw_limit) * 1000) / 10 : 0;
  const llmPct = budget && budget.llm_limit > 0 ? Math.round((budget.llm_used / budget.llm_limit) * 1000) / 10 : 0;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2.5">
          <Sliders className="w-6 h-6 text-brand-400" />
          <span>Настройки клиента</span>
        </h2>
        <p className="text-xs text-slate-400">
          Управление порогом фильтрации выдачи, мониторинг бюджета и безопасность аккаунта
        </p>
      </div>

      {/* 1. Score Threshold Slider Card */}
      <Card className="p-6 space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-surface-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Sliders className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Порог оценки (Score Threshold)</h3>
              <p className="text-xs text-slate-400">
                Значение score (0–10), начиная с которого ссылка считается подходящей для вашего аккаунта
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isSaved && (
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Сохранено
              </span>
            )}
            <Badge variant="success" size="md" className="font-mono text-sm font-bold">
              score ≥ {sliderVal}
            </Badge>
          </div>
        </div>

        {/* Slider */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>6 (Минимальный порог)</span>
            <span>7 (Рекомендуемый)</span>
            <span>8</span>
            <span>9</span>
            <span>10 (Строгий отбор)</span>
          </div>

          <input
            type="range"
            min="6"
            max="10"
            step="1"
            value={sliderVal}
            onChange={handleSliderChange}
            className="w-full h-2 bg-surface-light rounded-lg appearance-none cursor-pointer accent-emerald-500"
          />

          {/* Warnings */}
          {sliderVal < 7 && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>При таком пороге в выдачу попадёт много нерелевантных сайтов.</span>
            </div>
          )}

          {sliderVal === 10 && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>При таком пороге результатов будет крайне мало.</span>
            </div>
          )}

          <div className="p-3 bg-surface-light/60 border border-surface-border rounded-xl text-xs text-slate-400 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5" />
            <p>
              Порог <span className="text-slate-200 font-semibold">не влияет на работу софта</span> и не изменяет расход бюджета — это исключительно фильтр отображения в витрине и экспорте. Нейросеть в любом случае оценивает все ссылки, дошедшие до Этапа 2.
            </p>
          </div>
        </div>
      </Card>

      {/* 2. Budget Details Card */}
      {budget && (
        <Card className="p-6 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-surface-border">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Zap className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Остаток бюджета запросов</h3>
                <p className="text-xs text-slate-400">
                  Учёт сырых обращений парсера к поисковикам и вызовов LLM-классификатора
                </p>
              </div>
            </div>

            <span className="text-xs text-slate-400 font-mono">
              Обновлено: {budget.updated_at ? new Date(budget.updated_at).toLocaleTimeString('ru-RU') : 'сейчас'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Raw Queries */}
            <div className="p-4 bg-surface-light rounded-xl border border-surface-border space-y-3">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-slate-300">Сырые поисковые запросы</span>
                <span className={cn('font-mono', rawPct >= 95 ? 'text-rose-400' : rawPct >= 80 ? 'text-amber-400' : 'text-brand-400')}>
                  {rawPct}%
                </span>
              </div>

              <div className="w-full h-2.5 bg-surface rounded-full overflow-hidden border border-surface-border">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    rawPct >= 95 ? 'bg-rose-500' : rawPct >= 80 ? 'bg-amber-500' : 'bg-brand-500'
                  )}
                  style={{ width: `${Math.min(100, rawPct)}%` }}
                />
              </div>

              <div className="flex justify-between text-xs text-slate-400 font-mono">
                <span>Израсходовано: {formatNumber(budget.raw_used)}</span>
                <span>Лимит: {formatNumber(budget.raw_limit)}</span>
              </div>
            </div>

            {/* LLM Calls */}
            <div className="p-4 bg-surface-light rounded-xl border border-surface-border space-y-3">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-slate-300">Нейросетевые запросы (LLM)</span>
                <span className={cn('font-mono', llmPct >= 95 ? 'text-rose-400' : llmPct >= 80 ? 'text-amber-400' : 'text-emerald-400')}>
                  {llmPct}%
                </span>
              </div>

              <div className="w-full h-2.5 bg-surface rounded-full overflow-hidden border border-surface-border">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    llmPct >= 95 ? 'bg-rose-500' : llmPct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
                  )}
                  style={{ width: `${Math.min(100, llmPct)}%` }}
                />
              </div>

              <div className="flex justify-between text-xs text-slate-400 font-mono">
                <span>Израсходовано: {formatNumber(budget.llm_used)}</span>
                <span>Лимит: {formatNumber(budget.llm_limit)}</span>
              </div>
            </div>
          </div>

          {(rawPct >= 95 || llmPct >= 95) && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2 font-semibold">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              <span>Лимит бюджета почти исчерпан. Пожалуйста, обратитесь к менеджеру для пополнения.</span>
            </div>
          )}
        </Card>
      )}

      {/* 3. Password Change Card */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-surface-border">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Lock className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Безопасность и смена пароля</h3>
            <p className="text-xs text-slate-400">Обновите пароль для входа в ваш личный кабинет</p>
          </div>
        </div>

        {passError && (
          <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" />
            <span>{passError}</span>
          </div>
        )}

        {passSuccess && (
          <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center gap-2 font-semibold">
            <CheckCircle2 className="w-4 h-4" />
            <span>Пароль успешно обновлен!</span>
          </div>
        )}

        <form onSubmit={handlePasswordSubmit} className="space-y-3 max-w-md">
          <Input
            label="Текущий пароль"
            type="password"
            placeholder="••••••••••••"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <Input
            label="Новый пароль (мин. 6 символов)"
            type="password"
            placeholder="••••••••••••"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <Input
            label="Подтверждение нового пароля"
            type="password"
            placeholder="••••••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />

          <Button type="submit" variant="primary" size="sm" disabled={isPassLoading}>
            {isPassLoading ? 'Сохранение...' : 'Обновить пароль'}
          </Button>
        </form>
      </Card>
    </div>
  );
};
