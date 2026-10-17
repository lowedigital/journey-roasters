/**
 * GET /api/stock
 *
 * Tells the website which coffees are currently in stock. Reads the
 * `website_coffee_stock` view in Supabase (see supabase/website_coffee_stock.sql),
 * which the order-tracking system keeps accurate by marking each coffee lot as
 * "journey-roast" or "first-light".
 *
 * A coffee is OUT OF STOCK when its total pounds on hand is at or below the
 * threshold (default 2 lb).
 *
 * The response only ever contains true/false per coffee — never the actual
 * inventory numbers — so nothing sensitive reaches the browser.
 *
 * Vercel environment variables (Project -> Settings -> Environment Variables):
 *   SUPABASE_URL                  e.g. https://abcdxyz.supabase.co
 *   SUPABASE_ANON_KEY             the project's public "anon" key (the view is
 *                                 the only thing this key can read — see the SQL file)
 *   OUT_OF_STOCK_AT_OR_BELOW_LBS  optional, defaults to 2
 */

const COFFEES = ['journey-roast', 'first-light'];

function threshold() {
  const n = parseFloat(process.env.OUT_OF_STOCK_AT_OR_BELOW_LBS);
  return Number.isFinite(n) ? n : 2;
}

module.exports = async function handler(req, res) {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'stock_not_configured' });
  }

  try {
    const r = await fetch(`${url}/rest/v1/website_coffee_stock?select=coffee,lbs_on_hand`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw new Error(`Supabase responded ${r.status}`);
    const rows = await r.json();

    const limit = threshold();
    const out = {};
    for (const coffee of COFFEES) {
      const row = rows.find((x) => x.coffee === coffee);
      const lbs = row ? Number(row.lbs_on_hand) : NaN;
      // If the order-tracking data is missing or unreadable for a coffee we
      // leave it IN STOCK, so a data hiccup never takes the shop offline.
      out[coffee] = { inStock: Number.isFinite(lbs) ? lbs > limit : true };
    }

    // Edge-cache for a minute so Supabase isn't hit on every page view.
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(out);
  } catch (err) {
    console.error('stock lookup failed:', err && err.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'stock_unavailable' });
  }
};
