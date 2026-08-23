const BASE_URL = '/api';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('auth_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && !endpoint.includes('/auth/login')) {
    localStorage.removeItem('auth_token');
    window.location.href = '/login';
    throw new ApiError(401, 'Сессия истекла');
  }

  if (!response.ok) {
    let errorMsg = 'Произошла ошибка при обращении к серверу';
    try {
      const errJson = await response.json();
      if (errJson.error) errorMsg = errJson.error;
    } catch {
      // ignore
    }
    throw new ApiError(response.status, errorMsg);
  }

  return response.json();
}

export const api = {
  // Auth
  login: (credentials: { login: string; password: string; remember_me?: boolean }) =>
    request<{ token: string; user: any; settings: any; budget: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),

  register: (data: { login: string; password: string; full_name: string; role?: string; score_threshold?: number; raw_limit?: number; llm_limit?: number }) =>
    request<{ token: string; user: any; settings: any; budget: any; message: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  logout: () =>
    request<{ success: boolean }>('/auth/logout', { method: 'POST' }),

  getMe: () =>
    request<{ user: any; settings: any; budget: any }>('/auth/me'),

  changePassword: (data: { currentPassword?: string; newPassword: string }) =>
    request<{ success: boolean; message: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Analytics
  getKpi: (params: Record<string, any>) => {
    const qs = new URLSearchParams(params).toString();
    return request<any>(`/kpi?${qs}`);
  },

  getTimeseries: (params: Record<string, any>) => {
    const qs = new URLSearchParams(params).toString();
    return request<any>(`/timeseries?${qs}`);
  },

  getFunnel: (params: Record<string, any>) => {
    const qs = new URLSearchParams(params).toString();
    return request<any>(`/funnel?${qs}`);
  },

  getHistogram: (params: Record<string, any>) => {
    const qs = new URLSearchParams(params).toString();
    return request<any>(`/histogram?${qs}`);
  },

  getTop: (params: Record<string, any>) => {
    const qs = new URLSearchParams(params).toString();
    return request<any>(`/top?${qs}`);
  },

  getBreakdown: (params: Record<string, any>) => {
    const qs = new URLSearchParams(params).toString();
    return request<any>(`/breakdown?${qs}`);
  },

  // Links
  getLinks: (params: Record<string, any>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        qs.append(k, String(v));
      }
    }
    return request<any>(`/links?${qs.toString()}`);
  },

  // Projects
  getProjects: (params: Record<string, any> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request<{ projects: any[] }>(`/projects?${qs}`);
  },

  createProject: (data: { name: string; description?: string; owner_user_id?: number }) =>
    request<any>('/projects', { method: 'POST', body: JSON.stringify(data) }),

  updateProject: (id: number, data: any) =>
    request<any>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteProject: (id: number) =>
    request<{ success: boolean }>(`/projects/${id}`, { method: 'DELETE' }),

  // Queries
  getQueries: (params: Record<string, any> = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
    }
    return request<{ queries: any[]; regionsList: string[] }>(`/queries?${qs.toString()}`);
  },

  getQueryDetail: (id: number) =>
    request<any>(`/queries/${id}`),

  createQuery: (data: { project_id: number; text_orig: string; regions: string[] }) =>
    request<any>('/queries', { method: 'POST', body: JSON.stringify(data) }),

  updateQuery: (id: number, data: any) =>
    request<any>(`/queries/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteQuery: (id: number) =>
    request<{ success: boolean }>(`/queries/${id}`, { method: 'DELETE' }),

  // Settings
  getThreshold: (userId?: number) => {
    const qs = userId ? `?user_id=${userId}` : '';
    return request<any>(`/settings/threshold${qs}`);
  },

  updateThreshold: (threshold: number, userId?: number) =>
    request<any>('/settings/threshold', {
      method: 'PUT',
      body: JSON.stringify({ score_threshold: threshold, user_id: userId }),
    }),

  // Prompt
  getPrompt: (stage: 1 | 2, userId?: number) => {
    const qs = userId ? `?user_id=${userId}` : '';
    return request<any>(`/prompt/${stage}${qs}`);
  },

  updatePrompt: (stage: 1 | 2, blocks: any, userId?: number) =>
    request<any>(`/prompt/${stage}`, {
      method: 'PUT',
      body: JSON.stringify({ ...blocks, user_id: userId }),
    }),

  getPromptHistory: (stage: 1 | 2, userId?: number) => {
    const qs = userId ? `?user_id=${userId}` : '';
    return request<{ history: any[] }>(`/prompt/${stage}/history${qs}`);
  },

  // System Monitoring
  getSystemHealth: () =>
    request<any>('/system/health'),

  getHostMetrics: () =>
    request<any>('/system/host'),

  getOllamaInstances: () =>
    request<any>('/system/ollama'),

  controlService: (data: { action: string; service?: string }) =>
    request<any>('/system/control', { method: 'POST', body: JSON.stringify(data) }),

  // Admin
  getUsers: () =>
    request<{ users: any[] }>('/users'),

  createUser: (data: any) =>
    request<any>('/users', { method: 'POST', body: JSON.stringify(data) }),

  updateUser: (id: number, data: any) =>
    request<any>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  topupBudget: (id: number, data: { delta_raw?: number; delta_llm?: number; raw_limit?: number; llm_limit?: number; reason?: string }) =>
    request<any>(`/users/${id}/budget`, { method: 'POST', body: JSON.stringify(data) }),

  getAuditLogs: (params: Record<string, any> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request<{ logs: any[]; totalCount: number }>(`/audit?${qs}`);
  },

  // Export CSV
  exportCsv: async (filters: any) => {
    const token = localStorage.getItem('auth_token');
    const res = await fetch(`${BASE_URL}/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(filters),
      credentials: 'include',
    });

    if (!res.ok) throw new Error('Ошибка экспорта CSV');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crawler_export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  },
};
