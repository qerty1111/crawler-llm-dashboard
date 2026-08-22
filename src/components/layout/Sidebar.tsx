import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderKanban,
  Search,
  Link2,
  Sliders,
  Terminal,
  Activity,
  ShieldAlert,
  LogOut,
  Sparkles,
  Zap
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Badge, cn } from '../ui';
import { formatNumber } from '../../utils/formatters';

export const Sidebar: React.FC = () => {
  const { user, role, budget, logout } = useAuth();

  const navItems = [
    { to: '/', label: 'Главная', icon: LayoutDashboard },
    { to: '/projects', label: 'Проекты', icon: FolderKanban },
    { to: '/queries', label: 'Запросы', icon: Search },
    { to: '/links', label: 'Ссылки', icon: Link2 },
    { to: '/settings', label: 'Настройки', icon: Sliders },
    { to: '/prompt', label: 'Промпт скорера', icon: Terminal },
    ...(role === 'admin' || role === 'manager'
      ? [
          { to: '/monitoring', label: 'Мониторинг хоста', icon: Activity },
          { to: '/admin', label: 'Админ-панель', icon: ShieldAlert },
        ]
      : []),
  ];

  const rawPct = budget && budget.raw_limit > 0 ? (budget.raw_used / budget.raw_limit) * 100 : 0;
  const llmPct = budget && budget.llm_limit > 0 ? (budget.llm_used / budget.llm_limit) * 100 : 0;

  return (
    <aside className="w-64 flex-shrink-0 bg-surface border-r border-surface-border flex flex-col h-screen select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-surface-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-brand-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-sm text-white tracking-wide leading-tight">CRAWLER AGY</h1>
            <p className="text-[11px] text-slate-400 font-mono">LLM Classifier v2.0</p>
          </div>
        </div>
        <Badge variant={role === 'admin' ? 'danger' : role === 'manager' ? 'purple' : 'info'} size="sm">
          {role?.toUpperCase()}
        </Badge>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Разделы</div>
        {navItems.map(item => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'bg-brand-600 text-white font-semibold shadow-md shadow-brand-600/20'
                    : 'text-slate-300 hover:text-white hover:bg-surface-light'
                )
              }
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Budget Card (for Client & Manager) */}
      {budget && (
        <div className="p-3 mx-3 mb-3 bg-surface-light/80 rounded-xl border border-surface-border text-xs space-y-2.5">
          <div className="flex items-center justify-between text-slate-300 font-medium">
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Бюджет клиента
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              {rawPct >= 95 || llmPct >= 95 ? '🚨 Истекает' : rawPct >= 80 || llmPct >= 80 ? '⚠️ 80%+' : 'OK'}
            </span>
          </div>

          {/* Raw Queries Progress */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Сырые запросы</span>
              <span className="font-mono">{formatNumber(budget.raw_used)} / {formatNumber(budget.raw_limit)}</span>
            </div>
            <div className="w-full h-1.5 bg-surface-border rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full transition-all duration-300 rounded-full',
                  rawPct >= 95 ? 'bg-rose-500' : rawPct >= 80 ? 'bg-amber-500' : 'bg-brand-500'
                )}
                style={{ width: `${Math.min(100, rawPct)}%` }}
              />
            </div>
          </div>

          {/* LLM Calls Progress */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Нейросеть (LLM)</span>
              <span className="font-mono">{formatNumber(budget.llm_used)} / {formatNumber(budget.llm_limit)}</span>
            </div>
            <div className="w-full h-1.5 bg-surface-border rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full transition-all duration-300 rounded-full',
                  llmPct >= 95 ? 'bg-rose-500' : llmPct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
                )}
                style={{ width: `${Math.min(100, llmPct)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* User Footer */}
      <div className="p-3 border-t border-surface-border bg-surface-light/40 flex items-center justify-between">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center font-bold text-xs text-brand-300">
            {user?.login?.slice(0, 2).toUpperCase() || 'US'}
          </div>
          <div className="overflow-hidden text-left">
            <p className="text-xs font-semibold text-white truncate">{user?.full_name || user?.login}</p>
            <p className="text-[10px] text-slate-400 truncate font-mono">@{user?.login}</p>
          </div>
        </div>
        <button
          onClick={logout}
          title="Выйти"
          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-surface-lighter rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
