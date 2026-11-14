import { ALERT_SCHEDULE, alertConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

// Booleans and the published schedule only: never the topic, the secret or the thresholds.
export async function GET() {
  const cfg = alertConfig(process.env);
  return Response.json(
    {
      serverAlerts: {
        configured: Boolean(cfg.topic) && (!cfg.requireAuth || Boolean(cfg.secret)),
        deliveryConfigured: Boolean(cfg.topic),
        authConfigured: Boolean(cfg.secret),
        schedule: ALERT_SCHEDULE,
      },
    },
    { headers: { 'cache-control': 'public, s-maxage=300' } },
  );
}
