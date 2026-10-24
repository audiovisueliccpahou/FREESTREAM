import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { prepareTestData } from './setup.mjs';

const ROOT = process.cwd();
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-test-'));
const STATE_FILE = path.join(TMP, 'state.json');
let PORT = 0, BASE = '', child = null;

function freePort() {
  return new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
}
async function waitReady(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url + '/api/health'); if (r.ok) return; } catch { }
    await new Promise(r => setTimeout(r, 120));
  }
  throw new Error('Le serveur de test ne démarre pas');
}
const J = async (p, opt) => (await fetch(BASE + p, opt)).json();
const post = (p, body) => fetch(BASE + p, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });

before(async () => {
  PORT = await freePort(); BASE = `http://127.0.0.1:${PORT}`;
  prepareTestData(TMP, ROOT);
  child = spawn(process.execPath, ['server.js', String(PORT)], {
    cwd: ROOT, env: { ...process.env, FREESTREAM_HOST:'127.0.0.1', FREESTREAM_DATA_DIR:TMP, FREESTREAM_STATE_FILE:STATE_FILE, FREESTREAM_STATE_JS:path.join(TMP,'live.js') },
    stdio: ['ignore','pipe','pipe'],
  });
  child.stderr.on('data', d => process.stderr.write(d));
  await waitReady(BASE);
});
after(() => { try { child?.kill('SIGTERM'); } catch { } try { fs.rmSync(TMP,{recursive:true,force:true}); } catch { } });

describe('Serveur local — santé & pages', () => {
  test('les donnees de test sont ISOLEES du projet livre', async () => {
    const i = await J('/api/info');
    assert.ok(i.dataRoot && i.dataRoot !== i.root, 'FREESTREAM_DATA_DIR doit pointer ailleurs que la racine du projet');
    assert.ok(i.dataRoot.startsWith(os.tmpdir()), 'le dossier de donnees de test est temporaire');
  });
  test('repli : une demo absente de DATA_ROOT reste servie depuis le projet', async () => {
    const f = path.join(TMP, 'donnees/bibles/kjv.json');
    const backup = fs.readFileSync(f);
    fs.rmSync(f);
    try {
      const r = await fetch(BASE + '/donnees/bibles/kjv.json');
      assert.equal(r.status, 200, 'le repli doit servir la Bible integree');
      assert.ok((await r.text()).trim().startsWith('{'));
    } finally { fs.writeFileSync(f, backup); }
  });
  test('health répond', async () => { const h = await J('/api/health'); assert.equal(h.ok,true); });
  test('info expose le dossier, le port et les IP LAN', async () => {
    const i = await J('/api/info'); assert.ok(i.root.includes('FREESTREAM')); assert.equal(i.port,PORT); assert.ok(Array.isArray(i.lan));
  });
  test('toutes les pages et tous les modules sont servis', async () => {
    const pages = ['/','/index.html','/regie.html','/regie/app.js','/outputs/plein.html','/outputs/bas.html',
      '/outputs/custom.html','/outputs/orateur.html','/outputs/minuteur.html','/outputs/output.js','/outputs/minuteur.js',
      '/regies/minuteur.html','/styles/base.css','/styles/regie.css','/styles/output.css','/core/renderer.js','/core/store.js',
      '/regie/bible.js','/regie/chants.js','/regie/medias.js','/regie/lowerthird.js','/regie/designs.js','/regie/outputs.js','/regie/orateur.js'];
    for (const p of pages) { const r = await fetch(BASE+p); assert.equal(r.status,200,p+' → '+r.status); await r.arrayBuffer(); }
  });
  test('les types MIME sont corrects pour ES modules et vidéo', async () => {
    const r = await fetch(BASE+'/core/renderer.js'); assert.ok(r.headers.get('content-type').includes('javascript'));
    assert.ok((await fetch(BASE+'/index.html')).headers.get('content-type').includes('text/html'));
  });
});

describe('Serveur local — sécurité', () => {
  test('traversée de chemin bloquée', async () => {
    const a = await fetch(BASE+'/../../etc/passwd'); assert.ok([403,404].includes(a.status));
    const b = await fetch(BASE+'/%2e%2e%2f%2e%2e%2fetc%2fpasswd'); assert.ok([403,404].includes(b.status));
  });
  test('un nom de fichier dangereux est neutralisé (resté dans le dossier)', async () => {
    const r = await post('/api/save', { folder:'chants', name:'../../../hack.txt', data:'x' });
    const o = await r.json(); assert.ok(!o.name.includes('/')); assert.ok(!o.name.includes('..'));
    assert.ok(fs.existsSync(path.join(TMP,'donnees/chants',o.name)));
    await post('/api/delete', { folder:'chants', name:o.name });
  });
  test('dossier inconnu refusé', async () => {
    const r = await post('/api/save', { folder:'../../etc', name:'x', data:'x' });
    assert.ok(r.status >= 400);
  });
  test('CORS ouvert pour les sorties OBS', async () => {
    const r = await fetch(BASE+'/api/health'); assert.equal(r.headers.get('access-control-allow-origin'),'*');
  });
});

describe('Serveur local — état partagé & persistance', () => {
  test('patch profond sans écraser les valeurs voisines', async () => {
    await post('/api/patch', { patch:{ bible:{ book:'Esther', chapter:8 } } });
    let s = await J('/api/state');
    assert.equal(s.bible.book,'Esther'); assert.equal(s.bible.chapter,8);
    assert.equal(s.bible.verse,16);               // valeur par défaut préservée
    assert.ok(s.outputs.length >= 12);
  });
  test('le numéro de révision est incrémenté', async () => {
    const a = (await J('/api/state')).rev;
    await post('/api/patch', { patch:{ bible:{ verse:9 } } });
    const b = (await J('/api/state')).rev;
    assert.equal(b, a+1);
  });
  test('l\'état est écrit sur disque (autosave)', async () => {
    await new Promise(r=>setTimeout(r,350));
    assert.ok(fs.existsSync(STATE_FILE));
    const s = JSON.parse(fs.readFileSync(STATE_FILE,'utf8'));
    assert.equal(s.bible.book,'Esther');
  });
  test('le miroir live.js est produit pour le repli sans serveur', async () => {
    await new Promise(r=>setTimeout(r,250));
    const p = path.join(TMP,'live.js');
    assert.ok(fs.existsSync(p));
    assert.ok(fs.readFileSync(p,'utf8').startsWith('window.FREESTREAM_STATE='));
  });
  test('remplacement complet d\'état accepté', async () => {
    const s = await J('/api/state');
    s.bible.book = 'Jean';
    await post('/api/state', s);
    assert.equal((await J('/api/state')).bible.book,'Jean');
  });
  test('SSE : le premier événement contient l\'état complet', async () => {
    const ctrl = new AbortController();
    const r = await fetch(BASE+'/api/events',{signal:ctrl.signal});
    assert.equal(r.status,200);
    const reader = r.body.getReader(); const dec = new TextDecoder();
    let buf='';
    for (let i=0;i<8 && !buf.includes('event: state');i++){ const {value,done}=await reader.read(); if(done)break; buf+=dec.decode(value); }
    ctrl.abort();
    assert.ok(buf.includes('event: state'));
    assert.ok(buf.includes('"rev"'));
  });
  test('SSE : un patch est diffusé aux clients connectés', async () => {
    const ctrl = new AbortController();
    const r = await fetch(BASE+'/api/events',{signal:ctrl.signal});
    const reader = r.body.getReader(); const dec = new TextDecoder();
    let buf='';
    // vider le premier événement
    for (let i=0;i<8 && !buf.includes('event: state');i++){ const {value}=await reader.read(); buf+=dec.decode(value); }
    await post('/api/patch',{patch:{ live:{ tool:'bible' } }});
    let more='';
    for (let i=0;i<8 && !more.includes('event: state');i++){ const {value,done}=await reader.read(); if(done)break; more+=dec.decode(value); }
    ctrl.abort();
    assert.ok(more.includes('event: state'));
    assert.ok(more.includes('"tool":"bible"'));
  });
});

describe('Serveur local — documents & médias', () => {
  test('save / list / load / delete', async () => {
    const doc = { title:'Chant de test', sections:[{ id:'s1', label:'Couplet', lines:['L1','L2'] }] };
    const s = await (await post('/api/save',{folder:'chants',name:'http-test.json',data:doc})).json();
    assert.equal(s.name,'http-test.json');
    const l = await J('/api/list?folder=chants'); assert.ok(l.items.some(x=>x.name==='http-test.json'));
    const raw = await (await fetch(BASE+'/donnees/chants/http-test.json')).json();
    assert.equal(raw.title,'Chant de test');
    await post('/api/delete',{folder:'chants',name:'http-test.json'});
    const l2 = await J('/api/list?folder=chants'); assert.ok(!l2.items.some(x=>x.name==='http-test.json'));
  });
  test('upload binaire (simule une vidéo) puis lecture via /media/', async () => {
    const buf = Buffer.alloc(2048, 7);
    const r = await fetch(BASE+'/api/upload',{method:'POST',headers:{'x-fs-folder':'medias','x-fs-name':encodeURIComponent('clip-test.mp4'),'Content-Type':'application/octet-stream'},body:buf});
    const o = await r.json(); assert.equal(o.name,'clip-test.mp4'); assert.equal(o.size,2048);
    const m = await fetch(BASE+'/media/clip-test.mp4'); assert.equal(m.status,200);
    assert.equal(m.headers.get('content-type'),'video/mp4');
    await post('/api/delete',{folder:'medias',name:'clip-test.mp4'});
  });
  test('HTTP Range → 206 Partial Content (vidéo cherchable, 30 min fluide)', async () => {
    const target = path.join(TMP,'donnees/bibles/ls1910.json');
    const size = fs.statSync(target).size;
    const r = await fetch(BASE+'/donnees/bibles/ls1910.json',{headers:{Range:'bytes=100-199'}});
    assert.equal(r.status,206);
    assert.equal(r.headers.get('content-range'),`bytes 100-199/${size}`);
    assert.equal((await r.arrayBuffer()).byteLength,100);
    const open = await fetch(BASE+'/donnees/bibles/ls1910.json',{headers:{Range:'bytes=200-'}});
    assert.equal(open.status,206);
    assert.equal((await open.arrayBuffer()).byteLength,size-200);
    const bad = await fetch(BASE+'/donnees/bibles/ls1910.json',{headers:{Range:`bytes=${size+10}-`}});
    assert.equal(bad.status,416);
  });
  test('copie d\'un fichier extérieur vers le dossier du projet', async () => {
    const src = path.join(TMP,'externe.txt'); fs.writeFileSync(src,'copie OK');
    const o = await (await post('/api/copy',{src,folder:'medias'})).json();
    assert.equal(o.copied,true);
    assert.equal(fs.readFileSync(path.join(TMP,'donnees/medias',o.name),'utf8'),'copie OK');
    await post('/api/delete',{folder:'medias',name:o.name});
  });
  test('renommage', async () => {
    await post('/api/save',{folder:'chants',name:'avant.json',data:{a:1}});
    const o = await (await post('/api/rename',{folder:'chants',old:'avant.json',new:'apres.json'})).json();
    assert.equal(o.name,'apres.json');
    assert.ok(fs.existsSync(path.join(TMP,'donnees/chants/apres.json')));
    await post('/api/delete',{folder:'chants',name:'apres.json'});
  });
  test('duplication RÉELLE d’un fichier du projet (pas un simple toast)', async () => {
    const name = 'dup-src.json';
    await post('/api/save',{folder:'chants',name,data:{title:'Original'}});
    const r = await post('/api/duplicate',{folder:'chants',name});
    assert.equal(r.status,200);
    const o = await r.json();
    assert.equal(o.copied,true);
    assert.ok(o.name.includes('copie'), o.name);
    assert.notEqual(o.name,name);
    const copied = JSON.parse(fs.readFileSync(path.join(TMP,'donnees/chants',o.name),'utf8'));
    assert.equal(copied.title,'Original');
    assert.ok(fs.existsSync(path.join(TMP,'donnees/chants',name)),'l’original est conservé');
    // Une 2e duplication ne doit pas écraser la 1re.
    const o2 = await (await post('/api/duplicate',{folder:'chants',name})).json();
    assert.notEqual(o2.name,o.name);
    await post('/api/delete',{folder:'chants',name});
    await post('/api/delete',{folder:'chants',name:o.name});
    await post('/api/delete',{folder:'chants',name:o2.name});
  });
  test('duplication refuse un dossier inconnu et un fichier absent', async () => {
    const bad = await post('/api/duplicate',{folder:'../../etc',name:'x'});
    assert.equal(bad.status,400);
    const miss = await post('/api/duplicate',{folder:'chants',name:'nexiste-pas.json'});
    assert.equal(miss.status,404);
  });
  test('conversion : fichier absent refusé proprement, état de LibreOffice exposé', async () => {
    const c = await J('/api/convert/check'); assert.equal(typeof c.available,'boolean');
    const r = await post('/api/convert',{name:'inexistant.pptx'});
    const body = await r.json();
    // fichier absent → 404 ; présent mais sans LibreOffice → { ok:false, reason }
    assert.ok(r.status === 404 || body.ok === false, JSON.stringify(body));
  });
  test('présence des sorties OBS', async () => {
    await post('/api/presence',{id:'plein:*:',type:'plein',tool:'*',url:'/outputs/plein.html'});
    const p = (await J('/api/state')).presence; assert.ok(p['plein:*:']);
  });
  test('route inconnue → 404 JSON', async () => {
    const r = await fetch(BASE+'/api/inexistant'); assert.equal(r.status,404); assert.ok((await r.json()).error);
  });
});
