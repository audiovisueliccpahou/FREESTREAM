/**
 * Regression du lanceur Windows : methode OpenPresenter.
 * github.com/renaudchristinfonton-bj/Openpresenter (servergestionobs)
 *
 * Principe : le serveur tourne AU PREMIER PLAN dans la fenetre du .bat, et
 * c'est LUI qui ouvre le navigateur apres listen(). Plus de fenetre minimisee
 * qui disparait, plus de navigateur ouvert avant que le port ne reponde.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-launcher-'));
const ENV = {
  ...process.env,
  FREESTREAM_HOST: '127.0.0.1',
  FREESTREAM_OPEN: '0', OPEN: '0',
  FREESTREAM_STATE_FILE: path.join(TMP, 'state.json'),
  FREESTREAM_STATE_JS: path.join(TMP, 'live.js'),
};
const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.once('error', reject);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
});
async function health(port, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (r.ok) return await r.json();
    } catch { }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('serveur non pret sur ' + port);
}
after(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { } });

describe('Lanceur Windows — methode OpenPresenter (premier plan)', () => {
  test('DEMARRER.bat lance le serveur au PREMIER PLAN, pas dans une fenetre minimisee', () => {
    const s = fs.readFileSync(path.join(ROOT, 'DEMARRER.bat'), 'utf8');
    assert.ok(!/start\s+"[^"]*"\s*\/min\s+cmd\s+\/c/i.test(s),
      'INTERDIT : fenetre minimisee qui disparait en cas d erreur');
    assert.ok(/^node server\.js %PORT%$/m.test(s), 'Node.js lance directement dans la fenetre');
    assert.ok(/^python server\.py %PORT%$/m.test(s), 'repli Python au premier plan');
    assert.ok(/server\.ps1" -Port %PORT%$/m.test(s), 'repli PowerShell au premier plan');
  });

  test('le serveur ouvre le navigateur, pas le .bat', () => {
    const bat = fs.readFileSync(path.join(ROOT, 'DEMARRER.bat'), 'utf8');
    assert.ok(/^set "OPEN=1"$/m.test(bat) && /^set "FREESTREAM_OPEN=1"$/m.test(bat),
      'le .bat demande au serveur d ouvrir le navigateur');
    // Le .bat n'ouvre plus les pages lui-meme avant que le serveur reponde.
    const avantStart = bat.slice(0, bat.indexOf(':startserver'));
    assert.ok(!/start "" "http:\/\/localhost:%PORT%\/regie\.html"/.test(avantStart));
    for (const f of ['server.js', 'server.py', 'server.ps1']) {
      const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert.ok(/FREESTREAM_OPEN|env:OPEN/.test(s), `${f} : doit reconnaitre la demande d ouverture`);
    }
  });

  test('diagnostic en 4 etapes, verification du port, PORT surchargeable', () => {
    const s = fs.readFileSync(path.join(ROOT, 'DEMARRER.bat'), 'utf8');
    for (const step of ['[1/4]', '[2/4]', '[3/4]', '[4/4]']) assert.ok(s.includes(step), step + ' manquant');
    assert.ok(/netstat -aon/.test(s), 'controle du port deja occupe');
    assert.ok(/if "%PORT%"=="" set "PORT=8787"/.test(s), 'PORT surchargeable');
    assert.ok(/PORT_BUSY/.test(s), 'detection d un serveur deja lance');
    assert.ok(/api\/health/.test(s), 'controle de sante avant d accuser le port');
  });

  test('chaque moteur qui echoue est teste SUR SA PROPRE LIGNE puis repli', () => {
    const s = fs.readFileSync(path.join(ROOT, 'DEMARRER.bat'), 'utf8');
    assert.ok(!/exit\s+\/b\s+%errorlevel%/i.test(s), 'exit /b %errorlevel% interdit');
    assert.ok((s.match(/if errorlevel 1 goto :/g) || []).length >= 5, 'echecs testes un par un');
    assert.ok(/where node/.test(s) && /where python/.test(s) && /where py /.test(s));
    assert.ok(/goto :fallback/.test(s), 'repli PowerShell');
    assert.ok(/mode=dossier/.test(s), 'repli ultime sans installation');
  });
});

describe('Executable autonome FREESTREAM.exe (Node SEA)', () => {
  test('CONSTRUIRE-EXE.bat : ASCII, labels, postject, sentinel, pause', () => {
    const s = fs.readFileSync(path.join(ROOT, 'CONSTRUIRE-EXE.bat'), 'utf8');
    assert.equal([...s].filter(c => c.codePointAt(0) > 127).length, 0, 'ASCII pur');
    assert.ok(/sea-config\.json/.test(s) && /experimental-sea-config/.test(s));
    assert.ok(/postject/.test(s));
    assert.ok(/NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2/.test(s), 'sentinel SEA');
    assert.ok(/FREESTREAM\.exe/.test(s));
    assert.ok(/pause/.test(s), 'ne doit jamais se fermer sans message');
    const labels = new Set([...s.matchAll(/^\s*:([A-Za-z0-9_]+)\s*$/gm)].map(m => m[1].toLowerCase()));
    for (const m of s.matchAll(/\bgoto\s+:([A-Za-z0-9_]+)/gi))
      assert.ok(labels.has(m[1].toLowerCase()), 'goto :' + m[1] + ' sans label');
  });

  test('sea-config.json coherent avec l amorse presente sur disque', () => {
    const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'outils', 'sea-config.json'), 'utf8'));
    assert.equal(c.main, 'outils/sea-entry.cjs');
    assert.ok(c.output.endsWith('.blob'));
    assert.equal(c.disableExperimentalSEAWarning, true);
    assert.ok(fs.existsSync(path.join(ROOT, c.main)), 'amorce absente');
    assert.equal(spawnSync(process.execPath, ['--check', c.main], { cwd: ROOT }).status, 0);
  });

  test('l amorse SEA demarre REELLEMENT le serveur (health 200)', async () => {
    const port = await freePort();
    const child = spawn(process.execPath, [path.join('outils', 'sea-entry.cjs'), String(port)], {
      cwd: ROOT,
      env: { ...ENV, FREESTREAM_ROOT: ROOT },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let err = '';
    child.stderr.on('data', d => { err += d; });
    try {
      const h = await health(port);
      assert.equal(h.ok, true, 'health via amorce : ' + err);
      const r = await fetch(`http://127.0.0.1:${port}/regie.html`);
      assert.equal(r.status, 200, 'regie via amorce');
    } finally { child.kill('SIGKILL'); }
  });

  test('l exe Windows livre est un vrai PE avec le blob SEA injecte', (t) => {
    const exe = path.join(ROOT, 'dist', 'FREESTREAM', 'FREESTREAM.exe');
    if (!fs.existsSync(exe)) return t.skip('exe pre-construit absent (CONSTRUIRE-EXE.bat)');
    const b = fs.readFileSync(exe);
    assert.equal(b.subarray(0, 2).toString('latin1'), 'MZ', 'signature Windows PE');
    assert.ok(b.includes(Buffer.from('NODE_SEA_BLOB')), 'ressource SEA absente');
    assert.ok(b.includes(Buffer.from('NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2')), 'sentinel absent');
    assert.ok(b.length > 50 * 1024 * 1024, 'moteur Node integre');
  });
});

describe('Port occupe : plus de crash muet', () => {
  test('Node : message explicite et code de sortie 1', async () => {
    const port = await freePort();
    const a = spawn(process.execPath, ['server.js', String(port)], {
      cwd: ROOT, env: ENV, stdio: ['ignore', 'pipe', 'pipe'],
    });
    try {
      await health(port);
      const b = spawnSync(process.execPath, ['server.js', String(port)], {
        cwd: ROOT, env: ENV, encoding: 'utf8', timeout: 15000,
      });
      assert.equal(b.status, 1, 'doit sortir proprement avec le code 1');
      const out = (b.stdout || '') + (b.stderr || '');
      assert.match(out, /deja utilise/, 'doit nommer la cause');
      assert.match(out, /set PORT=9000/, 'doit proposer la solution');
    } finally { a.kill('SIGKILL'); }
  });

  test('Python : message explicite et code de sortie 1', async () => {
    const py = spawnSync('python3', ['--version'], { encoding: 'utf8' });
    if (py.status !== 0) return;
    const port = await freePort();
    const a = spawn('python3', ['server.py', String(port)], {
      cwd: ROOT, env: ENV, stdio: ['ignore', 'pipe', 'pipe'],
    });
    try {
      await health(port);
      const b = spawnSync('python3', ['server.py', String(port)], {
        cwd: ROOT, env: ENV, encoding: 'utf8', timeout: 15000,
      });
      assert.equal(b.status, 1, 'doit sortir proprement avec le code 1');
      assert.match((b.stdout || '') + (b.stderr || ''), /Impossible d ecouter/);
    } finally { a.kill('SIGKILL'); }
  });
});
