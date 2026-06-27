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
  message_count: number;
}

export interface CreateSessionOptions {
  model?: string;
  provider?: string;
  image?: string;
  repo_url?: string;
  branch?: string;
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

export interface MessageHistoryResponse {
  messages: Array<{ id: string; role: string; content: string; timestamp: string }>;
  total: number;
  context_summary: string | null;
}

export interface ProviderSettings {
  type: 'ollama' | 'openai' | 'anthropic' | 'openai-compatible';
  base_url: string;
  api_key: string;
  model: string;
}

export interface DockerSettings {
  image: string;
  cpuLimit: number;
  memoryLimitGb: number;
}

export interface ServerSettings {
  provider: ProviderSettings;
  docker: DockerSettings;
}

export const api = {
  sessions: {
    list: () => request<{ sessions: SessionInfo[]; total: number }>('/sessions'),
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
    messages: (id: string) =>
      request<MessageHistoryResponse>(`/sessions/${id}/messages`),
    writeFile: (id: string, path: string, content: string) =>
      request<{ success: boolean; path: string }>(`/sessions/${id}/files/write`, {
        method: 'PUT',
        body: JSON.stringify({ path, content }),
      }),
  },
  settings: {
    get: () => request<{ settings: ServerSettings }>('/settings'),
    update: (settings: Partial<ServerSettings>) =>
      request<{ settings: ServerSettings }>('/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      }),
  },
  health: () => request<{ status: string }>('/health'),
};
