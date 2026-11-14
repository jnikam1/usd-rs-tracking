import 'server-only';
import type { NotifyTransport } from './alertsRunner';
import { errMsg } from './util';

// Phone push through ntfy.sh: free, no account. Subscribe to the topic in the ntfy app.
// ntfy keeps about 12 hours of messages; we read that history to skip alerts already sent.
// This is best effort, not exactly-once: two checks running at the same moment can both send.

const NTFY = () => (process.env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, '');

export const ntfyTransport: NotifyTransport = {
  async recentKeys(topic, signal) {
    const keys = new Set<string>();
    const res = await fetch(`${NTFY()}/${encodeURIComponent(topic)}/json?poll=1&since=12h`, {
      cache: 'no-store',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(6000)]) : AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`ntfy history HTTP ${res.status}`);
    for (const line of (await res.text()).split('\n')) {
      if (!line.trim()) continue;
      try {
        const m = JSON.parse(line) as { event?: string; tags?: string[] };
        if (m.event === 'message') for (const t of m.tags ?? []) if (t.startsWith('k-')) keys.add(t.slice(2));
      } catch {
        /* partial line */
      }
    }
    return keys;
  },
  async publish(topic, msg, signal) {
    try {
      const res = await fetch(NTFY(), {
        method: 'POST',
        cache: 'no-store',
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(6000)]) : AbortSignal.timeout(6000),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          topic,
          title: msg.title,
          message: msg.message,
          tags: [msg.emoji, `k-${msg.key}`],
          priority: msg.priority,
          click: msg.click,
        }),
      });
      return res.ok ? { ok: true, status: res.status } : { ok: false, status: res.status, error: `ntfy HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, error: errMsg(e) };
    }
  },
};
