// FREESTREAM — état initial, sorties et modèles de design de base.
// TOUT est éditable : ces objets ne sont que des valeurs par défaut, recopiées
// dans donnees/designs/ au premier lancement.

import { CANVAS_8K, FONT_STACK } from './config.js';

export const W = CANVAS_8K.w;   // 7680
export const H = CANVAS_8K.h;   // 4320

let _uid = 0;
export const uid = (p = 'id') => `${p}-${Date.now().toString(36)}-${(++_uid).toString(36)}`;

/* ------------------------------------------------------------------ styles */
export function textStyle(o = {}) {
  return {
    fontFamily: FONT_STACK,
    fontSize: 220,
    minFontSize: 48,
    fontWeight: 700,
    fontStyle: 'normal',
    color: '#FFFFFF',
    opacity: 1,
    align: 'left',
    valign: 'middle',
    lineHeight: 1.14,
    letterSpacing: 0,
    wordSpacing: 0,
    textTransform: 'none',           // none | uppercase | lowercase | capitalize
    textDecoration: 'none',          // none | underline | line-through | overline
    highlight: null,                 // couleur de surlignage (fond de mot)
    shadow: '0 0.02em 0.12em rgba(0,0,0,.85)',
    strokeColor: null,
    strokeWidth: 0,
    padding: 24,
    bgColor: null,
    bgOpacity: 0,
    borderRadius: 0,
    autoFit: true,
    textIndent: 0,
    direction: 'ltr',
    whiteSpace: 'normal',
    ...o,
  };
}

export function textLayer(role, box, style, template, extra = {}) {
  return { id: uid('txt'), type: 'text', role, box, style: textStyle(style), template, visible: true, locked: false, ...extra };
}
function shapeLayer(box, fill = 'rgba(0,0,0,.45)', radius = 40, extra = {}) {
  return { id: uid('shp'), type: 'shape', box, fill, radius, border: null, opacity: 1, visible: true, ...extra };
}
function imageLayer(box, src = null, extra = {}) {
  return { id: uid('img'), type: 'image', box, src, fit: 'cover', opacity: 1, visible: true, ...extra };
}
function overlayLayer(color = 'rgba(0,0,0,.35)', extra = {}) {
  return { id: uid('ovl'), type: 'overlay', box: { x: 0, y: 0, w: W, h: H }, color, opacity: 1, visible: true, ...extra };
}
function mediaLayer(extra = {}) {
  return { id: uid('med'), type: 'media', box: { x: 0, y: 0, w: W, h: H }, fit: 'contain',
    vignette: true, vignetteBlur: 64, vignetteDim: 0.42, visible: true, ...extra };
}

export function background(o = {}) {
  return {
    kind: 'transparent',   // transparent | color | image | video  (vide = transparent pour la caméra)
    color: '#000000',
    src: null,
    fit: 'cover',
    blur: 0,
    brightness: 1,
    saturate: 1,
    opacity: 1,
    muted: true,
    loop: true,
    ...o,
  };
}

/* ------------------------------------------------------------------ designs */
function biblePlein() {
  return {
    id: 'bible:plein', name: 'Bible — Plein écran', tool: 'bible', type: 'plein',
    canvas: { w: W, h: H },
    background: background(),
    transition: { type: 'fade', duration: 320 },
    layers: [
      shapeLayer({ x: 420, y: 520, w: 6840, h: 3280 }, 'rgba(6,10,20,.42)', 64),
      textLayer('reference', { x: 620, y: 700, w: 6440, h: 320 },
        { fontSize: 168, fontWeight: 700, color: '#FFD479', textTransform: 'uppercase', align: 'left', valign: 'middle' },
        '{{reference}}'),
      textLayer('content', { x: 620, y: 1120, w: 6440, h: 2380 },
        { fontSize: 300, fontWeight: 700, color: '#FFFFFF', align: 'left', valign: 'middle', lineHeight: 1.16 },
        '{{content}}'),
      textLayer('version', { x: 620, y: 3520, w: 6440, h: 180 },
        { fontSize: 112, fontWeight: 600, color: '#B9C6DA', align: 'right', valign: 'middle', shadow: 'none' },
        '{{version}}'),
    ],
  };
}

function bibleBas() {
  return {
    id: 'bible:bas', name: 'Bible — Bas centré', tool: 'bible', type: 'bas',
    canvas: { w: W, h: H },
    background: background(),
    transition: { type: 'slide-up', duration: 280 },
    layers: [
      shapeLayer({ x: 520, y: 3140, w: 6640, h: 940 }, 'rgba(6,10,20,.62)', 40),
      textLayer('reference', { x: 660, y: 3200, w: 6360, h: 200 },
        { fontSize: 132, fontWeight: 700, color: '#FFD479', textTransform: 'uppercase', align: 'center', valign: 'middle' },
        '{{reference}}'),
      textLayer('content', { x: 660, y: 3420, w: 6360, h: 600 },
        { fontSize: 186, fontWeight: 700, color: '#FFFFFF', align: 'center', valign: 'middle', lineHeight: 1.14, minFontSize: 120 },
        '{{content}}'),
    ],
  };
}

function chantsPlein() {
  return {
    id: 'chants:plein', name: 'Chants — Plein écran', tool: 'chants', type: 'plein',
    canvas: { w: W, h: H },
    background: background({ kind: 'color', color: '#05070d' }),
    transition: { type: 'crossfade', duration: 300 },
    layers: [
      overlayLayer('rgba(0,0,0,.38)'),                 // voile de lisibilité sur vidéo de fond
      textLayer('title', { x: 620, y: 300, w: 6440, h: 240 },
        { fontSize: 140, fontWeight: 600, color: '#FFD479', align: 'center', textTransform: 'uppercase' },
        '{{title}}'),
      textLayer('content', { x: 520, y: 700, w: 6640, h: 2920 },
        // PLANCHER de taille : même saisi en petit, un chant sort en GRAND.
        { fontSize: 340, minFontSize: 260, fontWeight: 800, color: '#FFFFFF', align: 'center', valign: 'middle', lineHeight: 1.20 },
        '{{content}}'),
      textLayer('section', { x: 620, y: 3760, w: 6440, h: 170 },
        { fontSize: 96, fontWeight: 600, color: '#93A4BD', align: 'center', shadow: 'none' },
        '{{section}}'),
    ],
  };
}

function chantsBas() {
  return {
    id: 'chants:bas', name: 'Chants — Bas centré', tool: 'chants', type: 'bas',
    canvas: { w: W, h: H },
    background: background(),
    transition: { type: 'slide-up', duration: 260 },
    layers: [
      shapeLayer({ x: 420, y: 3260, w: 6840, h: 800 }, 'rgba(6,10,20,.66)', 36),
      textLayer('content', { x: 600, y: 3340, w: 6480, h: 640 },
        { fontSize: 214, minFontSize: 176, fontWeight: 800, color: '#FFFFFF', align: 'center', valign: 'middle', lineHeight: 1.16 },
        '{{content}}'),
    ],
  };
}

function chantsCoeur() {
  return {
    id: 'chants:coeur', name: 'Chants — Cœur (section suivante en bas)', tool: 'chants', type: 'coeur',
    canvas: { w: W, h: H },
    background: background({ kind: 'color', color: '#05070d' }),
    transition: { type: 'slide-up', duration: 280 },
    layers: [
      overlayLayer('rgba(0,0,0,.34)'),
      textLayer('title', { x: 620, y: 210, w: 6440, h: 210 },
        { fontSize: 132, fontWeight: 600, color: '#FFD479', align: 'center', textTransform: 'uppercase' },
        '{{title}}'),
      textLayer('content', { x: 460, y: 520, w: 6760, h: 2620 },
        // GRANDS CARACTÈRES garantis, comme pour les autres sorties de chants.
        { fontSize: 360, minFontSize: 270, fontWeight: 800, color: '#FFFFFF', align: 'center', valign: 'middle', lineHeight: 1.20 },
        '{{content}}'),
      shapeLayer({ x: 400, y: 3280, w: 6880, h: 940 }, 'rgba(8,14,28,.82)', 52),
      textLayer('nextLabel', { x: 660, y: 3340, w: 6360, h: 130 },
        { fontSize: 88, fontWeight: 800, color: '#FFD479', align: 'left', letterSpacing: 3, textTransform: 'uppercase' },
        '{{nextLabel}}'),
      textLayer('next', { x: 660, y: 3500, w: 6360, h: 660 },
        { fontSize: 196, minFontSize: 130, fontWeight: 600, color: '#CBD8EC', align: 'left', valign: 'middle', lineHeight: 1.18 },
        '{{next}}'),
    ],
  };
}

function mediasPlein() {
  return {
    id: 'medias:plein', name: 'Médias — Plein écran', tool: 'medias', type: 'plein',
    canvas: { w: W, h: H },
    background: background({ kind: 'color', color: '#000000' }),
    transition: { type: 'fade', duration: 200 },
    // Le vignettage comble TOUT l'écran quand l'image/vidéo n'est pas en 16:9 :
    // plus jamais de bandes noires. Le média réel reste intact au premier plan.
    layers: [ mediaLayer({ fit: 'contain', vignette: true, vignetteBlur: 64 }) ],
  };
}

function mediasBas() {
  return {
    id: 'medias:bas', name: 'Médias — Bas centré', tool: 'medias', type: 'bas',
    canvas: { w: W, h: H },
    background: background(),
    transition: { type: 'slide-up', duration: 250 },
    layers: [
      shapeLayer({ x: 1500, y: 3620, w: 4680, h: 400 }, 'rgba(6,10,20,.72)', 28),
      textLayer('title', { x: 1600, y: 3660, w: 4480, h: 320 },
        { fontSize: 150, fontWeight: 700, color: '#FFFFFF', align: 'center' },
        '{{title}}'),
    ],
  };
}

function lowerthirdBas() {
  return {
    id: 'lowerthird:bas', name: 'Lowerthird — Bas centré', tool: 'lowerthird', type: 'bas',
    canvas: { w: W, h: H },
    background: background(),
    transition: { type: 'slide-left', duration: 380 },
    layers: [
      imageLayer({ x: 900, y: 3180, w: 5880, h: 760 }, null),   // visuel Photoshop importé
      textLayer('title', { x: 1080, y: 3260, w: 5520, h: 300 },
        { fontSize: 196, fontWeight: 800, color: '#FFFFFF', align: 'left', textTransform: 'uppercase' },
        '{{title}}'),
      textLayer('subtitle', { x: 1080, y: 3580, w: 5520, h: 220 },
        { fontSize: 128, fontWeight: 500, color: '#DCE6F5', align: 'left', shadow: 'none' },
        '{{subtitle}}'),
    ],
  };
}

function lowerthirdPlein() {
  return {
    id: 'lowerthird:plein', name: 'Lowerthird — Plein écran', tool: 'lowerthird', type: 'plein',
    canvas: { w: W, h: H },
    background: background(),
    transition: { type: 'fade', duration: 300 },
    layers: [
      textLayer('title', { x: 700, y: 1500, w: 6280, h: 500 },
        { fontSize: 320, fontWeight: 800, color: '#FFFFFF', align: 'center' }, '{{title}}'),
      textLayer('subtitle', { x: 700, y: 2080, w: 6280, h: 340 },
        { fontSize: 190, fontWeight: 500, color: '#DCE6F5', align: 'center' }, '{{subtitle}}'),
    ],
  };
}

export function defaultDesigns() {
  const list = [biblePlein(), bibleBas(), chantsPlein(), chantsBas(), chantsCoeur(), mediasPlein(), mediasBas(), lowerthirdPlein(), lowerthirdBas()];
  const out = {};
  for (const d of list) out[d.id] = d;
  return out;
}

/* ------------------------------------------------------------------ sorties */
export function defaultOutputs() {
  const base = [
    { id: 'plein',      name: 'PLEIN ÉCRAN (universel)',  type: 'plein', tool: '*',      w: W, h: H, path: '/outputs/plein.html' },
    { id: 'bas',        name: 'BAS CENTRÉ (universel)',   type: 'bas',   tool: '*',      w: W, h: H, path: '/outputs/bas.html' },
    { id: 'coeur',      name: 'CŒUR — chants + section suivante', type: 'coeur', tool: 'chants', w: W, h: H, path: '/outputs/coeur.html' },
  ];
  for (const t of ['bible', 'chants', 'medias', 'lowerthird']) {
    base.push({ id: `plein-${t}`, name: `${t} — plein écran`, type: 'plein', tool: t, w: W, h: H, path: `/outputs/plein.html?tool=${t}` });
    base.push({ id: `bas-${t}`,   name: `${t} — bas centré`,  type: 'bas',   tool: t, w: W, h: H, path: `/outputs/bas.html?tool=${t}` });
  }
  base.push({ id: 'orateur',  name: 'Vue ORATEUR (confidence)', type: 'special', tool: '*', w: W, h: H, path: '/outputs/orateur.html' });
  base.push({ id: 'minuteur', name: 'Vue MINUTEUR',              type: 'special', tool: '*', w: W, h: H, path: '/outputs/minuteur.html' });
  return base.map(o => ({ ...o, custom: false, enabled: true }));
}

/* ------------------------------------------------------------------ état */
export function defaultState() {
  return {
    rev: 1,
    updatedAt: Date.now(),
    live: {
      tool: null,            // 'bible' | 'chants' | 'medias'  (lowerthird = calque indépendant)
      fullscreen: null,      // { designId, vars, tool }
      lower: null,           // { designId, vars, tool }
      lowerthird: null,      // { id, designId, vars, startedAt, duration, transition }
      blackout: false,
      history: [],
    },
    bible: {
      version: 'ls1910',
      versions: ['ls1910'],        // jusqu'à 3 versions superposées
      book: 'Jean', chapter: 3, verse: 16,
      splitMode: true,
      parts: [], partIndex: 0,
      splitMaxChars: 150,
      mirrorToPlein: false,        // bouton « afficher la même chose en bas centré qu'en plein écran »
      overrides: {},               // { 'ls1910|Jean 3:16': { html, lines } }
      favorites: [],
      history: [],
      searchMode: 'reference',     // reference | keywords | paraphrase
    },
    chants: {
      currentId: null, sectionIndex: 0, chunkIndex: 0,
      linesPerChunk: 4,           // garde les caractères GROS
      forceLarge: true,
    },
    medias: {
      previewId: null, activeId: null,
      playing: true, time: 0, muted: false, volume: 1, loop: false,
      slide: 0, slideCount: 0,
    },
    orateur: {
      message: null,              // { html, from }
      startedAt: 0,
      durationMs: 15000,
      cut: false,
      showPip: true,             // contenu plein écran réduit dans un coin pendant un message
    },
    minuteur: {
      items: [],                  // { id, title, durationMs, note }
      index: -1,
      running: false,
      startedAt: 0,              // horodatage absolu → le décompte survit au rafraîchissement
      baseMs: 0,                 // durée de référence au lancement
      offsetMs: 0,               // ajouts/retraits en live
      visible: false,
    },
    outputs: defaultOutputs(),
    designs: defaultDesigns(),
    presence: {},
    settings: {
      language: 'fr', autosave: true,
      sseRetryMs: 800,
      videoHardware: true,
      shortcuts: {},             // surcharges utilisateur
    },
  };
}

export function mergeState(base, patch) {
  for (const [k, v] of Object.entries(patch || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      mergeState(base[k], v);
    } else base[k] = v;
  }
  return base;
}

/**
 * MIGRATION — un ancien state.json (ou un serveur de repli minimal) ne doit
 * JAMAIS faire disparaître les sorties et les designs ajoutés par une mise à
 * jour. mergeState remplace les tableaux : sans cette étape, un utilisateur qui
 * met à jour FREESTREAM ne verrait pas la nouvelle sortie « Cœur ».
 *
 * Les sorties/designs DÉJÀ présents (modifiés par l'utilisateur) sont gardés
 * tels quels ; seuls les éléments manquants sont ajoutés.
 */
export function ensureDefaults(state) {
  if (!state || typeof state !== 'object') return state;
  const defs = defaultOutputs();
  const current = Array.isArray(state.outputs) ? state.outputs : [];
  const byId = new Map(current.map(o => [o?.id, o]));
  state.outputs = [
    ...defs.map(d => byId.get(d.id) || d),
    ...current.filter(o => o && !defs.some(d => d.id === o.id)),   // sorties personnalisées conservées
  ];
  state.designs = state.designs && typeof state.designs === 'object' ? state.designs : {};
  for (const [k, v] of Object.entries(defaultDesigns())) {
    if (!state.designs[k]) state.designs[k] = v;
  }
  state.live = state.live && typeof state.live === 'object' ? state.live : {};
  if (!('coeur' in state.live)) state.live.coeur = null;
  return state;
}
