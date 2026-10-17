/*
 * Journey Roasters — live stock status for the storefront.
 * Asks /api/stock which coffees are out of stock and then:
 *   1. sends anyone who lands on an out-of-stock product page to outofstock.html
 *   2. points every link to that product page at outofstock.html instead
 *   3. marks that coffee's cards (home + shop) as "Out of Stock"
 * If the lookup fails for any reason, nothing changes and the shop stays open.
 */
(function () {
  var OUT_URL = 'outofstock.html';
  var PRODUCTS = {
    'journey-roast': /(^|\/)journey-roast(\.html)?$/i,
    'first-light': /(^|\/)first-light(\.html)?$/i
  };
  var CACHE_KEY = 'jr-stock-v1';
  var CACHE_MS = 60 * 1000;

  function readCache() {
    try {
      var c = JSON.parse(sessionStorage.getItem(CACHE_KEY));
      if (c && Date.now() - c.t < CACHE_MS) return c.d;
    } catch (e) {}
    return null;
  }
  function writeCache(d) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d: d })); } catch (e) {}
  }

  function load(cb) {
    var cached = readCache();
    if (cached) return cb(cached);
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 5000) : null;
    fetch('/api/stock', ctl ? { signal: ctl.signal } : undefined)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d) writeCache(d); cb(d); })
      .catch(function () { cb(null); })
      .then(function () { if (timer) clearTimeout(timer); });
  }

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function pathOf(href) { return (href || '').split('#')[0].split('?')[0]; }

  function injectStyles() {
    var s = document.createElement('style');
    s.textContent =
      'a.is-out-of-stock .coffee-media,a.is-out-of-stock .catalog-media{position:relative}' +
      'a.is-out-of-stock .coffee-media img,a.is-out-of-stock .catalog-media img{opacity:.55;filter:grayscale(.35)}' +
      'a.is-out-of-stock .stock-badge{position:absolute;top:14px;left:14px;background:#0F0F0F;color:#fff;' +
      'font:500 11px/1 Inter,sans-serif;letter-spacing:.14em;text-transform:uppercase;padding:8px 12px;border-radius:2px}' +
      'a.is-out-of-stock .view-link,a.is-out-of-stock .catalog-link{color:#6B6B63;border-bottom-color:transparent}';
    document.head.appendChild(s);
  }

  function markOut(outKeys) {
    injectStyles();
    var anchors = document.querySelectorAll('a[href]');
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var p = pathOf(a.getAttribute('href'));
      for (var j = 0; j < outKeys.length; j++) {
        if (!PRODUCTS[outKeys[j]].test(p)) continue;
        a.setAttribute('href', OUT_URL + '?coffee=' + outKeys[j]);
        var cardLink = a.querySelector('.view-link, .catalog-link');
        var media = a.querySelector('.coffee-media, .catalog-media');
        if (cardLink || media) {
          a.classList.add('is-out-of-stock');
          if (cardLink) cardLink.textContent = 'Out of Stock';
          if (media && !media.querySelector('.stock-badge')) {
            var b = document.createElement('span');
            b.className = 'stock-badge';
            b.textContent = 'Out of Stock';
            media.appendChild(b);
          }
        }
        break;
      }
    }
  }

  load(function (data) {
    if (!data) return;
    var outKeys = Object.keys(PRODUCTS).filter(function (k) {
      return data[k] && data[k].inStock === false;
    });
    if (!outKeys.length) return;

    // Someone is on (or bookmarked) the product page itself.
    for (var i = 0; i < outKeys.length; i++) {
      if (PRODUCTS[outKeys[i]].test(location.pathname)) {
        location.replace(OUT_URL + '?coffee=' + outKeys[i]);
        return;
      }
    }
    onReady(function () { markOut(outKeys); });
  });
})();
