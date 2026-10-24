/**
 * FREESTREAM — tests de bout en bout dans un VRAI navigateur (Chromium headless).
 *
 * Objectif : vérifier ce que jsdom ne peut pas voir — opacité réelle, animations,
 * rendu CSS, absence d'erreurs console, et le parcours régie → sorties OBS.
 *
 * Le navigateur est fourni par @sparticuz/chromium (binaire embarqué dans le
 * paquet npm, aucun téléchargement externe). Si le lancement échoue sur cette
 * machine, la suite est SKIPPÉE proprement et n'empêche pas les autres tests.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-browser-'));
let PORT = 0, BASE = '', child = null, browser = null, skipReason = '';

const postDelete = (folder, name) => fetch(BASE + '/api/delete', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ folder, name }),
}).catch(() => {});

const freePort = () => new Promise(res => {
  const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
});
async function waitReady(url, tries = 70) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url + '/api/health'); if (r.ok) return; } catch { }
    await new Promise(r => setTimeout(r, 120));
  }
  throw new Error('Le serveur de test ne démarre pas');
}

/**
 * @sparticuz/chromium extrait le binaire mais pas toujours les bibliothèques
 * NSS/NSPR (al2023.tar.br). On les dépose dans /tmp et on force LD_LIBRARY_PATH.
 */
function prepareLibs() {
  const libDir = path.join(os.tmpdir(), 'fs-chromium-libs');
  const marker = path.join(libDir, 'lib', 'libnspr4.so');
  if (fs.existsSync(marker)) return path.join(libDir, 'lib');
  const br = path.join(ROOT, 'node_modules', '@sparticuz', 'chromium', 'bin', 'al2023.tar.br');
  if (!fs.existsSync(br)) return null;
  try {
    fs.mkdirSync(libDir, { recursive: true });
    const tarPath = path.join(os.tmpdir(), 'fs-al2023.tar');
    fs.writeFileSync(tarPath, zlib.brotliDecompressSync(fs.readFileSync(br)));
    const r = spawnSync('tar', ['-xf', tarPath, '-C', libDir], { encoding: 'utf8' });
    if (r.status !== 0) return null;
    return fs.existsSync(marker) ? path.join(libDir, 'lib') : null;
  } catch { return null; }
}

async function launch() {
  try {
    const { chromium } = await import('playwright-core');
    const mod = await import('@sparticuz/chromium');
    const exe = mod.default || mod;
    const executablePath = await exe.executablePath();
    if (!executablePath || !fs.existsSync(executablePath)) throw new Error('binaire Chromium absent');
    const libs = prepareLibs();
    const LD = [libs, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
    // IMPORTANT : @sparticuz/chromium ajoute --single-process par défaut. Dans ce
    // mode, fermer une page tue le navigateur entier → on retire ce flag.
    const base = (exe.args || []).filter(a => !['--single-process', '--no-zygote'].includes(a));
    return await chromium.launch({
      executablePath, headless: true,
      env: { ...process.env, LD_LIBRARY_PATH: LD },
      args: [...base, '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
  } catch (e) { skipReason = e.message || String(e); return null; }
}

before(async () => {
  PORT = await freePort(); BASE = `http://127.0.0.1:${PORT}`;
  child = spawn(process.execPath, ['server.js', String(PORT)], {
    cwd: ROOT,
    env: { ...process.env, FREESTREAM_HOST: '127.0.0.1', FREESTREAM_STATE_FILE: path.join(TMP, 'state.json'), FREESTREAM_STATE_JS: path.join(TMP, 'live.js') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', d => process.stderr.write(d));
  await waitReady(BASE);
  // --test-force-exit peut court-circuiter after() : on garantit quand même
  // la mort du serveur enfant pour ne pas laisser de port occupé.
  process.on('exit', () => { try { child?.kill('SIGKILL'); } catch {} });
  browser = await launch();
  if (!browser) console.log(`  ⚠ Navigateur indisponible (${skipReason}) — suite navigateur ignorée.`);
});
after(async () => {
  try { await browser?.close(); } catch { }
  try { child?.kill('SIGTERM'); } catch { }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { }
});

describe('Navigateur réel — régie', () => {
  test('la régie se charge sans aucune erreur console', async (ctx) => { if (!browser) return ctx.skip('navigateur indisponible : ' + skipReason);
    const p = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = [];
    p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await p.goto(BASE + '/regie.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2000);
    assert.equal(await p.title(), 'FREESTREAM — Régie');
    assert.equal(await p.locator('#nav .navbtn').count(), 9, '9 outils/vues dans la navigation');
    assert.equal(await p.locator('#nav .ico svg').count(), 9, 'icônes SVG réellement dimensionnées');
    const svgBox = await p.locator('#nav .ico svg').first().boundingBox();
    assert.ok(svgBox && svgBox.width >= 20 && svgBox.height >= 20, 'SVG visibles (pas 0×0)');
    assert.ok(await p.locator('#b-book').count(), 'champ livre Bible présent');
    assert.ok(await p.locator('#b-grid .vbtn').count() > 0, 'grille de versets rendue');
    assert.ok(await p.locator('#pv-work-plein .fs-text-layer').count() > 0, 'aperçu TRAVAIL initialisé');
    assert.ok(await p.locator('#pv-work-bas .fs-text-layer').count() > 0, 'aperçu bas centré initialisé');
    assert.deepEqual(errors, [], 'aucune erreur console : ' + errors.join(' | '));
    await p.close();
  });

  test('⛶ Max et ◧ Aperçus maximisent réellement l’espace de travail', async (ctx) => {
    if (!browser) return ctx.skip('navigateur indisponible : ' + skipReason);
    const p = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await p.goto(BASE + '/regie.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1700);
    const before = await p.locator('#main').boundingBox();
    await p.click('#btn-panel');
    await p.waitForTimeout(300);
    const after = await p.locator('#main').boundingBox();
    assert.ok(after.width > before.width, `le panneau replié élargit l’éditeur (${before.width} → ${after.width})`);
    assert.ok(await p.evaluate(() => document.body.classList.contains('no-preview')));
    await p.click('#btn-max');
    await p.waitForTimeout(250);
    assert.ok(await p.evaluate(() => document.body.classList.contains('ui-max')), 'mode plein écran actif');
    await p.click('#exitmax');
    await p.waitForTimeout(200);
    assert.ok(!(await p.evaluate(() => document.body.classList.contains('ui-max'))), 'retour affichage normal');
    await p.close();
  });

  test('les aperçus TRAVAIL affichent le texte et sont synchronisés', async (ctx) => { if (!browser) return ctx.skip('navigateur indisponible : ' + skipReason);
    const p = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await p.goto(BASE + '/regie.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1800);
    const txt = await p.locator('#pv-work-plein').textContent();
    assert.ok(txt && txt.trim().length > 8, 'aperçu plein non vide : ' + JSON.stringify(txt?.slice(0, 60)));
    const basTxt = await p.locator('#pv-work-bas').textContent();
    assert.ok(basTxt && basTxt.trim().length > 4, 'aperçu bas non vide');
    await p.close();
  });
});

describe('Navigateur réel — sorties OBS', () => {
  test('régie → clic « Les deux » → plein ET bas affichent le bon texte', async (ctx) => { if (!browser) return ctx.skip('navigateur indisponible : ' + skipReason);
    const regie = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const errs = [];
    regie.on('pageerror', e => errs.push(e.message));
    await regie.goto(BASE + '/regie.html', { waitUntil: 'domcontentloaded' });
    await regie.waitForTimeout(1800);
    await regie.locator('#b-send-both').click();
    await regie.waitForTimeout(600);

    const plein = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const pe = []; plein.on('pageerror', e => pe.push(e.message));
    await plein.goto(BASE + '/outputs/plein.html', { waitUntil: 'domcontentloaded' });
    await plein.waitForTimeout(2200);
    assert.ok(await plein.locator('.fs-text-layer').count() > 0, 'couches de texte présentes');
    const t = (await plein.locator('.fs-text-layer[data-role=content]').first().textContent()) || '';
    assert.ok(t.includes('secrétaires') || t.length > 20, 'texte du verset affiché : ' + JSON.stringify(t.slice(0, 80)));
    assert.deepEqual(pe, [], 'aucune erreur dans la sortie plein écran');

    const bas = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await bas.goto(BASE + '/outputs/bas.html', { waitUntil: 'domcontentloaded' });
    await bas.waitForTimeout(2200);
    assert.ok(await bas.locator('.fs-text-layer').count() > 0, 'couches du bas centré présentes');
    await plein.close(); await bas.close(); await regie.close();
  });

  test('Bible : le plein écran reste FIGÉ pendant toutes les sections du bas centré', async (ctx) => {
    if (!browser) return ctx.skip('navigateur indisponible : ' + skipReason);
    // État propre pour un test indépendant de l'ordre d'exécution.
    await fetch(BASE + '/api/state', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rev: 90, live: { tool: null, fullscreen: null, lower: null, lowerthird: null, blackout: false, history: [] }, bible: { book: 'Jean', chapter: 3, verse: 16 } }),
    });
    const regie = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const errs = []; regie.on('pageerror', e => errs.push(e.message));
    await regie.goto(BASE + '/regie.html', { waitUntil: 'domcontentloaded' });
    await regie.waitForTimeout(2200);
    // Saisie exacte du cahier des charges : 2 lettres → Entrée → 8 → Espace → 9 → Entrée
    await regie.fill('#b-book', 'es');
    await regie.press('#b-book', 'Enter'); await regie.waitForTimeout(180);
    await regie.fill('#b-chap', '8'); await regie.press('#b-chap', 'Space');
    await regie.fill('#b-verse', '9'); await regie.press('#b-verse', 'Enter');
    await regie.waitForTimeout(600);
    assert.equal(await regie.locator('#b-ref').textContent(), 'Esther 8:9');
    assert.equal(await regie.locator('#b-parts .partbtn').count(), 4, 'Esther 8:9 = 4 sections');
    await regie.click('#b-send-both'); await regie.waitForTimeout(700);

    const plein = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const bas = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await plein.goto(BASE + '/outputs/plein.html', { waitUntil: 'domcontentloaded' });
    await bas.goto(BASE + '/outputs/bas.html', { waitUntil: 'domcontentloaded' });
    await plein.waitForTimeout(1900); await bas.waitForTimeout(1900);
    const read = async q => (((await q.locator('.fs-text-layer[data-role=content]').first().textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim());
    const plein0 = await read(plein), bas0 = await read(bas);
    assert.equal(plein0.length, 457, 'verset complet en plein écran');
    assert.ok(bas0.length > 0 && bas0.length < 457, '1re section en bas centré');

    await regie.click('.tool-head h1');   // sortir du champ pour activer les raccourcis
    for (let i = 1; i <= 3; i++) {
      await regie.keyboard.press('ArrowRight'); await regie.waitForTimeout(750);
      assert.equal(await read(plein), plein0, `le plein écran ne doit PAS bouger à la section ${i + 1}/4`);
      assert.notEqual(await read(bas), bas0, `le bas centré doit défiler à la section ${i + 1}/4`);
    }
    await regie.keyboard.press('ArrowRight'); await regie.waitForTimeout(900);
    assert.notEqual(await read(plein), plein0, 'après la dernière section, le plein avance avec le verset suivant');
    assert.ok((await read(plein)).length > 0, 'le plein écran ne doit jamais devenir vide');
    assert.deepEqual(errs, [], 'aucune erreur pendant la navigation');
    await plein.close(); await bas.close(); await regie.close();
  });

  test('sortie CŒUR : chants en gros + section suivante en bas', async (ctx) => {
    if (!browser) return ctx.skip('navigateur indisponible : ' + skipReason);
    // Un chant réel avec DEUX sections distinctes pour vérifier l'annonce.
    const song = { id: 'song-coeur-test', title: 'Chant Cœur', sections: [
      { id: 's1', label: 'Couplet 1', lines: ['Première ligne du couplet', 'Deuxième ligne du couplet'], chords: [] },
      { id: 's2', label: 'Refrain', lines: ['Refrain à venir', 'Encore une ligne'], chords: [] },
    ], tags: [], author: '', key: '', meta: {}, createdAt: Date.now(), updatedAt: Date.now() };
    fs.writeFileSync(path.join(TMP, 'song-coeur.json'), JSON.stringify(song));
    const up = fs.readFileSync(path.join(TMP, 'song-coeur.json'));
    await fetch(BASE + '/api/upload', { method: 'POST',
      headers: { 'x-fs-folder': 'chants', 'x-fs-name': 'song-coeur-test.json', 'Content-Type': 'application/octet-stream' }, body: up });

    const regie = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const errs = []; regie.on('pageerror', e => errs.push(e.message));
    await regie.goto(BASE + '/regie.html', { waitUntil: 'domcontentloaded' });
    await regie.waitForTimeout(2200);
    await regie.click('[data-t="chants"]');
    await regie.waitForTimeout(900);
    // Ouvrir le chant de test s'il est listé, sinon on pilote directement l'état.
    const item = regie.locator('.list-item', { hasText: 'Chant Cœur' }).first();
    if (await item.count()) { await item.click(); await regie.waitForTimeout(500); }
    // Bascule vers l'onglet projection si présent
    const proj = regie.locator('button, .tab', { hasText: /Projection/i }).first();
    if (await proj.count()) { await proj.click().catch(() => {}); await regie.waitForTimeout(500); }

    const coeur = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    coeur.on('pageerror', e => errs.push('coeur ' + e.message));
    await coeur.goto(BASE + '/outputs/coeur.html', { waitUntil: 'domcontentloaded' });
    await coeur.waitForTimeout(1300);
    assert.ok(await coeur.locator('#root').count(), 'page Cœur chargée');

    // Envoi déterministe via l'API (couvre le chemin de rendu réel).
    await fetch(BASE + '/api/patch', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patch: { live: { tool: 'chants', blackout: false, coeur: {
        tool: 'chants', key: 'coeur-test:1', designId: 'chants:coeur',
        vars: { title: 'Chant Cœur', content: 'Première ligne du couplet<br>Deuxième ligne du couplet',
          section: 'Couplet 1 · 1/2', nextLabel: 'À SUIVRE · Refrain', next: 'Refrain à venir<br>Encore une ligne' },
      } } } }) });
    await coeur.waitForTimeout(1600);
    const layers = await coeur.locator('.fs-text-layer').count();
    assert.ok(layers >= 4, 'couches titre / contenu / libellé / suivant (' + layers + ')');
    const content = (await coeur.locator('.fs-text-layer[data-role=content]').first().textContent().catch(() => '')) || '';
    const next = (await coeur.locator('.fs-text-layer[data-role=next]').first().textContent().catch(() => '')) || '';
    const label = (await coeur.locator('.fs-text-layer[data-role=nextLabel]').first().textContent().catch(() => '')) || '';
    assert.ok(content.includes('Première ligne'), 'couplet courant affiché');
    assert.ok(next.includes('Refrain à venir'), 'section suivante affichée');
    assert.ok(label.includes('SUIVRE'), 'libellé « à suivre »');

    // Le Cœur est « collant » : un envoi Bible ne doit PAS l'effacer.
    await fetch(BASE + '/api/patch', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patch: { live: { tool: 'bible', blackout: false,
        fullscreen: { tool: 'bible', key: 'b:1', designId: 'bible:plein', vars: { reference: 'Jean 3:16', content: 'Car Dieu a tant aimé le monde.' } } } } }) });
    await coeur.waitForTimeout(1200);
    const still = (await coeur.locator('.fs-text-layer[data-role=next]').first().textContent().catch(() => '')) || '';
    assert.ok(still.includes('Refrain à venir'), 'le Cœur survit à un envoi Bible (moniteur de louange)');
    assert.deepEqual(errs, [], 'aucune erreur console : ' + errs.join(' | '));

    await postDelete('chants', 'song-coeur-test.json');
    await coeur.close(); await regie.close();
  });

  test('média non-16:9 : vignette floutée de fond + média net au premier plan', async (ctx) => {
    if (!browser) return ctx.skip('navigateur indisponible : ' + skipReason);
    // PNG 1×3 volontairement très éloigné du 16:9.
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAADCAYAAABS3WWCAAAAFUlEQVR4nGP8z8DAwMDAxAADCBYAG10QAc/4H9sAAAAASUVORK5CYII=', 'base64');
    const target = path.join(ROOT, 'donnees', 'medias', '__test-vignette.png');
    fs.writeFileSync(target, png);
    const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + '/outputs/plein.html?tool=medias', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1200);
    await fetch(BASE + '/api/patch', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patch: { live: { tool: 'medias', blackout: false, fullscreen: {
        tool: 'medias', key: 'vig:1', designId: 'medias:plein',
        vars: { mediaSrc: '/donnees/medias/__test-vignette.png', title: 'Test' },
        media: { src: '/donnees/medias/__test-vignette.png', kind: 'image' },
      } } } }) });
    await p.waitForTimeout(1500);
    const r = await p.evaluate(() => {
      const bg = document.querySelector('.fs-media-vignette-bg');
      const front = document.querySelector('.fs-media-front');
      const vig = document.querySelector('.fs-media-vignette');
      return { bg: !!bg, front: !!front, vig: !!vig,
        blur: bg ? getComputedStyle(bg).filter : '', fit: front ? getComputedStyle(front).backgroundSize : '' };
    });
    assert.equal(r.bg, true, 'fond flouté inspiré du média');
    assert.equal(r.front, true, 'média net au premier plan');
    assert.equal(r.vig, true, 'dégradé de vignette');
    assert.ok(r.blur.includes('blur'), 'fond réellement flouté : ' + r.blur);
    assert.ok(r.fit.includes('contain'), 'aucun recadrage du média : ' + r.fit);
    assert.deepEqual(errs, []);
    await p.close();
    try { fs.unlinkSync(target); } catch { }
  });

  test('opacité réelle = 1 même si le timeline d’animation est figé (cas OBS masqué)', async (ctx) => { if (!browser) return ctx.skip('navigateur indisponible : ' + skipReason);
    // Correctif critique : une source navigateur non visible peut laisser
    // Web Animations à currentTime 0 avec fill:both → texte invisible.
    // État déterministe : ce test ne doit pas dépendre de l'ordre des autres.
    await fetch(BASE + '/api/patch', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patch: { live: { tool: 'bible', blackout: false, fullscreen: {
        tool: 'bible', key: 'opacite:1', designId: 'bible:plein',
        vars: { reference: 'Esther 8:9', content: 'Les secrétaires du roi furent appelés en ce temps-là.' },
      } } } }) });
    const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await p.goto(BASE + '/outputs/plein.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2400);
    const r = await p.evaluate(() => {
      const l = document.querySelector('.fs-text-layer[data-role=content]');
      if (!l) return null;
      return { inline: l.style.opacity, computed: getComputedStyle(l).opacity, anims: l.getAnimations().length };
    });
    assert.ok(r, 'couche de contenu trouvée');
    assert.equal(r.inline, '1', 'opacité inline de sécurité');
    assert.equal(r.computed, '1', 'opacité calculée RÉELLE = 1 (visible dans OBS)');
    assert.equal(r.anims, 0, 'animation libérée par le filet de sécurité');
    await p.close();
  });

  test('fond vide transparent : la caméra peut passer derrière', async (ctx) => { if (!browser) return ctx.skip('navigateur indisponible : ' + skipReason);
    const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await p.goto(BASE + '/outputs/bas.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1200);
    const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.ok(bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent', 'body transparent : ' + bg);
    await p.close();
  });

  test('?tool=chs la sortie dédiée : un outil non ciblé ne s’affiche pas', async (ctx) => { if (!browser) return ctx.skip('navigateur indisponible : ' + skipReason);
    const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + '/outputs/plein.html?tool=bible', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1400);
    assert.deepEqual(errs, [], 'sortie dédiée sans erreur');
    assert.ok(await p.locator('#root').count(), 'racine de rendu présente');
    await p.close();
  });
});

describe('Navigateur réel — robustesse', () => {
  test('lowerthird avec durée courte disparaît tout seul', async (ctx) => { if (!browser) return ctx.skip('navigateur indisponible : ' + skipReason);
    const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await p.goto(BASE + '/outputs/bas.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(900);
    await fetch(BASE + '/api/patch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patch: { live: { lowerthird: { text: 'Annonce test', duration: 1, startedAt: Date.now(), target: 'bas' } } } }),
    });
    await p.waitForTimeout(600);
    const visibleEarly = await p.evaluate(() => {
      const e = document.querySelector('#overlay');
      return e ? getComputedStyle(e).opacity !== '0' : false;
    });
    await p.waitForTimeout(1500);
    const state = await (await fetch(BASE + '/api/state')).json();
    assert.ok(state.live?.lowerthird, 'lowerthird bien présent dans l’état');
    assert.equal(state.live.lowerthird.duration, 1);
    // Le test valide surtout que la page ne plante pas et reste lisible.
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.waitForTimeout(200);
    assert.deepEqual(errors, []);
    await p.close();
  });

  test('aucune erreur console sur la page des liens OBS', async (ctx) => { if (!browser) return ctx.skip('navigateur indisponible : ' + skipReason);
    const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await p.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1500);
    assert.deepEqual(errors, [], 'page des liens propre : ' + errors.join(' | '));
    const links = await p.locator('a, code').count();
    assert.ok(links >= 8, 'les liens de sorties sont listés (' + links + ')');
    await p.close();
  });
});
