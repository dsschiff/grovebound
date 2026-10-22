import { describe, expect, it } from 'vitest';
import { compareBundles, compareContent, exitCodeFor, formatContentReport, sha256Hex } from '../scripts/check-pages-live.mjs';

const PAGE = 'https://example.test/grovebound/';
const page = js => `<script type="module" src="/grovebound/assets/${js}"></script>`;

const fakes = (live, docs) => {
  const fetched = [];
  return {
    fetched,
    io: {
      fetchBytes: async url => {
        fetched.push(url);
        const name = url.split('/').pop();
        if (!(name in live)) throw new Error('HTTP 404');
        return new TextEncoder().encode(live[name]).buffer;
      },
      readDocsBytes: async name => {
        if (!(name in docs)) throw new Error('ENOENT ' + name);
        return Buffer.from(docs[name], 'utf8');
      },
    },
  };
};

describe('check-pages-live content hash', () => {
  it('sha256Hex matches a known vector for strings, buffers and ArrayBuffers', () => {
    const abc = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
    expect(sha256Hex('abc')).toBe(abc);
    expect(sha256Hex(Buffer.from('abc'))).toBe(abc);
    expect(sha256Hex(new TextEncoder().encode('abc').buffer)).toBe(abc);
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(abc);
  });

  it('reports content equal when bytes match, fetching the asset URL relative to the page', async () => {
    const { io, fetched } = fakes({ 'index-A.js': 'code' }, { 'index-A.js': 'code' });
    const c = await compareContent(['index-A.js'], PAGE, io);
    expect(c.status).toBe('equal');
    expect(fetched).toEqual(['https://example.test/grovebound/assets/index-A.js']);
    expect(c.files[0].live).toBe(sha256Hex('code'));
    const names = compareBundles(page('index-A.js'), page('index-A.js'));
    expect(exitCodeFor(names, c)).toBe(0);
    expect(formatContentReport(names, c)).toMatch(/^names:   MATCH\ncontent: MATCH\n/);
  });

  it('catches a rebuild that kept the same hashed filename but changed bytes', async () => {
    const { io } = fakes({ 'index-A.js': 'old build' }, { 'index-A.js': 'new build' });
    const names = compareBundles(page('index-A.js'), page('index-A.js'));
    expect(names.status).toBe('equal');
    const c = await compareContent(names.live.js, PAGE, io);
    expect(c.status).toBe('differ');
    const text = formatContentReport(names, c);
    expect(text).toContain('names:   MATCH');
    expect(text).toContain('content: DIFFER');
    expect(text).toContain('MISMATCH');
    expect(text).toContain(sha256Hex('old build').slice(0, 12));
    expect(exitCodeFor(names, c)).toBe(1);
  });

  it('reports a per-file error when docs lacks the live bundle (names already differ)', async () => {
    const { io } = fakes({ 'index-OLD.js': 'x' }, { 'index-NEW.js': 'y' });
    const names = compareBundles(page('index-OLD.js'), page('index-NEW.js'));
    const c = await compareContent(names.live.js, PAGE, io);
    expect(c.status).toBe('error');
    expect(c.files[0].error).toContain('docs read failed');
    const text = formatContentReport(names, c);
    expect(text).toContain('names:   DIFFER');
    expect(text).toContain('content: ERROR');
    expect(exitCodeFor(names, c)).toBe(2);
  });

  it('reports a live fetch failure without throwing', async () => {
    const { io } = fakes({}, { 'index-A.js': 'code' });
    const c = await compareContent(['index-A.js'], PAGE, io);
    expect(c.status).toBe('error');
    expect(c.files[0].error).toContain('live fetch failed: HTTP 404');
  });

  it('treats an empty bundle list as an error and an absent content check as unchecked', async () => {
    const c = await compareContent([], PAGE, fakes({}, {}).io);
    expect(c.status).toBe('error');
    const names = compareBundles(page('index-A.js'), page('index-A.js'));
    expect(formatContentReport(names, undefined)).toBe('names:   MATCH\ncontent: UNCHECKED');
    expect(exitCodeFor(names, undefined)).toBe(1);
  });
});
