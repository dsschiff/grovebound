import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
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
await writeFile(join(target, '.nojekyll'), '');
console.log('Staged GitHub Pages site in docs/');
