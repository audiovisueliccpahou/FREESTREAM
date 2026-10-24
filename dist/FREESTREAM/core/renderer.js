/**
 * MOTEUR DE RENDU UNIQUE — utilisé à la fois par :
 *   - les aperçus de la régie (iframes réelles, pas des maquettes)
 *   - les sorties OBS (plein écran, bas centré, personnalisées, orateur, minuteur)
 *
 * Il n'existe donc AUCUN autre calcul de mise en page : ce que l'éditeur affiche
 * est exactement, au pixel près, ce qu'OBS diffuse.
 */
import { fitFontSize, measureLine, wrapText } from './measure.js';
import { sanitizeHtml, toPlainText } from './sanitize.js';
import { FONT_STACK, mediaKind } from './config.js';
import { normalizeMediaUrl, ytPlay, ytPause, ytSeek, ytMute, ytUnMute, ytVolume } from './media.js';

export const TRANSITIONS = Object.freeze({
  'none':       { inKF: [], outKF: [] },
  'fade':       { inKF: [{ opacity: 0 }, { opacity: 1 }], outKF: [{ opacity: 1 }, { opacity: 0 }] },
  'crossfade':  { inKF: [{ opacity: 0, filter: 'blur(18px)' }, { opacity: 1, filter: 'blur(0)' }], outKF: [{ opacity: 1 }, { opacity: 0 }] },
  'slide-up':   { inKF: [{ opacity: 0, transform: 'translateY(6%)' }, { opacity: 1, transform: 'translateY(0)' }], outKF: [{ opacity: 1 }, { opacity: 0, transform: 'translateY(-4%)' }] },
  'slide-left': { inKF: [{ opacity: 0, transform: 'translateX(8%)' }, { opacity: 1, transform: 'translateX(0)' }], outKF: [{ opacity: 1 }, { opacity: 0, transform: 'translateX(-6%)' }] },
  'zoom':       { inKF: [{ opacity: 0, transform: 'scale(.92)' }, { opacity: 1, transform: 'scale(1)' }], outKF: [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.06)' }] },
  'wipe':       { inKF: [{ opacity: 0, clipPath: 'inset(0 100% 0 0)' }, { opacity: 1, clipPath: 'inset(0 0 0 0)' }], outKF: [{ opacity: 1 }, { opacity: 0 }] },
  'typewriter': { inKF: [{ opacity: .2 }, { opacity: 1 }], outKF: [{ opacity: 1 }, { opacity: 0 }] },
});
export const TRANSITION_LABELS = Object.freeze({
  'none':'Aucune', 'fade':'Fondu', 'crossfade':'Fondu enchaîné', 'slide-up':'Glisser vers le haut',
  'slide-left':'Glisser depuis la droite', 'zoom':'Zoom', 'wipe':'Balayage', 'typewriter':'Machine à écrire',
});

const px = n => `${Number(n) || 0}px`;

function resolveTemplate(tpl, vars) {
  return String(tpl ?? '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const v = vars?.[key];
    return v == null ? '' : String(v);
  });
}

function styleToCss(s, sizeOverride) {
  const size = sizeOverride ?? s.fontSize;
  return {
    fontFamily: s.fontFamily || FONT_STACK,
    fontSize: px(size),
    fontWeight: String(s.fontWeight ?? 700),
    fontStyle: s.fontStyle || 'normal',
    color: s.color || '#fff',
    opacity: String(s.opacity ?? 1),
    textAlign: s.align || 'left',
    lineHeight: String(s.lineHeight ?? 1.14),
    letterSpacing: px(s.letterSpacing || 0),
    wordSpacing: px(s.wordSpacing || 0),
    textTransform: s.textTransform || 'none',
    textDecoration: s.textDecoration || 'none',
    textShadow: s.shadow && s.shadow !== 'none' ? s.shadow : 'none',
    padding: px(s.padding || 0),
    boxSizing: 'border-box',
    background: s.bgColor && s.bgOpacity > 0 ? hexA(s.bgColor, s.bgOpacity) : 'transparent',
    borderRadius: px(s.borderRadius || 0),
    direction: s.direction || 'ltr',
    whiteSpace: s.whiteSpace || 'normal',
    textIndent: px(s.textIndent || 0),
    justifyContent: s.align === 'center' ? 'center' : s.align === 'right' ? 'flex-end' : 'flex-start',
    alignItems: s.valign === 'top' ? 'flex-start' : s.valign === 'bottom' ? 'flex-end' : 'center',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    WebkitTextStroke: s.strokeColor && s.strokeWidth > 0 ? `${px(s.strokeWidth)} ${s.strokeColor}` : '',
  };
}
export function hexA(hex, a = 1) {
  const h = String(hex || '').replace('#', '');
  if (/^[0-9a-f]{3}$/i.test(h)) { const [r,g,b] = [...h].map(c=>parseInt(c+c,16)); return `rgba(${r},${g},${b},${a})`; }
  if (/^[0-9a-f]{6}$/i.test(h)) { const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16); return `rgba(${r},${g},${b},${a})`; }
  return String(hex);
}

function applyCss(el, obj) { for (const [k, v] of Object.entries(obj)) { if (v !== '' && v != null) el.style.setProperty(k.replace(/[A-Z]/g, m => '-' + m.toLowerCase()), String(v)); } }

export class Stage {
  /**
   * @param {HTMLElement} container  élément qui définit la taille réelle (viewport OBS ou iframe)
   * @param {object} opts { design, onOverflow }
   */
  constructor(container, opts = {}) {
    this.container = container;
    this.opts = opts;
    this.design = null;
    this.layerEls = new Map();
    this.vars = {};
    this._sig = '';
    this._ro = null;
    this._build();
    if (opts.design) this.setDesign(opts.design);
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this.layout());
      this._ro.observe(container);
    }
    if (typeof window !== 'undefined') window.addEventListener('resize', this._onResize = () => this.layout());
    this.layout();
  }

  _build() {
    const c = this.container;
    c.classList.add('fs-viewport');
    c.innerHTML = '';
    this.stage = document.createElement('div'); this.stage.className = 'fs-stage';
    this.bgEl = document.createElement('div'); this.bgEl.className = 'fs-bg';
    this.staticEl = document.createElement('div'); this.staticEl.className = 'fs-static';
    this.textEl = document.createElement('div'); this.textEl.className = 'fs-text';
    this.stage.append(this.bgEl, this.staticEl, this.textEl);
    c.appendChild(this.stage);
  }

  get canvas() { return this.design?.canvas || { w: 7680, h: 4320 }; }

  layout() {
    const { w, h } = this.canvas;
    const vw = this.container.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : w);
    const vh = this.container.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : h);
    const scale = Math.min(vw / w, vh / h);
    this.stage.style.width = px(w);
    this.stage.style.height = px(h);
    this.stage.style.transformOrigin = 'top left';
    this.stage.style.transform = `translate(${px((vw - w * scale) / 2)}, ${px((vh - h * scale) / 2)}) scale(${scale})`;
    this.scale = scale;
  }

  setDesign(design) {
    this.design = design || null;
    this.layerEls.clear();
    this._sig = '';
    this._renderBackground();
    this._renderStatic();
    this._renderText(true);
    this.layout();
    return this;
  }

  /* ---- FOND : construit une seule fois, ne bouge JAMAIS quand le texte change ---- */
  _renderBackground() {
    const bg = this.design?.background || { kind: 'transparent' };
    this.bgEl.innerHTML = '';
    this.bgEl.style.cssText = 'position:absolute;inset:0;overflow:hidden;';
    if (bg.kind === 'color') {
      this.bgEl.style.background = hexA(bg.color, bg.opacity ?? 1);
      return;
    }
    if (bg.kind === 'image' && bg.src) {
      const im = document.createElement('div');
      im.style.cssText = `position:absolute;inset:0;background-image:url("${cssUrl(bg.src)}");background-size:${bg.fit || 'cover'};background-position:center;background-repeat:no-repeat;opacity:${bg.opacity ?? 1};filter:blur(${px(bg.blur || 0)}) brightness(${bg.brightness ?? 1}) saturate(${bg.saturate ?? 1});`;
      this.bgEl.appendChild(im);
      return;
    }
    if (bg.kind === 'video' && bg.src) {
      const v = document.createElement('video');
      v.src = cssUrl(bg.src); v.muted = bg.muted !== false; v.loop = bg.loop !== false;
      v.autoplay = true; v.playsInline = true; v.setAttribute('playsinline', '');
      v.style.cssText = `position:absolute;inset:0;width:100%;height:100%;object-fit:${bg.fit || 'cover'};opacity:${bg.opacity ?? 1};filter:blur(${px(bg.blur || 0)}) brightness(${bg.brightness ?? 1}) saturate(${bg.saturate ?? 1});`;
      v.play?.().catch(() => {});
      this.bgEl.appendChild(v); this._bgVideo = v;
      return;
    }
    // vide = TRANSPARENT → la caméra d'OBS reste visible
    this.bgEl.style.background = 'transparent';
  }

  _renderStatic() {
    this.staticEl.innerHTML = '';
    for (const layer of this.design?.layers || []) {
      if (layer.visible === false) continue;
      if (layer.type === 'text') continue;
      const el = this._makeLayerEl(layer);
      this.staticEl.appendChild(el);
      this.layerEls.set(layer.id, el);
    }
  }

  _makeLayerEl(layer) {
    const b = layer.box || { x: 0, y: 0, w: 100, h: 100 };
    const el = document.createElement('div');
    el.dataset.layerId = layer.id; el.dataset.type = layer.type;
    el.style.cssText = `position:absolute;left:${px(b.x)};top:${px(b.y)};width:${px(b.w)};height:${px(b.h)};opacity:${layer.opacity ?? 1};`;
    if (layer.type === 'shape') {
      el.style.background = layer.fill || 'transparent';
      el.style.borderRadius = px(layer.radius || 0);
      if (layer.border) el.style.border = layer.border;
    } else if (layer.type === 'overlay') {
      el.style.background = layer.color || 'transparent';
    } else if (layer.type === 'image') {
      el.style.background = layer.src ? `url("${cssUrl(layer.src)}") center/${layer.fit || 'cover'} no-repeat` : 'transparent';
    } else if (layer.type === 'media') {
      el.style.display = 'flex'; el.style.alignItems = 'center'; el.style.justifyContent = 'center';
      el.style.background = 'transparent';
    }
    return el;
  }

  /** Met à jour UNIQUEMENT le texte + le média. Le fond et les calques restent intacts. */
  update(vars = {}, opts = {}) {
    this.vars = { ...this.vars, ...vars };
    this._renderText(false, opts);
    this._updateMedia(opts.media || {});
    return this;
  }

  /**
   * Remplissage maximal : le design peut porter `fill` (0 → 1). Les zones de
   * texte principales gagnent alors jusqu'à ~45 % de marge en moins, et
   * l'auto-ajustement agrandit la police d'autant. Calculé dans LE MOTEUR, donc
   * strictement identique en preview, dans l'éditeur et dans OBS.
   * Les zones d'annonce (next / section / footer) ne sont PAS agrandies, pour
   * ne jamais chevaucher le contenu principal.
   */
  _expandedBox(layer) {
    const b = layer.box || { x: 0, y: 0, w: 100, h: 100 };
    const f = Number(this.design?.fill) || 0;
    if (f <= 0) return b;
    if (['next', 'nextLabel', 'section', 'footer', 'version'].includes(layer.role)) return b;
    const { w: cw, h: ch } = this.canvas;
    const marginX = Math.max(0, Math.min(b.x, cw - (b.x + b.w)));
    const marginY = Math.max(0, Math.min(b.y, ch - (b.y + b.h)));
    const ex = marginX * 0.45 * Math.min(1, f);
    const ey = marginY * 0.45 * Math.min(1, f);
    return { x: b.x - ex, y: b.y - ey, w: b.w + 2 * ex, h: b.h + 2 * ey };
  }

  _renderText(force, opts = {}) {
    if (!this.design) { this.textEl.innerHTML = ''; return; }
    const layers = (this.design.layers || []).filter(l => l.type === 'text' && l.visible !== false);
    const sig = JSON.stringify(layers.map(l => [l.id, l.box, l.style, l.template]))
      + '|' + String(this.design.fill || 0) + '|' + JSON.stringify(this.vars);
    if (!force && sig === this._sig) return;
    const changed = force || this._sig !== sig;
    this._sig = sig;

    const frag = document.createDocumentFragment();
    const overflows = [];
    for (const layer of layers) {
      const el = document.createElement('div');
      const b = this._expandedBox(layer);
      el.className = 'fs-text-layer'; el.dataset.layerId = layer.id; el.dataset.role = layer.role;
      el.style.cssText = `position:absolute;left:${px(b.x)};top:${px(b.y)};width:${px(b.w)};height:${px(b.h)};opacity:${layer.style.opacity ?? 1};`;
      const raw = resolveTemplate(layer.template, this.vars);
      const safeHtml = sanitizeHtml(raw);
      const inner = document.createElement('div');
      inner.className = 'fs-text-inner';
      const plain = toPlainText(safeHtml);
      const st = layer.style;
      let size = st.fontSize;
      let over = false;
      if (st.autoFit !== false && plain.trim()) {
        const fitted = fitFontSize(plain, b.w, b.h, st);
        if (typeof fitted === 'object') { size = fitted.size; over = true; }
        else size = fitted;
      }
      applyCss(inner, styleToCss(st, size));
      inner.style.width = '100%'; inner.style.height = '100%';
      if (st.highlight) inner.style.setProperty('--fs-highlight', st.highlight);
      inner.innerHTML = safeHtml.replace(/<mark>/gi, `<mark style="background:${st.highlight || '#ffd479'};color:inherit">`);
      el.appendChild(inner);
      if (over) { el.dataset.overflow = '1'; overflows.push({ id: layer.id, role: layer.role, plain: plain.slice(0, 60) }); }
      frag.appendChild(el);
      this.layerEls.set(layer.id, el);
    }
    this.textEl.replaceChildren(frag);

    if (changed && opts.animate !== false) this._animateIn(opts.transition || this.design.transition);
    if (overflows.length) this.opts.onOverflow?.(overflows);
  }

  /**
   * animation EST UN BONUS, JAMAIS UNE CONDITION DE VISIBILITÉ.
   * Dans OBS une source navigateur peut être masquée/désactivée : le timeline Web
   * Animations ne tick plus (playState « running » mais currentTime = 0). Avec
   * fill:both, le texte resterait alors à opacity 0 — invisible à l'antenne.
   * On annule donc systématiquement l'animation après sa durée : l'état inline
   * (opacity: 1) reprend le dessus. Si l'animation tourne normalement, l'œil ne
   * voit aucune différence ; si elle gèle, le texte reste affiché quoi qu'il arrive.
   */
  _animateIn(tr) {
    const t = TRANSITIONS[tr?.type] || TRANSITIONS.fade;
    const dur = tr?.duration ?? 300;
    if (!dur || !t.inKF?.length || typeof this.textEl.animate !== 'function') return;
    for (const el of this.textEl.children) {
      try {
        el.style.opacity = el.style.opacity || '1';
        const a = el.animate(t.inKF, { duration: dur, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' });
        const release = () => { try { a.cancel(); } catch { } el.style.opacity = '1'; };
        const guard = setTimeout(release, dur + 150);
        a.finished?.then(() => { clearTimeout(guard); release(); }).catch(() => { clearTimeout(guard); release(); });
      } catch { el.style.opacity = '1'; }
    }
  }

  async animateOut(tr) {
    const t = TRANSITIONS[tr?.type] || TRANSITIONS.fade;
    const dur = tr?.duration ?? 300;
    if (!dur || !t.outKF?.length || typeof this.textEl.animate !== 'function') return;
    try {
      const anims = [...this.textEl.children].map(el => el.animate(t.outKF, { duration: dur, easing: 'ease-in', fill: 'forwards' }));
      // Filet de sécurité : même si le timeline est gelé, on force la disparition.
      const guard = new Promise(r => setTimeout(r, dur + 120));
      await Promise.race([Promise.all(anims.map(a => a.finished.catch(() => {}))), guard]);
      for (const a of anims) { try { a.cancel(); } catch { } }
      for (const el of this.textEl.children) el.style.opacity = '0';
    } catch { for (const el of this.textEl.children) el.style.opacity = '0'; }
  }

  clear() { this.vars = {}; this._renderText(true, { animate: false }); }

  /* ---- Média : image / vidéo / pdf / lien youtube ---- */
  _updateMedia(info = {}) {
    for (const layer of this.design?.layers || []) {
      if (layer.type !== 'media') continue;
      const el = this.layerEls.get(layer.id);
      if (!el) continue;
      const src = this.vars.mediaSrc || info.src || '';
      const kind = info.kind || mediaKind(src);
      const key = `${src}|${kind}`;
      if (el.dataset.mediaKey === key) {
        this._syncMediaControls(el, info);
        return;
      }
      el.dataset.mediaKey = key;
      el.innerHTML = '';
      el.style.background = 'transparent';
      if (!src) { el._fsVideoBack = null; return; }

      // « VIGNETTE INSPIRÉE » — quand l'image ou la vidéo n'est pas en 1920×1080,
      // on remplit TOUT le canevas avec une copie du média, très agrandie, floutée
      // et assombrie, puis un dégradé de vignette. Le média réel reste intact au
      // premier plan (object-fit: contain) : aucune bande noire, aucun recadrage.
      const wantVignette = layer.vignette !== false && (kind === 'image' || kind === 'video');
      const blur = Number(layer.vignetteBlur) || 120;
      // dim = 0 → aucune ombre ; dim = 1 → très sombre. Valeur par défaut 0.42.
      // On reste VOLONTAIREMENT lumineux : la vignette doit être une ambiance
      // colorée inspirée du média, pas un aplat noir. Le texte par-dessus reste
      // lisible grâce au voile de couleur du design, pas grâce au noir total.
      const dim = Number.isFinite(Number(layer.vignetteDim)) ? Math.max(0, Math.min(1, Number(layer.vignetteDim))) : 0.42;
      const bright = (1 - dim * 0.30).toFixed(3);
      const sat = (1.25 + dim * 0.45).toFixed(3);
      const c0 = (dim * 0.10).toFixed(3), c1 = (dim * 0.48).toFixed(3), c2 = Math.min(.72, dim * 0.95).toFixed(3);

      if (wantVignette) {
        if (kind === 'image') {
          const back = document.createElement('div');
          back.className = 'fs-media-vignette-bg';
          back.style.cssText = `position:absolute;inset:-10%;background:url("${cssUrl(src)}") center/cover no-repeat;` +
            `filter:blur(${blur}px) brightness(${bright}) saturate(${sat});transform:scale(1.14);`;
          el.appendChild(back);
        } else {
          const bv = document.createElement('video');
          bv.src = cssUrl(src); bv.muted = true; bv.playsInline = true;
          bv.setAttribute('playsinline', ''); bv.preload = 'auto'; bv.loop = true;
          bv.style.cssText = `position:absolute;inset:-10%;width:120%;height:120%;object-fit:cover;` +
            `filter:blur(${blur}px) brightness(${bright}) saturate(${sat});pointer-events:none;`;
          el.appendChild(bv); el._fsVideoBack = bv;
        }
        const shade = document.createElement('div');
        shade.className = 'fs-media-vignette';
        shade.style.cssText = 'position:absolute;inset:0;pointer-events:none;' +
          `background:radial-gradient(ellipse at center, rgba(0,0,0,${c0}) 0%,` +
          ` rgba(0,0,0,${c1}) 70%, rgba(0,0,0,${c2}) 100%);`;
        el.appendChild(shade);
      } else el._fsVideoBack = null;

      if (kind === 'image') {
        const front = document.createElement('div');
        front.className = 'fs-media-front';
        front.style.cssText = `position:absolute;inset:0;background:url("${cssUrl(src)}") center/${layer.fit || 'contain'} no-repeat;`;
        el.appendChild(front);
      } else if (kind === 'video') {
        const v = document.createElement('video');
        v.className = 'fs-media-main';
        v.src = cssUrl(src); v.playsInline = true; v.setAttribute('playsinline', '');
        v.style.cssText = `position:${wantVignette ? 'absolute' : 'relative'};inset:0;width:100%;height:100%;` +
          `object-fit:${layer.fit || 'contain'};background:transparent;`;
        v.preload = 'auto';
        el.appendChild(v); el._fsVideo = v;
      } else if (kind === 'audio') {
        const a = document.createElement('audio'); a.src = cssUrl(src); a.controls = false;
        el.appendChild(a); el._fsAudio = a;
        const box = document.createElement('div');
        box.textContent = '♫ ' + decodeURIComponent(String(src).split('/').pop());
        box.style.cssText = 'position:absolute;bottom:6%;left:50%;transform:translateX(-50%);font:600 130px sans-serif;color:#fff;text-shadow:0 4px 20px #000;';
        el.appendChild(box);
      } else if (kind === 'doc') {
        const f = document.createElement('iframe');
        f.src = cssUrl(src) + (info.slide ? `#page=${info.slide}&toolbar=0&navpanes=0` : '#toolbar=0&navpanes=0');
        f.style.cssText = 'width:100%;height:100%;border:0;background:#fff;';
        f.setAttribute('allow', 'autoplay; fullscreen');
        el.appendChild(f); el._fsFrame = f;
      } else if (kind === 'link') {
        const f = document.createElement('iframe');
        const n = normalizeMediaUrl(src);
        f.src = n.src; f.style.cssText = 'width:100%;height:100%;border:0;background:#000;';
        f.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen; accelerometer; gyroscope');
        f.setAttribute('allowfullscreen', '');
        el.appendChild(f); el._fsFrame = f; el._fsYt = n.youtube;
      }
      this._syncMediaControls(el, info);
    }
  }

  _syncMediaControls(el, info = {}) {
    // 1) Éléments <video> / <audio> natifs
    const v = el._fsVideo || el._fsAudio;
    if (v) {
      if (typeof info.currentTime === 'number' && Math.abs((v.currentTime || 0) - info.currentTime) > 0.6) {
        try { v.currentTime = info.currentTime; } catch { }
      }
      v.muted = !!info.muted;
      if (typeof info.volume === 'number') v.volume = Math.max(0, Math.min(1, info.volume));
      v.loop = !!info.loop;
      if (info.playing) v.play?.().catch(() => {}); else v.pause?.();
    }
    // La copie floutée suit EXACTEMENT la vidéo principale (muette, en boucle),
    // sinon la vignette se figerait sur la première image.
    const bv = el._fsVideoBack;
    if (bv && v) {
      try {
        if (v.readyState >= 1 && Math.abs((bv.currentTime || 0) - (v.currentTime || 0)) > 0.35) bv.currentTime = v.currentTime;
        bv.muted = true;
        if (info.playing) bv.play?.().catch(() => {}); else bv.pause?.();
      } catch { }
    }
    // 2) Iframes PDF / documents — navigation page par page
    if (el._fsFrame && !el._fsYt && typeof info.slide === 'number' && info.slide > 0) {
      const base = el._fsFrame.src.split('#')[0];
      const next = `${base}#page=${info.slide}&toolbar=0&navpanes=0`;
      if (el._fsFrame.src !== next) el._fsFrame.src = next;
    }
    // 3) Lien YouTube (VOD ou live) : contrôle par postMessage, sans dépendance réseau locale.
    if (el._fsYt && el._fsFrame) {
      if (info.playing) ytPlay(el._fsFrame); else ytPause(el._fsFrame);
      if (info.muted) ytMute(el._fsFrame); else ytUnMute(el._fsFrame);
      if (typeof info.volume === 'number') ytVolume(el._fsFrame, info.volume);
      if (typeof info.currentTime === 'number' && info.currentTime > 0 && info.seekToken !== el._fsLastSeek) {
        el._fsLastSeek = info.seekToken;
        ytSeek(el._fsFrame, info.currentTime);
      }
    }
  }

  destroy() { this._ro?.disconnect(); if (this._onResize) window.removeEventListener('resize', this._onResize); }
}

function cssUrl(u) { return String(u || '').replace(/"/g, '%22'); }

/** Applique un design importé (Photoshop/PNG + zones) sans jamais déborder. */
export function normalizeDesign(d) {
  const layers = (d.layers || []).map(l => ({
    ...l,
    id: l.id || `l-${Math.random().toString(36).slice(2)}`,
    box: clampBox(l.box, d.canvas),
    visible: l.visible !== false,
    style: l.type === 'text' ? { ...l.style, autoFit: l.style?.autoFit !== false } : l.style,
  }));
  return { ...d, layers };
}
function clampBox(box, canvas) {
  const w = canvas?.w || 7680, h = canvas?.h || 4320;
  return {
    x: Math.max(0, Math.min(w - 10, Number(box?.x) || 0)),
    y: Math.max(0, Math.min(h - 10, Number(box?.y) || 0)),
    w: Math.max(10, Math.min(w, Number(box?.w) || w)),
    h: Math.max(10, Math.min(h, Number(box?.h) || h)),
  };
}

export { resolveTemplate, styleToCss, measureLine, wrapText };
