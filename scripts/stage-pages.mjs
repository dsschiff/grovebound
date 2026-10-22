import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const source = join(root, 'dist');
const target = join(root, 'docs');
if (dirname(target) !== root) throw new Error('Unsafe Pages target');

const html = await readFile(join(source, 'index.html'), 'utf8');
if (!html.includes('/grovebound/assets/')) {
  throw new Error('Build with GITHUB_PAGES=true before staging Pages files');
}
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
await writeFile(join(target, 'index.html'), html.replace(/\r+\n/g, '\n'));
await writeFile(join(target, '.nojekyll'), '');
console.log('Staged GitHub Pages site in docs/');

// Size gate: GOAL.md keeps initial transfer under 5 MB. GROVE_PAGES_MAX_BYTES overrides it only to force a breach in checks.
const MAX_BYTES = Number(process.env.GROVE_PAGES_MAX_BYTES || 5_000_000);
const files = [];
const walk = async dir => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else files.push({ path: relative(target, full).replaceAll('\\', '/'), size: (await stat(full)).size });
  }
};
await walk(target);
const total = files.reduce((sum, file) => sum + file.size, 0);
console.log('Staged size: ' + total + ' bytes (limit ' + MAX_BYTES + ')');
if (total > MAX_BYTES) {
  files.sort((a, b) => b.size - a.size);
  for (const file of files) console.error(String(file.size).padStart(10) + '  ' + file.path);
  console.error('Staged site exceeds ' + MAX_BYTES + ' bytes by ' + (total - MAX_BYTES));
  process.exitCode = 1;
}
