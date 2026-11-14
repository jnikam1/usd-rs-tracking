import 'server-only';
import { errMsg } from './http';

// Phone push through ntfy.sh: free, no account. Subscribe to the topic in the ntfy app.
// ntfy also keeps the last 12 hours of messages, which we use as a stateless dedupe log,
// so the app needs no database.

const NTFY = process.env.NTFY_SERVER || 'https://ntfy.sh';

interface NtfyMessage { event?: string; time?: number; title?: string; tags?: string[] }

export async function recentKeys(topic: string, since = '12h'): Promise<Set<string>> {
  const keys = new Set<string>();
  try {
    const res = await fetch(`${NTFY}/${encodeURIComponent(topic)}/json?poll=1&since=${since}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return keys;
    const text = await res.text();
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const m = JSON.parse(line) as NtfyMessage;
        if (m.event === 'message') for (const t of m.tags ?? []) if (t.startsWith('k-')) keys.add(t.slice(2));
      } catch {
        /* ignore partial lines */
      }
    }
  } catch {
    /* if ntfy is unreachable we fall back to sending, better a duplicate than a miss */
  }
  return keys;
}

export async function publish(
  topic: string,
  msg: { key: string; title: string; message: string; emoji?: string; priority?: number; click?: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(NTFY, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        topic,
        title: msg.title,
        message: msg.message,
        tags: [msg.emoji ?? 'moneybag', `k-${msg.key}`],
        priority: msg.priority ?? 3,
        click: msg.click,
      }),
    });
    if (!res.ok) return { ok: false, error: `ntfy HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}
