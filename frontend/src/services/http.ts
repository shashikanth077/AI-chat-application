import { DEMO } from '../config';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

// FastAPI returns 422 as { detail: [{ msg, loc, ... }] } and other errors as
// { detail: "text" }. Turn either shape into one readable string.
export function extractError(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string };
      if (first.msg) return `Invalid request: ${first.msg}`;
    }
  }
  return `Request failed (HTTP ${status}).`;
}

export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

/** The server refused the content itself (a secret, or personal data in block mode), not the request. */
export class GuardrailBlockedError extends Error {}

/** fetch that turns every failure into an Error with a readable message. */
export async function fetchOrThrow(path: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    // The demo build has no server: a small in-browser stand-in answers instead
    // (loaded lazily, so a normal build never ships it in the main bundle).
    response = DEMO
      ? await (await import('../demo/api')).demoFetch(path, init)
      : await fetch(`${API_URL}${path}`, init);
  } catch (e) {
    if (isAbortError(e)) throw e;
    // fetch only rejects on network-level failures (server down, CORS block).
    throw new Error('Cannot reach the server. Is the backend running?');
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message = extractError(body, response.status);
    if (response.headers.get('x-guardrail') === 'blocked') throw new GuardrailBlockedError(message);
    throw new Error(message);
  }
  return response;
}
