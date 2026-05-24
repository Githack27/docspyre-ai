declare const process: {
  env?: {
    NEXT_PUBLIC_API_URL?: string;
  };
};

export const API_BASE_URL = typeof process !== 'undefined' && process.env
  ? process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
  : 'http://localhost:3001';

export interface RequestOptions extends RequestInit {
  params?: Record<string, string>;
}

export async function fetchClient<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { params, ...init } = options;
  let url = `${API_BASE_URL}${path}`;

  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}
