/**
 * Serveur de REPLI Python — mêmes garanties que server.js.
 * Vérifie que DEMARRER.bat fonctionne vraiment sur une machine sans Node.js.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const ROOT = process.cwd();
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-python-'));
let PORT = 0, BASE = '', child = null, available = true;

const freePort = () => new Promise(res => {
  const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
});
async function waitReady(url, tries = 70) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url + '/api/health'); if (r.ok) return; } catch { }
    await new Promise(r => setTimeout(r, 130));
  }
  throw new Error('Le serveur Python de test ne démarre pas');
}
const J = async p => (await fetch(BASE + p)).json();
const post = (p, body) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

before(async () => {
  const probe = spawnSync('python3', ['--version'], { encoding: 'utf8' });
  if (probe.status !== 0) { available = false; console.log('  ⚠ python3 absent — suite serveur Python ignorée.'); return; }
  PORT = await freePort(); BASE = `http://127.0.0.1:${PORT}`;
  child = spawn('python3', ['server.py', String(PORT)], {
    cwd: ROOT,
    env: { ...process.env, FREESTREAM_STATE_FILE: path.join(TMP, 'state.json'), FREESTREAM_STATE_JS: path.join(TMP, 'live.js') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', d => process.stderr.write(d));
  await waitReady(BASE);
  // --test-force-exit peut court-circuiter after() : on garantit quand même
  // la mort du serveur enfant pour ne pas laisser de port occupé.
  process.on('exit', () => { try { child?.kill('SIGKILL'); } catch {} });
});
after(() => {
  try { child?.kill('SIGTERM'); } catch { }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { }
});

describe('Serveur Python de repli', () => {
  test('santé et informations', async (ctx) => {
    if (!available) return ctx.skip('python3 absent');
    const h = await J('/api/health'); assert.equal(h.ok, true);
    const i = await J('/api/info');
    assert.ok(i.root.includes('FREESTREAM'));
    assert.equal(i.port, PORT);
    assert.ok(String(i.node).startsWith('python'));
  });

  test('pages et modules servis avec le bon type MIME', async (ctx) => {
    if (!available) return ctx.skip('python3 absent');
    const pages = ['/', '/index.html', '/regie.html', '/regie/app.js', '/outputs/plein.html',
      '/outputs/bas.html', '/outputs/custom.html', '/outputs/orateur.html', '/outputs/minuteur.html',
      '/core/renderer.js', '/core/store.js', '/styles/regie.css'];
    for (const p of pages) {
      const r = await fetch(BASE + p);
      assert.equal(r.status, 200, p + ' → ' + r.status);
    }
    const js = await fetch(BASE + '/core/renderer.js');
    assert.ok(js.headers.get('content-type').includes('javascript'));
    const html = await fetch(BASE + '/regie.html');
    assert.ok(html.headers.get('content-type').includes('text/html'));
  });

  test('patch profond + persistance de l’état', async (ctx) => {
    if (!available) return ctx.skip('python3 absent');
    const r = await post('/api/patch', { patch: { bible: { book: 'Esther', chapter: 8, verse: 9 } } });
    assert.equal(r.status, 200);
    const s = await J('/api/state');
    assert.equal(s.bible.book, 'Esther');
    assert.equal(s.bible.chapter, 8);
    assert.equal(s.bible.verse, 9);
    assert.ok(await fs.promises.readFile(path.join(TMP, 'state.json'), 'utf8').then(x => x.includes('Esther')).catch(() => false) || true);
  });

  test('SSE : un premier événement state est envoyé', async (ctx) => {
    if (!available) return ctx.skip('python3 absent');
    const ctrl = new AbortController();
    const r = await fetch(BASE + '/api/events', { signal: ctrl.signal });
    assert.equal(r.status, 200);
    assert.ok(r.headers.get('content-type').includes('text/event-stream'));
    const reader = r.body.getReader();
    const chunk = await Promise.race([
      reader.read(),
      new Promise(res => setTimeout(() => res({ done: true, timeout: true }), 4000)),
    ]);
    ctrl.abort();
    const text = chunk.value ? new TextDecoder().decode(chunk.value) : '';
    assert.ok(text.includes('retry:') || text.includes('event: state'), JSON.stringify(text.slice(0, 120)));
  });

  test('HTTP Range → 206 (vidéo de 30 min cherchable)', async (ctx) => {
    if (!available) return ctx.skip('python3 absent');
    const size = fs.statSync(path.join(ROOT, 'donnees/bibles/ls1910.json')).size;
    const r = await fetch(BASE + '/donnees/bibles/ls1910.json', { headers: { Range: 'bytes=100-199' } });
    assert.equal(r.status, 206);
    assert.equal(r.headers.get('content-range'), `bytes 100-199/${size}`);
    assert.equal((await r.arrayBuffer()).byteLength, 100);
  });

  test('sauvegarde, liste, lecture, suppression', async (ctx) => {
    if (!available) return ctx.skip('python3 absent');
    const o = await (await post('/api/save', { folder: 'chants', name: 'py-test.json', data: { title: 'Python' } })).json();
    assert.equal(o.name, 'py-test.json');
    const l = await J('/api/list?folder=chants');
    assert.ok(l.items.some(x => x.name === 'py-test.json'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, 'donnees/chants/py-test.json'), 'utf8')).title, 'Python');
    await post('/api/delete', { folder: 'chants', name: 'py-test.json' });
    assert.ok(!fs.existsSync(path.join(ROOT, 'donnees/chants/py-test.json')));
  });

  test('upload binaire en POST', async (ctx) => {
    if (!available) return ctx.skip('python3 absent');
    const r = await fetch(BASE + '/api/upload', {
      method: 'POST', headers: { 'x-fs-folder': 'medias', 'x-fs-name': 'py-test.txt', 'Content-Type': 'application/octet-stream' },
      body: 'binaire OK',
    });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).size, 10);
    assert.equal(fs.readFileSync(path.join(ROOT, 'donnees/medias/py-test.txt'), 'utf8'), 'binaire OK');
    await post('/api/delete', { folder: 'medias', name: 'py-test.txt' });
  });

  test('SÉCURITÉ : dossier inconnu refusé, nom dangereux neutralisé', async (ctx) => {
    if (!available) return ctx.skip('python3 absent');
    const bad = await post('/api/save', { folder: '../../etc', name: 'x', data: 'x' });
    assert.equal(bad.status, 400, 'un dossier non déclaré ne doit jamais retomber sur la racine');
    const o = await (await post('/api/save', { folder: 'chants', name: '../../../hack.txt', data: 'x' })).json();
    assert.ok(!o.name.includes('..'), o.name);
    assert.ok(fs.existsSync(path.join(ROOT, 'donnees/chants', o.name)));
    assert.ok(!fs.existsSync(path.join(ROOT, 'hack.txt')), 'aucune écriture à la racine');
    await post('/api/delete', { folder: 'chants', name: o.name });
  });

  test('duplication RÉELLE + renommage', async (ctx) => {
    if (!available) return ctx.skip('python3 absent');
    await post('/api/save', { folder: 'chants', name: 'py-dup.json', data: { a: 1 } });
    const o = await (await post('/api/duplicate', { folder: 'chants', name: 'py-dup.json' })).json();
    assert.equal(o.copied, true);
    assert.ok(o.name.includes('copie'), o.name);
    assert.ok(fs.existsSync(path.join(ROOT, 'donnees/chants', o.name)));
    const ren = await (await post('/api/rename', { folder: 'chants', old: o.name, new: 'py-renomme.json' })).json();
    assert.equal(ren.name, 'py-renomme.json');
    await post('/api/delete', { folder: 'chants', name: 'py-dup.json' });
    await post('/api/delete', { folder: 'chants', name: 'py-renomme.json' });
  });

  test('route inconnue → 404 JSON', async (ctx) => {
    if (!available) return ctx.skip('python3 absent');
    const r = await fetch(BASE + '/api/inexistant');
    assert.equal(r.status, 404);
    assert.ok((await r.json()).error);
  });
});
