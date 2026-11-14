import { inr, usd } from '@/lib/format';
import { PROMOS } from '@/lib/providers';

export default function Promos({
  amount,
  estimate,
}: {
  amount: number;
  estimate: { provider: string; received: number; perUsd: number; capUsd: number; ends?: string } | null;
}) {
  return (
    <>
      <div className="section-head">
        <h2 id="promos-title">First transfer deals</h2>
      </div>
      <p className="section-sub">
        Useful once per provider. Use the promo, then switch to whichever app tops the live list. Terms as of 13 Nov 2026;
        confirm in the app.
      </p>
      <ul className="promos">
        {PROMOS.map((p) => (
          <li key={p.provider}>
            <h3>
              <a href={p.url} target="_blank" rel="noopener noreferrer">
                {p.provider}
              </a>
              : {p.headline}
            </h3>
            <p>{p.detail}</p>
            {estimate && estimate.provider === p.provider && (
              <p>
                On {usd(amount)} that is roughly <strong>{inr(estimate.received)}</strong> ({inr(estimate.perUsd, 2)} per $1)
                at today&rsquo;s rate
                {amount > estimate.capUsd ? `, with the amount above ${usd(estimate.capUsd)} at the regular rate` : ''}
                {estimate.ends
                  ? `. Offer ends ${new Date(`${estimate.ends}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                  : ''}
                .
              </p>
            )}
            {p.caution && <p className="caution">{p.caution}</p>}
          </li>
        ))}
      </ul>
    </>
  );
}
