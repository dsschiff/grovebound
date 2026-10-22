// Reports whether the live GitHub Pages bundle matches docs/index.html in the working tree.
// Usage: node scripts/check-pages-live.mjs [--url <url>] [--docs <path>]
// Env: GROVE_PAGES_URL overrides the default URL. Exit 0 equal, 1 differ, 2 fetch/parse failure.
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const DEFAULT_URL = 'https://dsschiff.github.io/grovebound/';

const attrsOf = tag => {
  const attrs = {};
  for (const m of tag.matchAll(/([^\s=<>/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
};

/** Pure: pull hashed `assets/index-*.js|css` names out of index HTML. Returns sorted unique lists. */
export function extractBundles(html) {
  const js = new Set();
  const css = new Set();
  for (const m of String(html).matchAll(/<(script|link)\b[^>]*>/gi)) {
    const attrs = attrsOf(m[0]);
    const ref = m[1].toLowerCase() === 'script' ? attrs.src : attrs.href;
    const hit = /(?:^|\/)assets\/(index-[A-Za-z0-9_-]+\.(js|css))(?:[?#].*)?$/.exec(ref ?? '');
    if (hit) (hit[2] === 'js' ? js : css).add(hit[1]);
  }
  return { js: [...js].sort(), css: [...css].sort() };
}

/** Pure: compare live and docs HTML. status is 'equal', 'differ', or 'error' (no JS bundle in either). */
export function compareBundles(liveHtml, docsHtml) {
  const live = extractBundles(liveHtml);
  const docs = extractBundles(docsHtml);
  if (!live.js.length || !docs.js.length) {
    return { status: 'error', live, docs, reason: (live.js.length ? 'docs' : 'live') + ' HTML has no assets/index-*.js bundle' };
  }
  const same = a => JSON.stringify(a);
  const equal = same(live.js) === same(docs.js) && same(live.css) === same(docs.css);
  return { status: equal ? 'equal' : 'differ', live, docs };
}

const names = b => [...b.js, ...b.css].join(', ') || '(none)';

/** Pure: format the one-line or multi-line report. docsInfo is the `git log` line. */
export function formatReport(result, docsInfo = '') {
  if (result.status === 'equal') return 'LIVE == DOCS (' + names(result.live) + ')';
  if (result.status === 'error') return 'ERROR: ' + result.reason;
  return ['LIVE != DOCS', '  live: ' + names(result.live), '  docs: ' + names(result.docs), '  docs last commit: ' + (docsInfo || '(unknown)')].join('\n');
}

const parseArgs = argv => {
  const out = { url: process.env.GROVE_PAGES_URL || DEFAULT_URL, docs: 'docs/index.html' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--url') out.url = argv[++i];
    else if (argv[i] === '--docs') out.docs = argv[++i];
  }
  return out;
};

async function main() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const { url, docs } = parseArgs(process.argv.slice(2));
  let liveHtml;
  let docsHtml;
  try {
    const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    liveHtml = await res.text();
    docsHtml = await readFile(resolve(root, docs), 'utf8');
  } catch (err) {
    console.error('ERROR: ' + (err instanceof Error ? err.message : err));
    return 2;
  }
  const result = compareBundles(liveHtml, docsHtml);
  let info = '';
  if (result.status === 'differ') {
    try {
      info = execFileSync('git', ['log', '-1', '--format=%h %cs', '--', 'docs/'], { cwd: root, encoding: 'utf8' }).trim();
    } catch { /* leave blank */ }
  }
  const text = formatReport(result, info);
  (result.status === 'error' ? console.error : console.log)(text);
  return { equal: 0, differ: 1, error: 2 }[result.status];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
