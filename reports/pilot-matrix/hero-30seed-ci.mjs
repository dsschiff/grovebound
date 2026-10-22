// Per-hero commands-on vs commands-off summary with 95% confidence intervals for hero-30seed.json.
// Pairs each +cmd run with the off run of the same hero and seed; CIs use Student t on the paired differences
// (and on each arm's mean). Usage: node reports/pilot-matrix/hero-30seed-ci.mjs [in.json] -> writes hero-30seed-ci.{json,md}
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const inPath = resolve(process.argv[2] ?? resolve(here, 'hero-30seed.json'));
const outBase = inPath.replace(/\.json$/, '-ci');
const { cells } = JSON.parse(await readFile(inPath, 'utf8'));
const rows = Object.values(cells);
// Two-sided 95% t critical values by degrees of freedom (1..40); beyond 40 use 2.0 (n here is at most 30).
const T = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131,
  2.120, 2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042,
  2.040, 2.037, 2.035, 2.032, 2.030, 2.028, 2.026, 2.024, 2.023, 2.021];
const stat = xs => {
  const n = xs.length; const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : NaN;
  const half = n > 1 ? (T[n - 2] ?? 2.0) * sd / Math.sqrt(n) : NaN;
  return { n, mean, sd, lo: mean - half, hi: mean + half, half };
};
const metrics = {
  damageTaken: r => r.damageTaken,
  clearSeconds: r => r.gameSeconds,
  lowestHpPct: r => 100 * r.minHealthFraction,
  won: r => (r.won ? 1 : 0),
};
const heroes = [...new Set(rows.map(r => r.hero))];
const result = { source: basename(inPath), method: 'paired t, 95% two-sided; diff = on - off, same hero and seed', heroes: {} };
for (const hero of [...heroes, 'all']) {
  const pick = arm => rows.filter(r => (hero === 'all' || r.hero === hero) && r.arm === arm);
  const off = pick('off'); const on = new Map(pick('cmd').map(r => [`${r.hero}@${r.seed}`, r]));
  const pairs = off.map(r => [r, on.get(`${r.hero}@${r.seed}`)]).filter(([, b]) => b);
  const entry = { pairs: pairs.length, commandsPerRun: stat(pairs.map(([, b]) => b.commands)).mean };
  for (const [name, f] of Object.entries(metrics)) {
    const d = stat(pairs.map(([a, b]) => f(b) - f(a)));
    entry[name] = { off: stat(pairs.map(([a]) => f(a))), on: stat(pairs.map(([, b]) => f(b))), diff: d,
      excludesZero: d.lo > 0 || d.hi < 0 };
  }
  result.heroes[hero] = entry;
}
await writeFile(outBase + '.json', JSON.stringify(result, null, 2) + '\n');
const f1 = x => (Number.isFinite(x) ? x.toFixed(1) : 'n/a');
const ci = s => `${f1(s.mean)} [${f1(s.lo)}, ${f1(s.hi)}]`;
const lines = [`# Commands on vs off by hero, 95% CIs (${result.source})`, '',
  'Each cell: mean [95% CI]. Diff is on − off, paired on hero and seed (Student t). "Excl. 0" = the diff interval excludes zero.', ''];
for (const [name] of Object.entries(metrics)) {
  lines.push(`## ${name}`, '', '| Hero | Pairs | Off | On | Diff (on − off) | Excl. 0 |', '|---|---|---|---|---|---|');
  for (const [hero, e] of Object.entries(result.heroes)) {
    const m = e[name];
    lines.push(`| ${hero} | ${e.pairs} | ${ci(m.off)} | ${ci(m.on)} | ${ci(m.diff)} | ${m.excludesZero ? 'yes' : 'no'} |`);
  }
  lines.push('');
}
lines.push('Commands fired per commands-on run (mean): ' + Object.entries(result.heroes).map(([h, e]) => `${h} ${f1(e.commandsPerRun)}`).join(', ') + '.', '');
await writeFile(outBase + '.md', lines.join('\n'));
console.log(lines.join('\n'));
