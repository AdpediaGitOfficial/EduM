'use client';

/**
 * API client. All requests go to /api/* which Next.js rewrites to the
 * NestJS backend. Handles JWT attach + one automatic refresh on 401.
 */

export interface ApiError extends Error {
  status: number;
  body?: unknown;
}

function getTokens() {
  if (typeof window === 'undefined') return { access: null, refresh: null };
  return {
    access: localStorage.getItem('edum.access'),
    refresh: localStorage.getItem('edum.refresh'),
  };
}

export function setTokens(access: string | null, refresh: string | null) {
  if (typeof window === 'undefined') return;
  if (access) localStorage.setItem('edum.access', access);
  else localStorage.removeItem('edum.access');
  if (refresh) localStorage.setItem('edum.refresh', refresh);
  else localStorage.removeItem('edum.refresh');
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const { refresh } = getTokens();
    if (!refresh) return false;
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshPromise = null), 100);
    }
  })();
  return refreshPromise;
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; raw?: boolean } = {},
): Promise<T> {
  const doFetch = async () => {
    const { access } = getTokens();
    return fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(access ? { authorization: `Bearer ${access}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  };

  let res = await doFetch();
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    const ok = await tryRefresh();
    if (ok) res = await doFetch();
    else if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth')) {
      setTokens(null, null);
      window.location.href = '/auth/login';
    }
  }
  if (!res.ok) {
    let body: unknown;
    try { body = await res.json(); } catch { /* ignore */ }
    const message =
      (body as { message?: string | string[] })?.message
        ? Array.isArray((body as { message: string[] }).message)
          ? (body as { message: string[] }).message.join(', ')
          : (body as { message: string }).message
        : `Request failed (${res.status})`;
    const err = new Error(message) as ApiError;
    err.status = res.status;
    err.body = body;
    throw err;
  }
  if (options.raw) return res as unknown as T;
  const text = await res.text();
  return text ? JSON.parse(text) : (undefined as T);
}

/** download an export/report/receipt with auth header */
export async function apiDownload(path: string, filename?: string) {
  const { access } = getTokens();
  const res = await fetch(`/api${path}`, {
    headers: access ? { authorization: `Bearer ${access}` } : {},
  });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  if (filename) a.download = filename;
  else a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function apiUpload(file: File): Promise<{ fileKey: string; name: string; size: number }> {
  const { access } = getTokens();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/files/upload', {
    method: 'POST',
    headers: access ? { authorization: `Bearer ${access}` } : {},
    body: form,
  });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
