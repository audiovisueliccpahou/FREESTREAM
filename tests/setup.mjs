// Environnement DOM minimal pour tester le moteur de rendu sans navigateur.
import { JSDOM } from 'jsdom';

export function makeDom(html = '<!doctype html><html><body><div id="root"></div><div id="overlay"></div></body></html>') {
  const dom = new JSDOM(html, { url: 'http://localhost:8787/', pretendToBeVisual: true });
  const w = dom.window;
  w.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
  w.HTMLCanvasElement.prototype.getContext = () => null;      // force le mesureur déterministe
  w.HTMLMediaElement.prototype.play = function(){ return Promise.resolve(); };
  w.HTMLMediaElement.prototype.pause = function(){};
  w.HTMLElement.prototype.animate = function(){ return { finished: Promise.resolve(), cancel(){} }; };
  w.matchMedia = w.matchMedia || (() => ({ matches:false, addListener(){}, removeListener(){} }));
  Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get(){ return 1920; }, configurable:true });
  Object.defineProperty(w.HTMLElement.prototype, 'clientHeight', { get(){ return 1080; }, configurable:true });
  globalThis.window = w;
  globalThis.document = w.document;
  globalThis.DOMParser = w.DOMParser;
  globalThis.Node = w.Node;
  globalThis.HTMLElement = w.HTMLElement;
  globalThis.ResizeObserver = w.ResizeObserver;
  try { Object.defineProperty(globalThis, 'navigator', { value:w.navigator, configurable:true }); } catch { }
  globalThis.location = w.location;
  globalThis.BroadcastChannel = undefined;
  globalThis.indexedDB = undefined;
  return dom;
}

export function clearGlobals() {
  for (const k of ['window','document','DOMParser','Node','HTMLElement','ResizeObserver','navigator','location']) delete globalThis[k];
}

/**
 * Prépare un dossier de DONNÉES temporaire pour un serveur de test.
 * Les démos du projet y sont copiées (pour que les tests trouvent ls1910.json,
 * etc.), mais toutes les ÉCRITURES restent dans ce dossier temporaire :
 * le projet livré n'est jamais pollué par un test.
 */
import fs from 'node:fs';
import path from 'node:path';
export function prepareTestData(tmp, root = process.cwd()) {
  const src = path.join(root, 'donnees');
  const dst = path.join(tmp, 'donnees');
  fs.mkdirSync(dst, { recursive: true });
  if (fs.existsSync(src)) fs.cpSync(src, dst, { recursive: true, force: true });
  // Les fichiers d'état sont gérés séparément par FREESTREAM_STATE_FILE.
  for (const f of ['state.json', 'live.js']) {
    try { fs.rmSync(path.join(dst, 'etat', f), { force: true }); } catch { }
  }
  for (const d of ['bibles','chants','lowerthirds','medias','projets','designs','polices','etat']) {
    fs.mkdirSync(path.join(dst, d), { recursive: true });
  }
  return tmp;
}
