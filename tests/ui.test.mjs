import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { JSDOM } from 'jsdom';
import { prepareTestData } from './setup.mjs';

const ROOT = process.cwd();
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-ui-'));
let PORT = 0, BASE = '', child = null, realFetch, sharedStore;
const handles = new Set();

const freePort = () => new Promise(res => { const s=net.createServer(); s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>res(p));}); });
async function waitReady(){ for(let i=0;i<70;i++){ try{ if((await realFetch(BASE+'/api/health')).ok) return; }catch{} await new Promise(r=>setTimeout(r,100)); } throw new Error('serveur UI indisponible'); }

before(async () => {
  realFetch = globalThis.fetch;
  PORT = await freePort(); BASE = `http://127.0.0.1:${PORT}`;
  prepareTestData(TMP, ROOT);
  child = spawn(process.execPath, ['server.js',String(PORT)], { cwd:ROOT, stdio:['ignore','pipe','pipe'],
    env:{...process.env, FREESTREAM_HOST:'127.0.0.1', FREESTREAM_OPEN:'0', OPEN:'0', FREESTREAM_DATA_DIR:TMP, FREESTREAM_STATE_FILE:path.join(TMP,'state.json'), FREESTREAM_STATE_JS:path.join(TMP,'live.js')} });
  await waitReady();

  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="main"></div>
    <div id="pv-work-plein"><div class="stage-host"></div></div>
    <div id="pv-work-bas"><div class="stage-host"></div></div>
    <div id="toasts"></div><dialog id="dlg"></dialog>
  </body></html>`, { url: BASE+'/regie.html', pretendToBeVisual:true });
  const w = dom.window;
  w.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
  w.HTMLCanvasElement.prototype.getContext = () => null;
  w.HTMLMediaElement.prototype.play = function(){ return Promise.resolve(); };
  w.HTMLMediaElement.prototype.pause = function(){};
  w.HTMLElement.prototype.animate = function(){ return { finished:Promise.resolve(), cancel(){} }; };
  Object.defineProperty(w.HTMLElement.prototype,'clientWidth',{get(){return 1200;},configurable:true});
  Object.defineProperty(w.HTMLElement.prototype,'clientHeight',{get(){return 675;},configurable:true});
  w.document.execCommand = () => true;
  w.alert = () => {}; w.confirm = () => true; w.prompt = () => '';
  for (const k of ['window','document','DOMParser','Node','HTMLElement','ResizeObserver','location','navigator']) {
    try { Object.defineProperty(globalThis,k,{ value:k==='location'?w.location:k==='navigator'?w.navigator:w[k], configurable:true, writable:true }); } catch {}
  }
  globalThis.BroadcastChannel = undefined;
  globalThis.indexedDB = undefined;
  globalThis.EventSource = undefined;
  globalThis.fetch = (u,o) => realFetch(new URL(String(u), BASE).href, o);
  globalThis.window = w;
  // Traquer les timers pour que le runner puisse sortir proprement.
  const oi = globalThis.setInterval, ot = globalThis.setTimeout;
  globalThis.setInterval = (fn,ms,...a) => { const h=oi(fn,ms,...a); handles.add(h); return h; };
  globalThis.setTimeout  = (fn,ms,...a) => { const h=ot(fn,ms,...a); handles.add(h); return h; };
  globalThis.__restoreTimers = () => { globalThis.setInterval=oi; globalThis.setTimeout=ot; };
  // IMPORTANT : même URL que les modules → même singleton d'état.
  ({ store: sharedStore } = await import('../regie/core.js'));
  await sharedStore.init({ role:'regie', id:'test-ui' });
});
after(() => {
  globalThis.fetch = realFetch;
  for (const h of handles) { try { clearInterval(h); clearTimeout(h); } catch {} }
  globalThis.__restoreTimers?.();
  try { child?.kill('SIGTERM'); } catch {}
  try { fs.rmSync(TMP,{recursive:true,force:true}); } catch {}
});

const main = () => document.getElementById('main');
const $ = (s,r=document) => r.querySelector(s);
const $$ = (s,r=document) => [...r.querySelectorAll(s)];

async function mountModule(name) {
  const mod = await import(`../regie/${name}.js?t=${Date.now()}`);
  main().innerHTML = '';
  const api = await mod.mount(main());
  return { mod, api };
}

describe('Montage réel des modules de la régie', () => {
  test('Bible — onglet, recherche, versets, éditeur riche, envoi', async () => {
    const { mod, api } = await mountModule('bible');
    assert.ok($('#bib-sub'));
    assert.ok($('#b-book'));
    assert.ok($('#b-grid .vbtn'), 'grille de versets rendue');
    assert.ok($('#b-editor-host .editor'), 'éditeur enrichi présent');
    // saisie « es 8 9 » → le champ livre doit proposer Esther
    const book = $('#b-book'); book.value = 'es'; book.dispatchEvent(new window.Event('input'));
    const sug = $('#b-sug');
    assert.ok(sug && !sug.classList.contains('hidden'));
    assert.ok(sug.textContent.includes('Esther'));
    // Entrée sélectionne le livre et place le focus sur le chapitre
    book.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    const store = sharedStore;
    assert.equal(store.state.bible.book,'Esther');
    assert.equal(document.activeElement?.id,'b-chap','Entrée place directement le curseur sur le chapitre');
    // application chapitre/verset
    $('#b-chap').value='8'; $('#b-verse').value='9'; $('#b-go').click();
    assert.equal(store.state.bible.chapter,8); assert.equal(store.state.bible.verse,9);
    // Esther 8:9 doit être découpé en 4 sections
    assert.equal(store.state.bible.parts.length,4);
    assert.equal($$('#b-parts .partbtn').length,4);
    // envoi vers OBS
    $('#b-send-p').click();
    await new Promise(r => setTimeout(r, 30));   // send() est async (résolution des versions)
    assert.equal(store.state.live.tool,'bible');
    assert.ok(store.state.live.fullscreen?.vars.content.length > 100);
    assert.ok(store.state.live.fullscreen.designId==='bible:plein');
    // flèche suivante → on avance d'abord une SECTION, le plein ne bouge pas
    const before = JSON.stringify(store.state.live.fullscreen.vars);
    api.onKey('next');
    assert.equal(store.state.bible.partIndex,1);
    assert.equal(JSON.stringify(store.state.live.fullscreen.vars),before,'le plein écran doit rester figé');
    // après la dernière section, les deux avancent ensemble
    api.onKey('next'); api.onKey('next'); api.onKey('next');
    await new Promise(r => setTimeout(r, 40));
    assert.equal(store.state.bible.verse,10);
    assert.equal(store.state.bible.partIndex,0);
  });

  test('Bible — sous-onglets recherche / versions / réglages', async () => {
    const { } = await mountModule('bible');
    for (const [s,marker] of [['recherche','#b-q'],['versions','#v-list'],['reglages','#r-demo']]) {
      $(`#bib-sub [data-s="${s}"]`).click();
      assert.ok($(marker), 'sous-onglet '+s);
    }
    // le réglage de longueur modifie le nombre de sections
    const r = $('#r-max'); r.value='100'; r.dispatchEvent(new window.Event('input',{bubbles:true}));
    const store = sharedStore;
    assert.equal(store.state.bible.splitMaxChars,100);
  });

  test('Chants — bibliothèque, éditeur, structure, projection', async () => {
    const { api } = await mountModule('chants');
    assert.ok($('#ch-q')); assert.ok($('#ch-list .list-item'), 'chant de démo présent');
    $(`#ch-sub [data-s="editeur"]`).click();
    assert.ok($('#e-text')); assert.ok($('#e-sections'), 'structure analysée');
    assert.ok($('#e-rich .editor'), 'mise en forme par écran');
    // 1 retour = même partie, 2 retours = nouvelle : vérifier l'analyse affichée
    const ta = $('#e-text'); ta.value = 'Ligne A\nLigne B\n\nLigne C';
    ta.dispatchEvent(new window.Event('input',{bubbles:true}));
    assert.ok($('#e-sections').textContent.includes('Partie'));
    $(`#ch-sub [data-s="projection"]`).click();
    assert.ok($('#p-slides .list-item'), 'écrans de chant générés');
    $('#p-send').click();
    const store = sharedStore;
    assert.equal(store.state.live.tool,'chants');
    assert.ok(store.state.live.fullscreen.designId==='chants:plein');
    const n = store.state.live.fullscreen.key;
    api.onKey('next');
    assert.notEqual(store.state.live.fullscreen.key,n,'la flèche avance l’écran');
    $(`#ch-sub [data-s="fond"]`).click();
    assert.ok($('#f-kind'), 'contrôles de fond');
  });

  test('Médias — médiathèque, 1er clic aperçu / 2ᵉ clic envoi, contrôles', async () => {
    const { api } = await mountModule('medias');
    assert.ok($('#m-list')); assert.ok($('#m-player'));
    // ajouter un média via upload simulé
    const store = sharedStore;
    await fetch('/api/upload',{method:'POST',headers:{'x-fs-folder':'medias','x-fs-name':'ui-test.mp4','Content-Type':'application/octet-stream'},body:Buffer.alloc(512,1)});
    await mountModule('medias');
    const item = $('#m-list .media-item[data-id="f:ui-test.mp4"]');
    assert.ok(item,'média listé');
    item.click();  // 1er clic = aperçu
    assert.ok($('#m-list .media-item.previewing'), 'aperçu actif après 1 clic');
    assert.equal(store.state.live.tool !== 'medias', true, 'rien envoyé au 1er clic');
    $('#m-list .media-item.previewing').click();  // 2ᵉ clic = envoi
    assert.equal(store.state.live.tool,'medias');
    assert.ok(store.state.live.fullscreen.media.src.includes('ui-test.mp4'));
    assert.ok($('#c-play'),'contrôles vidéo');
    assert.ok($('#m-seek'),'barre de recherche dans la vidéo');
    await fetch('/api/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({folder:'medias',name:'ui-test.mp4'})});
  });

  test('Lowerthirds — CRUD, durée, transitions, diffusion', async () => {
    const { api } = await mountModule('lowerthird');
    assert.ok($('#lt-list .lt-row'),'lowerthird de démo');
    $(`#lt-sub [data-s="editeur"]`).click();
    assert.ok($('#l-title .editor')); assert.ok($('#l-sub .editor'));
    assert.ok($('#l-dur')); assert.ok($('#l-tin')); assert.ok($('#l-tout'));
    $('#l-name').value='Annonce test';
    const store = sharedStore;
    $('#l-send').click();
    await new Promise(r => setTimeout(r, 30));   // save() puis envoi
    assert.ok(store.state.live.lowerthird);
    assert.ok(store.state.live.lowerthird.duration >= 0);
    assert.equal(store.state.live.lowerthird.target,'bas');
    $(`#lt-sub [data-s="diffusion"]`).click();
    assert.ok($('#x-cut'));
    $('#x-cut').click();
    assert.equal(store.state.live.lowerthird.cut,true);
  });

  test('Designs — calques, glisser, propriétés, copie vers bas centré', async () => {
    const { api } = await mountModule('designs');
    assert.ok($('#designer')); assert.ok($('#d-layers .layer-row'));
    assert.ok($$('#d-key option').length >= 8,'tous les designs sélectionnables');
    const nb = $$('#d-layers .layer-row').length;
    $('#d-add-text').click();
    assert.equal($$('#d-layers .layer-row').length, nb+1);
    // édition de la police du calque sélectionné
    const fs2 = $('[data-p="fontSize"]'); assert.ok(fs2);
    fs2.value='480'; fs2.dispatchEvent(new window.Event('input',{bubbles:true}));
    const store = sharedStore;
    const d = store.state.designs['bible:plein'];
    assert.ok(d.layers.some(l=>l.style?.fontSize===480));
    $('#d-copybas').click();
    assert.ok(store.state.designs['bible:bas'],'copie vers bas centré');
    assert.ok($('#d-overflow'),'indicateur de débordement');
  });

  test('Sorties — 12 liens + création d\'une sortie personnalisée portrait', async () => {
    const { api } = await mountModule('outputs');
    assert.ok($$('#o-list .out-row').length >= 12);
    const store = sharedStore;
    const before = store.state.outputs.length;
    // simulation directe du même chemin que le formulaire
    const id = 'out-test-'+Date.now();
    const o = { id,name:'Portrait test',type:'custom',tool:'*',w:2160,h:3840,path:`/outputs/custom.html?id=${id}`,custom:true,enabled:true,base:'bible:plein' };
    const src = store.state.designs['bible:plein'];
    const s = structuredClone(src); const sx=2160/7680, sy=3840/4320, k=Math.min(sx,sy);
    s.canvas={w:2160,h:3840}; s.id='out:'+id;
    for(const l of s.layers||[]) if(l.box) l.box={x:Math.round(l.box.x*sx),y:Math.round(l.box.y*sy),w:Math.round(l.box.w*sx),h:Math.round(l.box.h*sy)};
    for(const l of s.layers||[]) if(l.style?.fontSize) l.style.fontSize=Math.round(l.style.fontSize*k);
    store.patch({ outputs:[...store.state.outputs,o], designs:{['out:'+id]:s} });
    assert.equal(store.state.outputs.length,before+1);
    assert.deepEqual(store.state.designs['out:'+id].canvas,{w:2160,h:3840});
    assert.ok(store.state.outputs.find(x=>x.id===id).path.includes('id='+id));
  });

  test('Orateur — message, durée 15 s, coupure', async () => {
    const { api } = await mountModule('orateur');
    assert.ok($('#or-ed .editor')); assert.ok($('#or-dur')); assert.ok($('#or-pip'));
    const store = sharedStore;
    $('.area',$('#or-ed')).innerHTML='Vous avez cinq minutes';
    $('#or-send').click();
    assert.ok(store.state.orateur.message);
    assert.equal(store.state.orateur.cut,false);
    assert.equal(store.state.orateur.durationMs,15000);
    $('#or-cut').click();
    assert.equal(store.state.orateur.cut,true);
  });

  test('Raccourcis clavier — mapping complet et cohérent', async () => {
    const { SHORTCUTS } = await import('../core/config.js');
    for (const k of ['ArrowRight','ArrowLeft',' ','Enter','Escape','1','2','3','4','f','s','b','m'])
      assert.ok(SHORTCUTS[k], 'raccourci '+k);
  });
});
