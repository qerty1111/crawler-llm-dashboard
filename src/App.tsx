import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PeriodProvider } from './context/PeriodContext';
import { SocketProvider } from './context/SocketContext';
import { Layout } from './components/layout/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { QueriesPage } from './pages/QueriesPage';
import { QueryDetailPage } from './pages/QueryDetailPage';
import { LinksPage } from './pages/LinksPage';
import { SettingsPage } from './pages/SettingsPage';
import { PromptPage } from './pages/PromptPage';
import { MonitoringPage } from './pages/MonitoringPage';
import { AdminPage } from './pages/AdminPage';

const ProtectedRoute: React.FC<{ children: React.ReactNode; allowedRoles?: string[] }> = ({
  children,
  allowedRoles,
}) => {
  const { user, role, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-background flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
          <span className="text-xs font-mono">Загрузка сессии...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Route */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected Routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <PeriodProvider>
                  <SocketProvider>
                    <Layout />
                  </SocketProvider>
                </PeriodProvider>
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="queries" element={<QueriesPage />} />
            <Route path="queries/:id" element={<QueryDetailPage />} />
            <Route path="links" element={<LinksPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="prompt" element={<PromptPage />} />
            <Route
              path="monitoring"
              element={
                <ProtectedRoute allowedRoles={['admin', 'manager']}>
                  <MonitoringPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin"
              element={
                <ProtectedRoute allowedRoles={['admin', 'manager']}>
                  <AdminPage />
                </ProtectedRoute>
              }
            />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};
