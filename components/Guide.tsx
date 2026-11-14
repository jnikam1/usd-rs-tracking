// Transfer guide. Research reviewed 13 Nov 2026. Statements are qualified by who they apply to;
// this is general information, not tax or financial advice.

const REVIEWED = '13 Nov 2026';

const TOPICS: { title: string; paras: string[]; sources: { label: string; href: string }[] }[] = [
  {
    title: 'How you pay changes the cost',
    paras: [
      'Paying from a bank account is usually cheapest. Wise’s own quote on $1,000 shows a debit card costing several dollars more than a bank transfer and a credit card several times more; the live breakdown is next to the calculator.',
      'Xoom’s fee schedule from 20 Apr 2026 lists average India fees of about 0.23% for bank funded transfers, 0.94% for debit cards and 4.56% for credit cards. Some card issuers also treat these payments as cash advances, with extra fees and interest.',
    ],
    sources: [
      { label: 'Xoom policy updates', href: 'https://www.xoom.com/legal/past-policy-updates' },
      { label: 'Wise quote API', href: 'https://docs.wise.com/api-reference/quote' },
    ],
  },
  {
    title: 'Fees and markups on small transfers',
    paras: [
      'Flat fees weigh most on small amounts. In the research, Remitly charged $3.99 below $1,000, ICICI Money2India $4 below $1,000, and Aspora $2.99 after three free transfers. On $100 that is 3 to 4% before any exchange rate markup.',
      'Fees vary by amount and funding method, and providers change them. This site only shows a fee where a source quoted it, a provider published it, or the research observed it; otherwise it says unknown.',
    ],
    sources: [{ label: 'SendMoneyCompare guide', href: 'https://sendmoneycompare.com/guides/send-money-to-india-from-usa-guide' }],
  },
  {
    title: 'Banks versus transfer apps',
    paras: [
      'In the 13 Nov snapshot on $1,000, US bank wires (Chase about ₹91.29 per dollar, Wells Fargo about ₹91.39) paid noticeably less than most transfer apps (about ₹93.6 to ₹94.1) against a mid of about ₹94.22. Compare current figures above rather than relying on these.',
      'ICICI Money2India was the closest bank in the snapshot and publishes better slab rates for larger amounts.',
    ],
    sources: [
      { label: 'SendMoneyCompare guide', href: 'https://sendmoneycompare.com/guides/send-money-to-india-from-usa-guide' },
      { label: 'ICICI rates', href: 'https://www.icici.bank.in/nri-banking/money-transfer/money-transfer-rates' },
    ],
  },
  {
    title: 'Timing the rate',
    paras: [
      'USD/INR moved from about 88.7 in Nov 2025 to a record near 96.96 on 20 May 2026 and was near 93.7 in mid November. The Reserve Bank of India has intervened on both sides, which can damp short term moves.',
      'Provider choice is a cost you can measure before sending; rate timing is uncertain. For large amounts some people split the transfer into tranches and use a rate alert. That reduces timing risk but does not guarantee a better result.',
    ],
    sources: [
      { label: 'Bloomberg, 20 May 2026', href: 'https://www.bloomberg.com/news/articles/2026-05-20/inr-usd-indian-central-bank-intervenes-as-rupee-drops-to-record-low' },
      { label: 'Business Today, 12 Nov 2026', href: 'https://www.businesstoday.in/latest/economy/story/bt-big-story-the-rupee-bounces-back-but-the-rs100-threat-isnt-gone-yet-566935-2026-11-12' },
    ],
  },
  {
    title: 'US remittance excise tax',
    paras: [
      'From 1 Jan 2026 a 1% US excise tax applies to remittances funded with cash, a money order, a cashier’s check or a similar physical instrument. Transfers funded from a US bank account or a US issued debit or credit card are generally exempt. The Treasury regulations were still proposed when reviewed.',
    ],
    sources: [
      { label: 'IRS', href: 'https://www.irs.gov/newsroom/treasury-irs-issue-proposed-regulations-on-the-new-remittance-transfer-tax-established-under-the-one-big-beautiful-bill' },
    ],
  },
  {
    title: 'US reporting for larger amounts',
    paras: [
      'If you are a US taxpayer, gifts above the annual exclusion ($19,000 per recipient for 2026) generally require Form 709, though tax is usually due only after the lifetime exemption is used.',
      'If you have financial accounts in India (for example NRE or NRO) whose combined balance exceeded $10,000 at any time in the year, an FBAR is generally required. Other forms may apply at higher thresholds. Confirm your situation with a CPA.',
    ],
    sources: [{ label: 'Adams Brown CPA on the 2026 exclusion', href: 'https://www.adamsbrowncpa.com/blog/what-is-the-annual-gift-tax-exclusion-limit-for-2026/' }],
  },
  {
    title: 'Indian tax and accounts',
    paras: [
      'For a resident recipient in India, money received from a relative as defined in the Income-tax Act (such as parents, spouse, siblings and children) is generally not taxed as income. Gifts from non relatives above ₹50,000 in a financial year can be taxable. Keep records such as a gift letter for large amounts.',
      'NRE accounts hold foreign earnings and are generally repatriable; NRO accounts hold Indian income and have repatriation limits. Which account fits depends on your residency status and the source of funds. Confirm with a chartered accountant or your bank.',
      'Banks ask for a purpose code. P1301 (family maintenance) and P1302 (personal gifts) are common for family transfers; pick the one that matches the actual purpose.',
    ],
    sources: [
      { label: 'NRI Blueprint', href: 'https://nriblueprint.com/blog/gifting-to-nri-tax-fema-lrs-2026' },
      { label: 'Vittsphere', href: 'https://one.vittsphere.com/blog/tax-planning/gift-tax-inheritance-section-56-2x-india-2026/' },
    ],
  },
  {
    title: 'Large one time transfers',
    paras: [
      'Check your provider’s sending limit for your verification tier before you start, since limits vary by provider and account. Send a small test to a new recipient first. Compare quotes in the same hour, because estimates and rates move.',
    ],
    sources: [{ label: 'Wise on Remitly limits', href: 'https://wise.com/us/blog/remitly-limit-to-india-from-us' }],
  },
];

export default function Guide() {
  return (
    <section className="section" id="guide" aria-labelledby="guide-title">
      <div className="section-head">
        <h2 id="guide-title">Transfer guide</h2>
        <span className="small muted">Reviewed {REVIEWED}</span>
      </div>
      <p className="section-lead">General information that may not fit your situation. Not tax, legal or financial advice.</p>
      <div className="guide">
        {TOPICS.map((t) => (
          <details key={t.title}>
            <summary>{t.title}</summary>
            <div className="body">
              {t.paras.map((p) => (
                <p key={p.slice(0, 40)}>{p}</p>
              ))}
              <p className="src">
                Reviewed {REVIEWED}. Sources:{' '}
                {t.sources.map((s, i) => (
                  <span key={s.href}>
                    {i > 0 && ', '}
                    <a href={s.href} target="_blank" rel="noopener noreferrer">
                      {s.label}
                    </a>
                  </span>
                ))}
              </p>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
