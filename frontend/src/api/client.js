// Frontend: low-level HTTP client — shared URL builder and JSON fetch wrapper.
// This is the single place that talks to fetch(); everything else goes through
// endpoints.js (URLs) and the mutation/query hooks.

export function buildUrl(url, params) {
  if (!params) return url;
  // Convert a plain object into a query string and skip empty values.
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  if (!query) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
}

export async function fetchJson(url, options = {}) {
  // Always send cookies so authenticated API calls work in the browser.
  const res = await fetch(url, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    // Prefer backend error messages when available, otherwise fall back to HTTP status text.
    const fallback = res.statusText || "Request failed";
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || data?.message || fallback);
  }
  // A 204 has no body to parse; DELETE endpoints answer that way.
  if (res.status === 204) return null;
  return res.json();
}

// Convenience: options object for a JSON request body.
export function jsonBody(body) {
  return {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// POST to a Server-Sent Events endpoint and call onEvent with every `data:`
// payload, parsed. Comment lines (": keepalive") and malformed payloads are
// skipped. A non-2xx answer throws before any event, carrying `status` so a
// caller can tell a refusal (409) from a failure.
export async function postEventStream(url, onEvent, { signal } = {}) {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const error = new Error(data?.detail || res.statusText || "Request failed");
    error.status = res.status;
    throw error;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop();
    for (const part of parts) {
      if (!part.startsWith("data: ")) continue;
      let event;
      try {
        event = JSON.parse(part.slice(6));
      } catch {
        continue;
      }
      onEvent(event);
    }
  }
}
