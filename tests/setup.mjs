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
