/**
 * Runtime partagé de TOUTES les sorties OBS.
 * Aucune logique de mise en page ici : tout passe par core/renderer.js (le même
 * que les aperçus de la régie). Garantie « preview == OBS ».
 */
import { store } from '../core/store.js';
import { Stage } from '../core/renderer.js';
import { mediaKind } from '../core/config.js';
import { resolveOutputConfig, toolVisible, lowerthirdTargets, lowerthirdActive, lowerthirdRemainingMs } from '../core/output-config.js';

const qs = new URLSearchParams(location.search);
const cfg = resolveOutputConfig({ dataset: document.body.dataset, search: location.search });
const TYPE = cfg.type;                 // plein | bas | custom | special
const TOOL = cfg.tool;                 // filtre d'outil ou universel '*'
const OUT_ID = cfg.outId;
const PREVIEW = cfg.preview;

const root = document.getElementById('root');
const overlayRoot = document.getElementById('overlay');
store.type = TYPE; store.tool = TOOL;

await store.init({ role: 'output', id: `${TYPE}:${TOOL}:${OUT_ID}` });

let baseStage = null, overlayStage = null;
let baseDesignId = null, overlayDesignId = null;
let lastBaseKey = '', lastOverlayKey = '';
let hideTimer = null;

function designFor(state, payload, fallbackTool, fallbackType) {
  if (OUT_ID && state.designs?.[`out:${OUT_ID}`]) return state.designs[`out:${OUT_ID}`];
  const id = payload?.designId
    || `${payload?.tool || fallbackTool}:${fallbackType}`
    || `${fallbackTool}:${fallbackType}`;
  return state.designs?.[id] || state.designs?.[`${fallbackTool}:${fallbackType}`] || null;
}

function payloadFor(state) {
  if (state.live?.blackout) return null;
  if (TYPE === 'plein') return state.live?.fullscreen || null;
  if (TYPE === 'bas') return state.live?.lower || null;
  if (TYPE === 'coeur') return state.live?.coeur || null;
  // sortie personnalisée : par défaut elle suit le plein écran
  return state.live?.fullscreen || null;
}

/**
 * La sortie CŒUR est un moniteur de paroles « collant » : elle garde le chant
 * affiché même si la Bible ou un média prend le plein écran. C'est voulu —
 * l'équipe de louange doit toujours voir la section suivante.
 * Ajoutez ?sticky=0 pour qu'elle suive le filtre d'outil comme les autres.
 */
const STICKY_COEUR = TYPE === 'coeur' && qs.get('sticky') !== '0';
function isVisible(state, payload) {
  if (TYPE === 'coeur' && STICKY_COEUR) return !!payload;
  return toolVisible(TOOL, state.live?.tool) && !!payload;
}

function activeLowerthird(state) {
  const lt = state.live?.lowerthird;
  if (!lowerthirdActive(lt)) return null;
  if (TYPE === 'coeur') return null;           // le Cœur reste un écran de paroles propre
  if (!lowerthirdTargets(lt, TYPE)) return null;
  return lt;
}

function apply(state) {
  const p = payloadFor(state);
  const visible = isVisible(state, p);

  /* ---------------- calque de base ---------------- */
  if (!visible) {
    if (baseStage) { baseStage.clear(); baseStage.textEl.style.opacity = '0'; }
    if (baseStage?.bgEl) baseStage.bgEl.style.opacity = '0';
  } else {
    const d = designFor(state, p, p.tool || state.live.tool,
      TYPE === 'bas' ? 'bas' : TYPE === 'coeur' ? 'coeur' : 'plein');
    const key = `${d?.id}|${p.key || JSON.stringify(p.vars)}`;
    if (!baseStage || baseDesignId !== d?.id) {
      if (baseStage) baseStage.destroy();
      baseStage = new Stage(root, { design: d, onOverflow: warn });
      baseDesignId = d?.id; lastBaseKey = '';
    }
    baseStage.bgEl.style.opacity = '1';
    baseStage.textEl.style.opacity = '1';
    if (key !== lastBaseKey) {
      lastBaseKey = key;
      baseStage.update(p.vars || {}, { media: mediaInfo(p, state), transition: d?.transition });
    } else if (p.media) {
      baseStage._updateMedia(mediaInfo(p, state));
    }
  }

  /* ---------------- calque lowerthird (indépendant) ---------------- */
  const lt = activeLowerthird(state);
  if (!lt) {
    if (overlayStage) { overlayStage.textEl.style.opacity = '0'; overlayStage.bgEl.style.opacity = '0'; overlayStage.staticEl.style.opacity = '0'; }
    clearTimeout(hideTimer);
  } else {
    const d = designFor(state, { designId: lt.designId }, 'lowerthird', (lt.target || 'bas'));
    const key = `${d?.id}|${lt.id}|${lt.startedAt}`;
    if (!overlayStage || overlayDesignId !== d?.id) {
      if (overlayStage) overlayStage.destroy();
      overlayStage = new Stage(overlayRoot, { design: d, onOverflow: warn });
      overlayDesignId = d?.id; lastOverlayKey = '';
    }
    overlayRoot.style.display = '';
    overlayStage.bgEl.style.opacity = '1';
    overlayStage.staticEl.style.opacity = '1';
    overlayStage.textEl.style.opacity = '1';
    if (key !== lastOverlayKey) {
      lastOverlayKey = key;
      overlayStage.update(lt.vars || {}, { transition: { type: lt.transition || d?.transition?.type, duration: lt.transitionDuration ?? d?.transition?.duration } });
    }
    clearTimeout(hideTimer);
    const remaining = lowerthirdRemainingMs(lt);   // durée saisie en secondes → convertie en ms
    if (Number.isFinite(remaining)) {
      const outDur = Number(lt.outDuration) || 300;
      hideTimer = setTimeout(() => {
        if (overlayStage) {
          overlayStage.animateOut({ type: lt.outTransition || 'fade', duration: outDur }).then(() => {
            overlayStage.textEl.style.opacity = '0'; overlayStage.bgEl.style.opacity = '0'; overlayStage.staticEl.style.opacity = '0';
          });
        }
      }, Math.max(0, remaining - outDur));
    }
  }
}

function mediaInfo(p, state) {
  const m = p.media || null;
  if (!m) return {};
  const src = m.src || '';
  return {
    src, kind: m.kind || mediaKind(src),
    playing: m.playing ?? state.medias?.playing ?? true,
    muted: m.muted ?? state.medias?.muted ?? false,
    volume: m.volume ?? state.medias?.volume ?? 1,
    currentTime: m.currentTime ?? state.medias?.time ?? 0,
    seekToken: m.seekToken ?? state.medias?.seekToken ?? 0,
    loop: m.loop ?? state.medias?.loop ?? false,
    slide: m.slide ?? state.medias?.slide ?? 0,
  };
}

let warnEl = null;
function warn(list) {
  if (PREVIEW) return;                       // l'avertissement est affiché dans la régie, pas à l'antenne
  if (!warnEl) { warnEl = document.createElement('div'); warnEl.className = 'fs-overflow-warn'; document.body.appendChild(warnEl); }
  warnEl.textContent = `⚠ Débordement : ${list.map(x => x.role).join(', ')}`;
  clearTimeout(warn._t); warn._t = setTimeout(() => warnEl?.remove(), 3500);
}

store.on(apply);
apply(store.state);
setInterval(() => { if (store.state.live?.lowerthird) apply(store.state); }, 400);
