const API_BASE = '/api';

export interface SessionInfo {
  id: string;
  status: string;
  model: string;
  container_id: string | null;
  created_at: string;
  updated_at: string;
  last_active_at: string;
  context_summary: string | null;
  history_json: string;
}

export interface CreateSessionOptions {
  model?: string;
  provider?: string;
  image?: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  sessions: {
    list: () => request<SessionInfo[]>('/sessions'),
    get: (id: string) => request<SessionInfo>(`/sessions/${id}`),
    create: (opts?: CreateSessionOptions) =>
      request<SessionInfo>('/sessions', {
        method: 'POST',
        body: JSON.stringify(opts ?? {}),
      }),
    delete: (id: string) =>
      request<void>(`/sessions/${id}`, { method: 'DELETE' }),
    resume: (id: string) =>
      request<SessionInfo>(`/sessions/${id}/resume`, { method: 'POST' }),
  },
  health: () => request<{ status: string }>('/health'),
};
