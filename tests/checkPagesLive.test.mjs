import { describe, expect, it } from 'vitest';
import { compareBundles, extractBundles, formatBundleLine, formatReport } from '../scripts/check-pages-live.mjs';

const page = (js, css) => `<!doctype html><html><head>
<script type="module" crossorigin src="/grovebound/assets/${js}"></script>
${css ? `<link rel="stylesheet" crossorigin href="/grovebound/assets/${css}">` : ''}
</head><body><div id="app"></div></body></html>`;

describe('check-pages-live', () => {
  it('reports equal for identical bundles', () => {
    const r = compareBundles(page('index-AAA.js', 'index-BBB.css'), page('index-AAA.js', 'index-BBB.css'));
    expect(r.status).toBe('equal');
    expect(formatReport(r)).toBe('LIVE == DOCS (index-AAA.js, index-BBB.css)');
  });

  it('reports differ with both names and docs commit info', () => {
    const r = compareBundles(page('index-OLD.js', 'index-BBB.css'), page('index-NEW.js', 'index-BBB.css'));
    expect(r.status).toBe('differ');
    const text = formatReport(r, 'abc1234 2026-10-21');
    expect(text).toContain('index-OLD.js');
    expect(text).toContain('index-NEW.js');
    expect(text).toContain('abc1234 2026-10-21');
  });

  it('differs when only the CSS hash changes', () => {
    expect(compareBundles(page('index-A.js', 'index-X.css'), page('index-A.js', 'index-Y.css')).status).toBe('differ');
  });

  it('errors when a bundle is missing', () => {
    expect(compareBundles('<html><body>404</body></html>', page('index-A.js')).status).toBe('error');
    expect(compareBundles(page('index-A.js'), '<html></html>').status).toBe('error');
  });

  it('tolerates whitespace, attribute order, quotes and query strings', () => {
    const messy = `<script
        src='/grovebound/assets/index-AAA.js?v=1'
        crossorigin   type=module ></script>
      <LINK href="/grovebound/assets/index-BBB.css"   rel="stylesheet">`;
    expect(extractBundles(messy)).toEqual({ js: ['index-AAA.js'], css: ['index-BBB.css'] });
    expect(compareBundles(messy, page('index-AAA.js', 'index-BBB.css')).status).toBe('equal');
  });

  it('ignores non-index assets and unrelated tags', () => {
    const html = '<script src="/grovebound/assets/vendor-ZZ.js"></script><link rel="icon" href="/grovebound/art/warden.png">';
    expect(extractBundles(html)).toEqual({ js: [], css: [] });
  });

  it('formats the bundle line with repo HEAD, or unknown when git fails', () => {
    const r = compareBundles(page('index-AAA.js', 'index-BBB.css'), page('index-AAA.js', 'index-BBB.css'));
    expect(formatBundleLine(r, 'abc1234')).toBe('bundle: assets/index-AAA.js | repo HEAD: abc1234');
    expect(formatBundleLine(r, '')).toBe('bundle: assets/index-AAA.js | repo HEAD: unknown');
  });
});
