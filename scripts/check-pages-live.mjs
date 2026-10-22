// Reports whether the live GitHub Pages bundle matches docs/index.html in the working tree.
// Usage: node scripts/check-pages-live.mjs [--url <url>] [--docs <path>]
// Env: GROVE_PAGES_URL overrides the default URL. Exit 0 equal, 1 differ, 2 fetch/parse failure.
// Checks names (hashed asset filenames in index.html) and content (SHA-256 of each live JS bundle
// against docs/assets/<same name>) separately; exit 0 only when both match.
import { createHash } from 'node:crypto';
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

/** Pure: lowercase hex SHA-256 of a string, Buffer, ArrayBuffer or typed array. */
export function sha256Hex(data) {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8')
    : data instanceof ArrayBuffer ? Buffer.from(new Uint8Array(data))
      : Buffer.from(data.buffer ?? data, data.byteOffset ?? 0, data.byteLength ?? data.length);
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Compare the bytes of each live JS bundle with docs/assets/<same name>. Network and disk are injected:
 * fetchBytes(url) -> Promise<ArrayBuffer|Uint8Array|string>, readDocsBytes(name) -> Promise<Buffer|...>.
 * Returns { status: 'equal'|'differ'|'error', files: [{ name, url, live, docs, match, error? }] }.
 * A docs file that is missing (e.g. the names already differ) is a per-file error, not a throw.
 */
export async function compareContent(jsNames, pageUrl, { fetchBytes, readDocsBytes }) {
  const files = [];
  for (const name of jsNames ?? []) {
    const url = new URL('assets/' + name, pageUrl).href;
    const entry = { name, url, live: null, docs: null, match: false };
    try {
      entry.live = sha256Hex(await fetchBytes(url));
    } catch (err) {
      entry.error = 'live fetch failed: ' + (err instanceof Error ? err.message : err);
    }
    try {
      entry.docs = sha256Hex(await readDocsBytes(name));
    } catch (err) {
      entry.error = (entry.error ? entry.error + '; ' : '') + 'docs read failed: ' + (err instanceof Error ? err.message : err);
    }
    entry.match = !entry.error && entry.live === entry.docs;
    files.push(entry);
  }
  const status = !files.length || files.some(f => f.error) ? 'error' : files.every(f => f.match) ? 'equal' : 'differ';
  return { status, files };
}

const short = h => (h ? h.slice(0, 12) : '-');

/** Pure: report lines for the name check and the content check, kept separate. */
export function formatContentReport(nameResult, content) {
  const nameLine = 'names:   ' + ({ equal: 'MATCH', differ: 'DIFFER', error: 'ERROR' }[nameResult.status] ?? nameResult.status);
  if (!content) return [nameLine, 'content: UNCHECKED'].join('
');
  const label = { equal: 'MATCH', differ: 'DIFFER', error: 'ERROR' }[content.status];
  const lines = [nameLine, 'content: ' + label + (content.files.length ? '' : ' (no JS bundle to hash)')];
  for (const f of content.files) {
    lines.push('  ' + f.name + ' live sha256 ' + short(f.live) + ' docs sha256 ' + short(f.docs) + (f.error ? ' (' + f.error + ')' : f.match ? '' : ' MISMATCH'));
  }
  return lines.join('
');
}

/** Pure: exit code from both checks. 0 only if names and content both match; 2 on any error. */
export function exitCodeFor(nameResult, content) {
  if (nameResult.status === 'error' || content?.status === 'error') return 2;
  return nameResult.status === 'equal' && content?.status === 'equal' ? 0 : 1;
}

const names = b => [...b.js, ...b.css].join(', ') || '(none)';

/** Pure: format the one-line or multi-line report. docsInfo is the `git log` line. */
export function formatReport(result, docsInfo = '') {
  if (result.status === 'equal') return 'LIVE == DOCS (' + names(result.live) + ')';
  if (result.status === 'error') return 'ERROR: ' + result.reason;
  return ['LIVE != DOCS', '  live: ' + names(result.live), '  docs: ' + names(result.docs), '  docs last commit: ' + (docsInfo || '(unknown)')].join('\n');
}

/** Pure: the paste-into-checklist line. Uses the live JS bundle name; head is a short sha or falsy for unknown. */
export function formatBundleLine(result, head) {
  const js = result?.live?.js ?? [];
  const bundle = js.length ? js.map(n => 'assets/' + n).join(', ') : '(none)';
  return 'bundle: ' + bundle + ' | repo HEAD: ' + (head || 'unknown');
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
  if (result.status !== 'error') {
    let head = '';
    try {
      head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch { /* unknown */ }
    console.log(formatBundleLine(result, head));
  }
  if (result.status === 'error') return 2;
  const docsDir = resolve(root, docs, '..');
  const content = await compareContent(result.live.js, url, {
    fetchBytes: async u => {
      const r = await fetch(u, { headers: { 'cache-control': 'no-cache' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    },
    readDocsBytes: name => readFile(resolve(docsDir, 'assets', name)),
  });
  console.log(formatContentReport(result, content));
  return exitCodeFor(result, content);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
