import { Channel, invoke, isTauri } from '@tauri-apps/api/core';

export interface BackendStartupStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  detail: string | null;
}

export interface BackendStatus {
  ready: boolean;
  error: string | null;
  configPath: string;
  steps: BackendStartupStep[];
  elapsedSeconds: number;
  logsDirectory?: string | null;
}

export const inDesktop = (): boolean => typeof window !== 'undefined' && isTauri();

interface BridgeRequestPayload {
  [key: string]: unknown;
  path: string;
  method: string;
  body: string | null;
  bodyBytes: number[] | null;
  headers: Record<string, string> | null;
  authorization: string | null;
}

async function bridgeRequest(url: string, init: RequestInit): Promise<BridgeRequestPayload> {
  let path = url;
  try {
    const parsed = new URL(url, 'http://127.0.0.1');
    path = parsed.pathname + parsed.search;
  } catch {}

  const rawHeaders = new Headers(init.headers);
  const authorization = rawHeaders.get('Authorization');

  let body: string | null = null;
  let bodyBytes: number[] | null = null;
  const headersObj: Record<string, string> = {};

  rawHeaders.forEach((value, key) => {
    headersObj[key] = value;
  });

  if (init.body !== undefined && init.body !== null) {
    if (typeof init.body === 'string') {
      body = init.body;
      if (!headersObj['content-type']) {
        headersObj['content-type'] = 'application/json';
      }
    } else if (typeof FormData !== 'undefined' && init.body instanceof FormData) {
      const response = new Response(init.body);
      const buffer = await response.arrayBuffer();
      bodyBytes = Array.from(new Uint8Array(buffer));
      const ct = response.headers.get('content-type');
      if (ct) {
        headersObj['content-type'] = ct;
      }
    } else if (init.body instanceof Blob) {
      const buffer = await init.body.arrayBuffer();
      bodyBytes = Array.from(new Uint8Array(buffer));
      if (init.body.type) {
        headersObj['content-type'] = init.body.type;
      }
    } else if (init.body instanceof ArrayBuffer || ArrayBuffer.isView(init.body)) {
      const view =
        init.body instanceof ArrayBuffer
          ? new Uint8Array(init.body)
          : new Uint8Array(init.body.buffer, init.body.byteOffset, init.body.byteLength);
      bodyBytes = Array.from(view);
    } else {
      body = String(init.body);
    }
  }

  return {
    path,
    method: init.method ?? 'GET',
    body,
    bodyBytes,
    headers: Object.keys(headersObj).length > 0 ? headersObj : null,
    authorization,
  };
}

export async function desktopFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (!inDesktop()) return fetch(url, init);
  const payload = await bridgeRequest(url, init);
  const result = await invoke<{
    status: number;
    body: string;
    bodyBytes?: number[] | null;
    contentType: string;
  }>('api_request', payload);

  const responseBody =
    result.bodyBytes && result.bodyBytes.length > 0
      ? new Uint8Array(result.bodyBytes)
      : (result.body || null);

  return new Response(responseBody, {
    status: result.status,
    headers: { 'Content-Type': result.contentType },
  });
}

type StreamMessage =
  | { kind: 'start'; status: number; contentType: string }
  | { kind: 'data'; text: string }
  | { kind: 'end' }
  | { kind: 'error'; message: string };

export async function desktopStreamFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (!inDesktop()) return fetch(url, init);
  const streamId = crypto.randomUUID();
  const signal = init.signal ?? undefined;
  if (signal?.aborted) throw new DOMException('The request was aborted.', 'AbortError');
  const encoder = new TextEncoder();
  const cancel = () => {
    void invoke('api_stream_cancel', { streamId }).catch(() => undefined);
  };

  const payload = await bridgeRequest(url, init);

  return new Promise<Response>((resolve, reject) => {
    let body: ReadableStreamDefaultController<Uint8Array> | null = null;
    let settled = false;
    const fail = (error: Error) => {
      if (!settled) {
        settled = true;
        reject(error);
        return;
      }
      try {
        body?.error(error);
      } catch {}
    };
    const onAbort = () => {
      cancel();
      fail(new DOMException('The request was aborted.', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    const channel = new Channel<StreamMessage>();
    channel.onmessage = (message) => {
      if (message.kind === 'start') {
        settled = true;
        const stream = new ReadableStream<Uint8Array>({
          start: (controller) => {
            body = controller;
          },
          cancel: () => {
            signal?.removeEventListener('abort', onAbort);
            cancel();
          },
        });
        resolve(new Response(stream, { status: message.status, headers: { 'Content-Type': message.contentType } }));
      } else if (message.kind === 'data') {
        body?.enqueue(encoder.encode(message.text));
      } else if (message.kind === 'end') {
        signal?.removeEventListener('abort', onAbort);
        try {
          body?.close();
        } catch {}
      } else {
        signal?.removeEventListener('abort', onAbort);
        fail(new Error(message.message));
      }
    };

    invoke('api_stream', {
      path: payload.path,
      method: payload.method,
      body: payload.body,
      authorization: payload.authorization,
      streamId,
      onEvent: channel,
    }).catch((error) => {
      signal?.removeEventListener('abort', onAbort);
      fail(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

let transportInitialized = false;

export function initializeDesktopTransport(): void {
  if (transportInitialized || !inDesktop()) return;
  transportInitialized = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url: string;
    if (typeof input === 'string') {
      url = input;
    } else if (input instanceof URL) {
      url = input.toString();
    } else if (input && typeof input === 'object' && 'url' in input) {
      url = (input as Request).url;
    } else {
      return originalFetch(input, init);
    }

    const isApi =
      url.startsWith('/api/') ||
      url.includes('/api/v1') ||
      ((url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) && url.includes('/api/'));

    if (!isApi) {
      return originalFetch(input, init);
    }

    const isStream =
      url.includes('/messages/stream') ||
      url.includes('/generate') ||
      Boolean(init?.headers && new Headers(init.headers).get('Accept')?.includes('text/event-stream'));

    if (isStream) {
      return desktopStreamFetch(url, init);
    }

    return desktopFetch(url, init);
  };
}

export const backendStatus = () => invoke<BackendStatus>('backend_status');
export const notifyFrontendReady = () => invoke<void>('frontend_ready');
