// ============================================================
// API 客户端 —— fetch 封装 + X-API-Key 注入 + 错误映射
// ============================================================

const BASE_URL = '/api';

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = 'ApiError';
  }
}

function getApiKey(): string | undefined {
  try {
    const raw = localStorage.getItem('cogito-settings');
    if (raw) {
      const settings = JSON.parse(raw);
      return settings.apiKey || undefined;
    }
  } catch {
    // ignore
  }
  return undefined;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: { error?: { code?: string; message?: string } } = {};
    try {
      body = await res.json();
    } catch {
      // response is not JSON
    }
    throw new ApiError(
      body.error?.code ?? 'E_UNKNOWN',
      body.error?.message ?? `HTTP ${res.status}`,
      res.status,
    );
  }
  return res.json() as Promise<T>;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  const apiKey = getApiKey();
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  return handleResponse<T>(res);
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  /** multipart 上传（文档） */
  upload: <T>(path: string, formData: FormData) => {
    const headers: Record<string, string> = {};
    const apiKey = getApiKey();
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }
    return fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      body: formData,
      headers,
    }).then((res) => handleResponse<T>(res));
  },
};
