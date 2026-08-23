import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole, Budget } from '../types';
import { api } from '../api/client';

interface AuthContextType {
  user: User | null;
  role: UserRole | null;
  token: string | null;
  scoreThreshold: number;
  budget: Budget | null;
  isLoading: boolean;
  login: (credentials: { login: string; password: string; remember_me?: boolean }) => Promise<void>;
  register: (data: { login: string; password: string; full_name: string; role?: 'client' | 'manager' | 'admin'; score_threshold?: number; raw_limit?: number; llm_limit?: number }) => Promise<void>;
  logout: () => Promise<void>;
  setScoreThreshold: (threshold: number) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('auth_token'));
  const [scoreThreshold, setScoreThresholdState] = useState<number>(7);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchCurrentUser = async () => {
    try {
      const data = await api.getMe();
      setUser(data.user);
      setScoreThresholdState(data.settings?.score_threshold ?? 7);
      setBudget(data.budget);
    } catch (err) {
      setUser(null);
      setToken(null);
      localStorage.removeItem('auth_token');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchCurrentUser();
    } else {
      setIsLoading(false);
    }
  }, [token]);

  const login = async (credentials: { login: string; password: string; remember_me?: boolean }) => {
    const data = await api.login(credentials);
    localStorage.setItem('auth_token', data.token);
    setToken(data.token);
    setUser(data.user);
    setScoreThresholdState(data.settings?.score_threshold ?? 7);
    setBudget(data.budget);
  };

  const register = async (regData: { login: string; password: string; full_name: string; role?: 'client' | 'manager' | 'admin'; score_threshold?: number; raw_limit?: number; llm_limit?: number }) => {
    const data = await api.register(regData);
    localStorage.setItem('auth_token', data.token);
    setToken(data.token);
    setUser(data.user);
    setScoreThresholdState(data.settings?.score_threshold ?? 7);
    setBudget(data.budget);
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    localStorage.removeItem('auth_token');
    setToken(null);
    setUser(null);
    setBudget(null);
  };

  const setScoreThreshold = async (newThreshold: number) => {
    setScoreThresholdState(newThreshold);
    try {
      await api.updateThreshold(newThreshold);
    } catch (err) {
      console.error('Failed to update threshold on server', err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role || null,
        token,
        scoreThreshold,
        budget,
        isLoading,
        login,
        register,
        logout,
        setScoreThreshold,
        refreshUser: fetchCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
