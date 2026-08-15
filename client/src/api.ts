import type { ExecuteResponse, Me, ProgressModule, PublicCard, CardStatus } from './types';

// Same-origin API (the API serves the client in production; Vite proxies /api in dev).
async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const message = (data && (data.messageFr || data.error)) || `Erreur ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

export const api = {
  me: () => request<{ user: Me | null }>('GET', '/api/me'),
  createUser: (display_name: string) =>
    request<Me>('POST', '/api/users', { display_name }),
  login: (display_name: string) =>
    request<Me>('POST', '/api/sessions', { display_name }),
  logout: () => request<void>('DELETE', '/api/sessions/current'),
  progress: () => request<{ modules: ProgressModule[] }>('GET', '/api/progress'),
  card: (slug: string) =>
    request<{ card: PublicCard; status: CardStatus }>('GET', `/api/cards/${slug}`),
  executeSql: (slug: string, sql: string) =>
    request<ExecuteResponse>('POST', `/api/cards/${slug}/execute`, { sql }),
  executeQuiz: (slug: string, choice: number) =>
    request<ExecuteResponse>('POST', `/api/cards/${slug}/execute`, { choice }),
  hint: (slug: string, index: number) =>
    request<{ hint_fr: string; index: number; remaining: number }>('POST', `/api/cards/${slug}/hint`, { index }),
  solution: (slug: string) =>
    request<{ solution_sql: string | null; explanation_fr: string }>('POST', `/api/cards/${slug}/solution`),
};
