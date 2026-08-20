import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card, Button, Input, cn } from '../components/ui';
import {
  Sparkles, ShieldAlert, ArrowRight,
  UserCheck, KeyRound, Building2, UserPlus, CheckCircle2
} from 'lucide-react';

export const LoginPage: React.FC = () => {
  // Mode: 'login' vs 'register'
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  // Selected Role Tab: 'client' | 'manager' | 'admin'
  const [selectedRole, setSelectedRole] = useState<'client' | 'manager' | 'admin'>('client');

  // Form Fields - strictly empty without hints
  const [loginInput, setLoginInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [fullNameInput, setFullNameInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { login: authLogin, register: authRegister } = useAuth();
  const navigate = useNavigate();

  // Reset form errors and ensure admin stays on 'login' mode
  useEffect(() => {
    setError(null);
    setSuccessMessage(null);
    if (selectedRole === 'admin') {
      setAuthMode('login');
    }
  }, [authMode, selectedRole]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginInput || !passwordInput) {
      setError('Необходимо ввести имя пользователя и пароль');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await authLogin({ login: loginInput.trim(), password: passwordInput });
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Неверный логин или пароль');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginInput.trim() || !passwordInput || !fullNameInput.trim()) {
      setError('Заполните все обязательные поля');
      return;
    }

    if (passwordInput.length < 6) {
      setError('Пароль должен содержать минимум 6 символов');
      return;
    }

    if (passwordInput !== confirmPasswordInput) {
      setError('Пароли не совпадают');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await authRegister({
        login: loginInput.trim(),
        password: passwordInput,
        full_name: fullNameInput.trim(),
        role: selectedRole,
        score_threshold: 7,
      });
      setSuccessMessage('Учетная запись успешно создана! Входим...');
      setTimeout(() => {
        navigate('/');
      }, 800);
    } catch (err: any) {
      setError(err.message || 'Ошибка при регистрации аккаунта');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Glow Backdrops */}
      <div className="absolute top-1/4 left-1/3 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-brand-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container Card */}
      <Card className="w-full max-w-md p-8 border-surface-border bg-surface/95 backdrop-blur-md shadow-2xl relative z-10 space-y-6">
        {/* Brand Title */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-500 items-center justify-center shadow-lg shadow-brand-500/25 mb-1">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Crawler & LLM Classifier</h1>
          <p className="text-xs text-slate-400">
            Система поиска, классификации отельного ПО и выдачи результатов
          </p>
        </div>

        {/* 1. Role Selection Tabs (Client / Manager / Admin) */}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-center">
            Выберите тип доступа
          </label>
          <div className="grid grid-cols-3 gap-2 bg-surface-light p-1 rounded-xl border border-surface-border">
            <button
              type="button"
              onClick={() => setSelectedRole('client')}
              className={cn(
                'flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all',
                selectedRole === 'client'
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Клиент</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedRole('manager')}
              className={cn(
                'flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all',
                selectedRole === 'manager'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Менеджер</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedRole('admin');
                setAuthMode('login');
              }}
              className={cn(
                'flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all',
                selectedRole === 'admin'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Админ</span>
            </button>
          </div>
        </div>

        {/* 2. Mode Switcher (Login vs Register) - Only shown for Client & Manager */}
        {selectedRole !== 'admin' && (
          <div className="flex border-b border-surface-border">
            <button
              type="button"
              onClick={() => setAuthMode('login')}
              className={cn(
                'flex-1 pb-2.5 text-xs font-bold transition-all text-center border-b-2',
                authMode === 'login'
                  ? 'border-brand-500 text-white'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              )}
            >
              Вход в аккаунт
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('register')}
              className={cn(
                'flex-1 pb-2.5 text-xs font-bold transition-all text-center border-b-2',
                authMode === 'register'
                  ? 'border-brand-500 text-white'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              )}
            >
              Регистрация нового пользователя
            </button>
          </div>
        )}

        {/* Alert Messages */}
        {error && (
          <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 font-semibold">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Form: LOGIN */}
        {authMode === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <Input
              id="login_user"
              name="username"
              label="Имя пользователя / Логин"
              value={loginInput}
              onChange={(e) => setLoginInput(e.target.value)}
              autoComplete="username"
              required
              autoFocus
            />

            <Input
              id="login_pass"
              name="password"
              label="Пароль"
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              autoComplete="current-password"
              required
            />

            <div className="flex items-center justify-between text-xs text-slate-400">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-surface-border bg-surface-light accent-brand-500 cursor-pointer"
                />
                <span>Запомнить имя пользователя</span>
              </label>

              <span className="text-[11px] text-slate-500">Автосохранение в БД</span>
            </div>

            <Button
              type="submit"
              variant={selectedRole === 'admin' ? 'danger' : 'primary'}
              size="lg"
              className="w-full mt-2"
              disabled={isLoading}
            >
              {isLoading ? (
                <span>⏳ Вход в систему...</span>
              ) : (
                <>
                  <span>Войти в систему</span>
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </>
              )}
            </Button>
          </form>
        )}

        {/* Form: REGISTER (Clients and Managers only) */}
        {authMode === 'register' && selectedRole !== 'admin' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
            <Input
              id="reg_fullname"
              name="name"
              label="ФИО / Название организации"
              value={fullNameInput}
              onChange={(e) => setFullNameInput(e.target.value)}
              autoComplete="name"
              required
              autoFocus
            />

            <Input
              id="reg_username"
              name="username"
              label="Желаемый логин"
              value={loginInput}
              onChange={(e) => setLoginInput(e.target.value)}
              autoComplete="username"
              required
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                id="reg_pass"
                name="new-password"
                label="Пароль"
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                autoComplete="new-password"
                required
              />

              <Input
                id="reg_pass_confirm"
                name="confirm-password"
                label="Повтор пароля"
                type="password"
                value={confirmPasswordInput}
                onChange={(e) => setConfirmPasswordInput(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            <Button type="submit" variant="primary" size="lg" className="w-full mt-2" disabled={isLoading}>
              {isLoading ? (
                <span>⏳ Регистрация и вход...</span>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-1.5" />
                  <span>Зарегистрироваться и войти</span>
                </>
              )}
            </Button>
          </form>
        )}
      </Card>

      {/* Footer Info */}
      <footer className="mt-6 text-center text-xs text-slate-500 font-mono">
        PostgreSQL Server: 185.86.76.127:5432 • Timezone: Europe/Kyiv • Real-time WebSocket Hub
      </footer>
    </div>
  );
};
