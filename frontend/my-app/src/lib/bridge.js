// Thin client for the local bridge (agent/server.js). The browser never holds wallet seeds:
// everything goes through the bridge.

export const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || "http://127.0.0.1:8787";

/** POST JSON. Returns { ok, data } or { ok: false, error } with the bridge's message (409, 503, 400...). */
export async function postJson(path, body) {
  let res;
  try {
    res = await fetch(`${BRIDGE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: `Bridge non raggiungibile su ${BRIDGE_URL}. È acceso?` };
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data.error ?? `Errore HTTP ${res.status}` };
  }
  return { ok: true, data: await res.json() };
}

/**
 * Opens the SSE stream. EventSource reconnects by itself; onError fires on every drop.
 * Returns a function that closes the stream.
 */
export function openEventStream({ onOpen, onError, onEvent }) {
  const es = new EventSource(`${BRIDGE_URL}/events`);
  es.onopen = onOpen;
  es.onerror = onError;
  es.onmessage = (message) => onEvent(JSON.parse(message.data));
  return () => es.close();
}

/** GET JSON. Returns { ok, data } or { ok: false, error }. */
export async function getJson(path) {
  try {
    const res = await fetch(`${BRIDGE_URL}${path}`);
    if (!res.ok) return { ok: false, error: `Errore HTTP ${res.status}` };
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, error: `Bridge non raggiungibile su ${BRIDGE_URL}` };
  }
}
