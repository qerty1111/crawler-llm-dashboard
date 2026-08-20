import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Card, Button, Input, Select, Modal, Badge, cn } from '../components/ui';
import {
  ShieldAlert, Users, Plus, Edit2, Lock, Zap, FileText,
  CheckCircle2, XCircle, Search, Filter, ArrowRight
} from 'lucide-react';
import { formatNumber, formatKyivDateTime } from '../utils/formatters';

export const AdminPage: React.FC = () => {
  const { role } = useAuth();
  const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users');

  // Users State
  const [users, setUsers] = useState<any[]>([]);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  // User form states
  const [loginInput, setLoginInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [roleInput, setRoleInput] = useState<'client' | 'manager'>('client');
  const [rawLimitInput, setRawLimitInput] = useState('100000');
  const [llmLimitInput, setLlmLimitInput] = useState('80000');

  // Budget top-up form states
  const [deltaRaw, setDeltaRaw] = useState('50000');
  const [deltaLlm, setDeltaLlm] = useState('40000');
  const [budgetReason, setBudgetReason] = useState('Пополнение баланса по договору');

  // Audit Logs State
  const [logs, setLogs] = useState<any[]>([]);
  const [auditFilterActor, setAuditFilterActor] = useState('');
  const [auditFilterAction, setAuditFilterAction] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadUsers = async () => {
    try {
      const data = await api.getUsers();
      setUsers(data.users || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadAuditLogs = async () => {
    try {
      const data = await api.getAuditLogs({
        actor: auditFilterActor || undefined,
        action: auditFilterAction || undefined,
      });
      setLogs(data.logs || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    Promise.all([loadUsers(), loadAuditLogs()]).finally(() => setIsLoading(false));
  }, [auditFilterActor, auditFilterAction]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createUser({
        login: loginInput.trim(),
        password: passwordInput,
        full_name: nameInput.trim(),
        role: roleInput,
        raw_limit: Number(rawLimitInput),
        llm_limit: Number(llmLimitInput),
      });
      setIsUserModalOpen(false);
      setLoginInput('');
      setPasswordInput('');
      setNameInput('');
      loadUsers();
      loadAuditLogs();
    } catch (err: any) {
      alert(err.message || 'Ошибка создания пользователя');
    }
  };

  const handleTopupBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    try {
      await api.topupBudget(selectedUser.id, {
        delta_raw: Number(deltaRaw),
        delta_llm: Number(deltaLlm),
        reason: budgetReason,
      });
      setIsBudgetModalOpen(false);
      setSelectedUser(null);
      loadUsers();
      loadAuditLogs();
    } catch (err: any) {
      alert(err.message || 'Ошибка пополнения бюджета');
    }
  };

  const toggleUserActive = async (u: any) => {
    try {
      await api.updateUser(u.id, { is_active: !u.is_active });
      loadUsers();
      loadAuditLogs();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Switcher */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <ShieldAlert className="w-6 h-6 text-brand-400" />
            <span>Администрирование системы</span>
          </h2>
          <p className="text-xs text-slate-400">
            Управление аккаунтами клиентов, начисление бюджетов и журнал действий безопасности
          </p>
        </div>

        <div className="flex items-center gap-2 bg-surface-light border border-surface-border rounded-xl p-1">
          <button
            onClick={() => setActiveTab('users')}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              activeTab === 'users'
                ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Пользователи ({users.length})</span>
          </button>

          {role === 'admin' && (
            <button
              onClick={() => setActiveTab('audit')}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                activeTab === 'audit'
                  ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Журнал действий ({logs.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab 1: Users Management */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsUserModalOpen(true)}
              className="gap-2 text-xs"
            >
              <Plus className="w-4 h-4" />
              Завести нового клиента
            </Button>
          </div>

          <Card className="p-0 overflow-hidden border-surface-border">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-light border-b border-surface-border text-slate-400 select-none">
                  <tr>
                    <th className="py-3 px-4 font-semibold w-12">#</th>
                    <th className="py-3 px-4 font-semibold">Логин и ФИО</th>
                    <th className="py-3 px-4 font-semibold">Роль</th>
                    <th className="py-3 px-4 font-semibold">Статус</th>
                    <th className="py-3 px-4 font-semibold">Сырой бюджет</th>
                    <th className="py-3 px-4 font-semibold">LLM бюджет</th>
                    <th className="py-3 px-4 font-semibold text-center">Запросов</th>
                    <th className="py-3 px-4 font-semibold text-right">Посл. вход</th>
                    <th className="py-3 px-4 font-semibold text-right">Действия</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-surface-border/40 font-mono">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-surface-light/50 transition-colors">
                      <td className="py-3 px-4 text-slate-500 font-bold">#{u.id}</td>

                      <td className="py-3 px-4 font-sans">
                        <div className="font-semibold text-white">{u.full_name}</div>
                        <div className="font-mono text-[11px] text-slate-400">@{u.login}</div>
                      </td>

                      <td className="py-3 px-4 font-sans">
                        <Badge
                          variant={u.role === 'admin' ? 'danger' : u.role === 'manager' ? 'purple' : 'info'}
                          size="sm"
                        >
                          {u.role.toUpperCase()}
                        </Badge>
                      </td>

                      <td className="py-3 px-4 font-sans">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-md border text-[11px] font-semibold',
                            u.is_active
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                          )}
                        >
                          {u.is_active ? 'Активен' : 'Заблокирован'}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        {u.budget ? (
                          <div>
                            <span className="text-slate-200 font-bold">{formatNumber(u.budget.raw_used)}</span>
                            <span className="text-slate-500"> / {formatNumber(u.budget.raw_limit)}</span>
                            <div className="text-[10px] text-brand-400">{u.budget.raw_pct}%</div>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>

                      <td className="py-3 px-4">
                        {u.budget ? (
                          <div>
                            <span className="text-slate-200 font-bold">{formatNumber(u.budget.llm_used)}</span>
                            <span className="text-slate-500"> / {formatNumber(u.budget.llm_limit)}</span>
                            <div className="text-[10px] text-emerald-400">{u.budget.llm_pct}%</div>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>

                      <td className="py-3 px-4 text-center font-bold text-slate-200">
                        {u.queries_count || 0}
                      </td>

                      <td className="py-3 px-4 text-right text-slate-400 text-[11px]">
                        {formatKyivDateTime(u.last_login_at)}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 font-sans">
                          {role === 'admin' && u.budget && (
                            <button
                              onClick={() => { setSelectedUser(u); setIsBudgetModalOpen(true); }}
                              title="Пополнить бюджет"
                              className="px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 transition-colors text-[11px] font-semibold flex items-center gap-1"
                            >
                              <Zap className="w-3 h-3" />
                              Бюджет
                            </button>
                          )}
                          <button
                            onClick={() => toggleUserActive(u)}
                            title={u.is_active ? 'Заблокировать' : 'Разблокировать'}
                            className="p-1.5 rounded-lg bg-surface-lighter hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                          >
                            {u.is_active ? <XCircle className="w-3.5 h-3.5 text-rose-400" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 2: Audit Logs */}
      {activeTab === 'audit' && role === 'admin' && (
        <div className="space-y-4">
          {/* Audit Filters */}
          <Card className="p-4 flex items-center gap-3">
            <div className="relative w-64">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Фильтр по автору..."
                value={auditFilterActor}
                onChange={(e) => setAuditFilterActor(e.target.value)}
                className="w-full bg-surface-light border border-surface-border rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500"
              />
            </div>

            <select
              value={auditFilterAction}
              onChange={(e) => setAuditFilterAction(e.target.value)}
              className="bg-surface-light border border-surface-border rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
            >
              <option value="">Все действия</option>
              <option value="login">login</option>
              <option value="create_user">create_user</option>
              <option value="topup_budget">topup_budget</option>
              <option value="edit_prompt">edit_prompt</option>
              <option value="start_parser">start_parser</option>
              <option value="stop_parser">stop_parser</option>
              <option value="export_csv">export_csv</option>
              <option value="change_threshold">change_threshold</option>
            </select>
          </Card>

          {/* Audit Table */}
          <Card className="p-0 overflow-hidden border-surface-border">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-surface-light border-b border-surface-border text-slate-400 font-sans">
                  <tr>
                    <th className="py-3 px-4 font-semibold w-40">Время (Kyiv)</th>
                    <th className="py-3 px-4 font-semibold w-36">Кто (Actor)</th>
                    <th className="py-3 px-4 font-semibold w-36">Действие</th>
                    <th className="py-3 px-4 font-semibold w-32">Объект</th>
                    <th className="py-3 px-4 font-semibold">Изменения (Diff/Payload)</th>
                    <th className="py-3 px-4 font-semibold text-right w-32">IP адрес</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-surface-border/40">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-surface-light/40">
                      <td className="py-3 px-4 text-slate-400">{formatKyivDateTime(log.created_at)}</td>
                      <td className="py-3 px-4 text-brand-300 font-bold font-sans">@{log.actor_name || 'system'}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-md bg-surface-lighter border border-surface-border text-amber-300 text-[11px] font-bold">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400 font-sans">{log.entity} #{log.entity_id}</td>
                      <td className="py-3 px-4 text-slate-300 text-[11px] max-w-md truncate" title={JSON.stringify(log.payload)}>
                        {JSON.stringify(log.payload)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-500">{log.ip}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Create User Modal */}
      <Modal isOpen={isUserModalOpen} onClose={() => setIsUserModalOpen(false)} title="Создание пользователя / клиента">
        <form onSubmit={handleCreateUser} className="space-y-4">
          <Input
            label="Логин для входа"
            placeholder="client_name"
            value={loginInput}
            onChange={(e) => setLoginInput(e.target.value)}
            required
            autoFocus
          />

          <Input
            label="Пароль"
            type="password"
            placeholder="••••••••••••"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            required
          />

          <Input
            label="ФИО / Название организации"
            placeholder="ООО «ОтельСофт»"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            required
          />

          {role === 'admin' && (
            <Select
              label="Роль"
              value={roleInput}
              onChange={(e) => setRoleInput(e.target.value as any)}
            >
              <option value="client">Client (Клиент)</option>
              <option value="manager">Manager (Менеджер)</option>
            </Select>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Лимит сырых запросов"
              type="number"
              value={rawLimitInput}
              onChange={(e) => setRawLimitInput(e.target.value)}
            />
            <Input
              label="Лимит LLM вызовов"
              type="number"
              value={llmLimitInput}
              onChange={(e) => setLlmLimitInput(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" type="button" onClick={() => setIsUserModalOpen(false)}>Отмена</Button>
            <Button variant="primary" type="submit">Создать аккаунт</Button>
          </div>
        </form>
      </Modal>

      {/* Budget Top-up Modal */}
      <Modal isOpen={isBudgetModalOpen} onClose={() => setIsBudgetModalOpen(false)} title={`Пополнение бюджета: ${selectedUser?.full_name}`}>
        <form onSubmit={handleTopupBudget} className="space-y-4">
          <div className="p-3 bg-surface-light rounded-xl border border-surface-border text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Текущий сырой баланс:</span>
              <span className="font-mono font-bold text-white">
                {formatNumber(selectedUser?.budget?.raw_used)} / {formatNumber(selectedUser?.budget?.raw_limit)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Текущий LLM баланс:</span>
              <span className="font-mono font-bold text-white">
                {formatNumber(selectedUser?.budget?.llm_used)} / {formatNumber(selectedUser?.budget?.llm_limit)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="+ Сырые поисковые запросы"
              type="number"
              value={deltaRaw}
              onChange={(e) => setDeltaRaw(e.target.value)}
              required
            />
            <Input
              label="+ LLM вызовы нейросети"
              type="number"
              value={deltaLlm}
              onChange={(e) => setDeltaLlm(e.target.value)}
              required
            />
          </div>

          <Input
            label="Причина / Примечание к начислению"
            value={budgetReason}
            onChange={(e) => setBudgetReason(e.target.value)}
            placeholder="Оплата счета №124, topup"
            required
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" type="button" onClick={() => setIsBudgetModalOpen(false)}>Отмена</Button>
            <Button variant="primary" type="submit">Начислить бюджет</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
