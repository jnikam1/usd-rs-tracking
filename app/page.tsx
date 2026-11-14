import Dashboard from '@/components/Dashboard';
import Guide from '@/components/Guide';
import { getQuotes } from '@/lib/quotes';
import { getRates } from '@/lib/rates';

// Re-render on the server at most every 2 minutes; the page refreshes itself in the browser after that.
export const revalidate = 120;

export default async function Page() {
  const [rates, quotes] = await Promise.all([getRates().catch(() => null), getQuotes(1000, { withFunding: false }).catch(() => null)]);

  return (
    <main className="page">
      <Dashboard initialRates={rates?.mid ? rates : null} initialQuotes={quotes} />
      <Guide />
      <footer className="footer">
        <p>
          Rates are indicative and change by the minute. Quotes assume bank (ACH) funding. Confirm the final amount in the
          provider&rsquo;s app before you send. Not financial or tax advice.
        </p>
        <p>
          Live provider quotes: Wise comparison API (Wise ranks itself in that feed too). Estimates: SendMoneyCompare snapshot of
          13 Nov 2026 plus ICICI&rsquo;s rate page. Mid market rate: Wise, with Yahoo Finance and ECB fallbacks.
        </p>
        <p>
          <a href="https://github.com/jnikam1/usd-rs-tracking" target="_blank" rel="noopener noreferrer">Source on GitHub</a>
          {'. '}
          <a href="/api/health">Data source status</a>
        </p>
      </footer>
    </main>
  );
}
