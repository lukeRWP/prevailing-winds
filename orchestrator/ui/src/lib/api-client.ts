import { auth, resolveApiToken } from '@/lib/auth';

const API_URL = process.env.API_URL || 'http://localhost:8500';

export async function apiRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<{ success: boolean; message?: string; data?: T }> {
  const session = await auth();

  if (!session?.user?.pwRole) {
    throw new Error('Not authenticated');
  }

  const token = resolveApiToken(session.user.pwRole, session.user.pwApp);
  if (!token) {
    throw new Error('No API token configured for your role');
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${method} ${path} failed: ${res.status} ${text}`);
  }

  return res.json();
}

export async function apiGet<T = unknown>(path: string) {
  return apiRequest<T>('GET', path);
}

export async function apiPost<T = unknown>(path: string, body?: unknown) {
  return apiRequest<T>('POST', path, body);
}
