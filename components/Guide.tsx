// Research notes, November 2026. Every claim links to where it came from.

const ITEMS: { title: string; body: string; sources: { label: string; href: string }[] }[] = [
  {
    title: 'Fund from your bank account, not a card',
    body:
      'On a $350 Wise transfer to India, the fee is $0 to $3.03 by bank debit, $6.72 by debit card and $20.62 to $23.91 by credit card. Since 20 Apr 2026, Xoom averages 0.23% on bank funded India deposits versus 4.56% on credit cards, and card issuers can treat it as a cash advance.',
    sources: [
      { label: 'Wise India page', href: 'https://wise.com/us/send-money/send-money-to-india' },
      { label: 'Xoom policy updates', href: 'https://www.xoom.com/legal/past-policy-updates' },
    ],
  },
  {
    title: 'Flat fees eat small transfers',
    body:
      'Remitly charges $3.99 and ICICI Money2India $4 below $1,000; Aspora charges $2.99 after three free transfers. On $100 that is 3 to 4% gone before the exchange rate. Batch small sends, or use a zero fee app like Instarem or Paysend.',
    sources: [
      { label: 'SendMoneyCompare', href: 'https://sendmoneycompare.com/guides/send-money-to-india-from-usa-guide' },
      { label: 'Money2India', href: 'https://www.money2india.com/us' },
    ],
  },
  {
    title: 'Skip the US bank wire',
    body:
      'On 13 Nov 2026, a $1,000 send paid ₹91.29 per dollar at Chase, ₹91.39 at Wells Fargo and ₹92.56 at HDFC, against a mid of ₹94.22. The apps paid ₹93.6 to ₹94.1. The bank exception is ICICI Money2India at ₹93.83 with no fee from $1,000, and better slab rates from $10,000.',
    sources: [
      { label: 'SendMoneyCompare', href: 'https://sendmoneycompare.com/guides/send-money-to-india-from-usa-guide' },
      { label: 'ICICI rates', href: 'https://www.icici.bank.in/nri-banking/money-transfer/money-transfer-rates' },
    ],
  },
  {
    title: 'Pick the app first, time the rate second',
    body:
      'USD/INR ran from about 88.7 in Nov 2025 to a record 96.96 on 20 May 2026 and back near 93.7 this month. The RBI sells dollars near the highs and buys near the lows (it bought at 93.88 on 6 Nov), which caps short term moves. Picking a top app over a bank is a guaranteed ₹3,000 or so on $1,000; waiting for a better rate is a coin flip. On $10,000 and up, set an alert and split the send into a few tranches.',
    sources: [
      { label: 'Bloomberg, 20 May', href: 'https://www.bloomberg.com/news/articles/2026-05-20/inr-usd-indian-central-bank-intervenes-as-rupee-drops-to-record-low' },
      { label: 'NewsBytes, 6 Nov', href: 'https://www.newsbytesapp.com/news/business/indian-rupee-closes-9391-per-us-dollar-after-inflows/tldr' },
      { label: 'Business Today', href: 'https://www.businesstoday.in/latest/economy/story/bt-big-story-the-rupee-bounces-back-but-the-rs100-threat-isnt-gone-yet-566935-2026-11-12' },
    ],
  },
  {
    title: 'The 1% US remittance tax only applies to cash',
    body:
      'Since 1 Jan 2026, a 1% excise tax applies when you pay the provider with cash, a money order or a cashier’s check. Transfers funded from a US bank account or a US issued debit or credit card are exempt, which covers every app transfer above. The rules are still in proposed form.',
    sources: [{ label: 'IRS', href: 'https://www.irs.gov/newsroom/treasury-irs-issue-proposed-regulations-on-the-new-remittance-transfer-tax-established-under-the-one-big-beautiful-bill' }],
  },
  {
    title: 'In India, gifts from relatives are tax free',
    body:
      'Money from a relative (parents, spouse, siblings, children and their spouses) is exempt at any amount. Gifts from non relatives above ₹50,000 in a financial year are taxed in full. Use purpose code P1301 (family maintenance) or P1302 (personal gift), and keep a gift letter for large amounts.',
    sources: [
      { label: 'NRI Blueprint', href: 'https://nriblueprint.com/blog/gifting-to-nri-tax-fema-lrs-2026' },
      { label: 'Vittsphere', href: 'https://one.vittsphere.com/blog/tax-planning/gift-tax-inheritance-section-56-2x-india-2026/' },
    ],
  },
  {
    title: 'US paperwork for big amounts',
    body:
      'The 2026 gift tax annual exclusion is $19,000 per recipient. Above that you file Form 709, but no tax is due until the lifetime exemption is used. If your Indian accounts (NRE, NRO and others) together top $10,000 at any point in the year, file an FBAR.',
    sources: [{ label: 'Adams Brown CPA', href: 'https://www.adamsbrowncpa.com/blog/what-is-the-annual-gift-tax-exclusion-limit-for-2026/' }],
  },
  {
    title: 'Large one time sends',
    body:
      'Check your tier limit before you start (Xoom Level 3 allows about $50,000 per 24 hrs; Remitly’s 180 day caps vary by verification). Send a small test first to a new recipient. Sending to your own NRE account keeps the paper trail clean and avoids questions on a parent’s tax return.',
    sources: [
      { label: 'Wise on Remitly limits', href: 'https://wise.com/us/blog/remitly-limit-to-india-from-us' },
      { label: 'Blind thread', href: 'https://www.teamblind.com/post/how-to-transfer-around-100k-to-india-a2azetxg' },
    ],
  },
];

export default function Guide() {
  return (
    <section className="guide" aria-labelledby="guide-title">
      <h2 id="guide-title">Before you send</h2>
      <p>What the November 2026 data says about getting the most rupees. Not tax or financial advice.</p>
      <ul className="guide-list">
        {ITEMS.map((it) => (
          <li key={it.title}>
            <h3>{it.title}</h3>
            <p>{it.body}</p>
            <p className="src">
              Sources:{' '}
              {it.sources.map((s, i) => (
                <span key={s.href}>
                  {i > 0 && ', '}
                  <a href={s.href} target="_blank" rel="noopener noreferrer">{s.label}</a>
                </span>
              ))}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
