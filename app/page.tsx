import Dashboard from '@/components/Dashboard';
import Guide from '@/components/Guide';
import { getQuotes } from '@/lib/quotes';
import { getRates } from '@/lib/rates';

// Regenerated on the server at most every 2 minutes; the browser refreshes figures after that.
export const revalidate = 120;

export default async function Page() {
  const signal = AbortSignal.timeout(12_000);
  const [rates, quotes] = await Promise.all([getRates(signal).catch(() => null), getQuotes(1000, { signal }).catch(() => null)]);
  const serverNow = quotes ? Date.parse(quotes.generatedAt) : rates ? Date.parse(rates.generatedAt) : 0;

  return (
    <>
      <Dashboard initialRates={rates?.mid ? rates : null} initialQuotes={quotes} serverNow={serverNow || Date.now()}>
        <Guide />
        <footer className="footer">
          <p>
            Figures are indicative and change by the minute. Comparison estimates come from Wise&rsquo;s comparison data, which Wise
            describes as informational. Confirm the final amount in the provider&rsquo;s app before you send. Not financial or tax advice.
          </p>
          <p>
            Mid market rate: Wise, with Yahoo Finance and daily reference rates as labelled fallbacks. Research models: SendMoneyCompare
            and ICICI, 13 Nov 2026.
          </p>
          <p>
            <a href="https://github.com/jnikam1/usd-rs-tracking" target="_blank" rel="noopener noreferrer">
              Source on GitHub
            </a>
            {' and '}
            <a href="/api/health">data source status</a>.
          </p>
        </footer>
      </Dashboard>
    </>
  );
}
