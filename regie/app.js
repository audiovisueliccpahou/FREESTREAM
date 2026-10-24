// FREESTREAM — régie principale : navigation, aperçus, raccourcis, état live.
import { store, $, $$, el, toast, initWorkPreviews, clearOutput, undo, toggleBlackout, esc } from './core.js';
import { installShortcuts } from './shortcuts.js';
import * as bible from './bible.js';
import * as chants from './chants.js';
import * as medias from './medias.js';
import * as lowerthird from './lowerthird.js';
import * as designs from './designs.js';
import * as outputs from './outputs.js';
import * as orateur from './orateur.js';
import { fmt, remainingMs } from '../core/timer.js';

const MODULES = { bible, chants, medias, lowerthird, designs, outputs, orateur };
let active = null, activeName = '';

await store.init({ role:'regie', id:'regie-principale' });
initWorkPreviews();

/* -------------------------------------------------------------- navigation */
const navBtns = $$('#nav .navbtn');
async function goto(name) {
  if (name === 'minuteur') {
    window.open('regies/minuteur.html', 'fs-minuteur', 'width=1100,height=860');
    $('#main').innerHTML = minuteurPanel(); bindMinuteurPanel(); return;
  }
  if (name === 'aide') { $('#main').innerHTML = aidePanel(); active = null; activeName = 'aide'; updateNav(); return; }
  const mod = MODULES[name]; if (!mod) return;
  active?.destroy?.();
  $('#main').innerHTML = '';
  try { active = await mod.mount($('#main')); }
  catch (e) { console.error(e); $('#main').innerHTML = `<div class="empty">Erreur du module « ${esc(name)} » : ${esc(e.message)}</div>`; active = null; }
  activeName = name; updateNav();
  const ct = $('#cur-tool'); if (ct) ct.textContent = ({bible:'📖 Bible',chants:'🎵 Chants',medias:'🎬 Médias',lowerthird:'▭ Lowerthirds',designs:'🎨 Designs',outputs:'🔌 Sorties',orateur:'✉ Orateur'})[name] || name;
}
function updateNav(){ navBtns.forEach(b => b.classList.toggle('on', b.dataset.t === activeName)); }
$('#nav').onclick = e => { const b = e.target.closest('[data-t]'); if (b) goto(b.dataset.t); };
window.addEventListener('fs:goto', e => goto(e.detail));

/* -------------------------------------------------------------- actions */
const actions = {
  undo, blackout: toggleBlackout,
  clear: () => { clearOutput('both'); toast('Sorties masquées'); },
  preview: which => {
    const f = $(which === 'plein' ? '#pv-air-plein' : '#pv-air-bas');
    if (f) { f.style.outline = '3px solid var(--accent)'; setTimeout(()=>f.style.outline='', 900); }
    toast(`Aperçu « ${which === 'plein' ? 'plein écran' : 'bas centré'} » mis en avant`);
  },
  goto,
};
/* -------------------------- accueil « mode dossier » (lancé par DEMARRER) */
async function maybeFolderDialog() {
  if (store.connected || store.folderMode) return;   // déjà opérationnel
  const dlg = $('#dossierdlg'); if (!dlg) return;
  if (!store.folderModeSupported) {
    toast('Aucun serveur : installez Node.js ou Python, puis relancez DEMARRER', 'err');
    return;
  }
  $('#dossier-go').onclick = async () => {
    try {
      const ok = await store.enableFolderMode();
      if (ok) { dlg.close(); toast('Mode dossier activé — tout fonctionne sans serveur', 'ok'); paintStatus(); }
    } catch (e) { toast('Impossible : ' + e.message, 'err'); }
  };
  $('#dossier-later').onclick = () => dlg.close();
  // ?mode=dossier : le lanceur a déjà expliqué la démarche → ouverture directe.
  if (new URLSearchParams(location.search).get('mode') === 'dossier') {
    try { dlg.showModal(); } catch { }
  }
}
maybeFolderDialog();

/* ----------------------------------- maximisation : toute la place à l'utile */
function setMax(on) {
  document.body.classList.toggle('ui-max', on);
  if (on) {
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  } else if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  toast(on ? 'Affichage maximal — Échap ou ✕ pour revenir' : 'Affichage normal', 'ok');
}
$('#btn-max').onclick = () => setMax(!document.body.classList.contains('ui-max'));
$('#exitmax').onclick = () => setMax(false);
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) document.body.classList.remove('ui-max');
});
document.addEventListener('keydown', e => {
  if (e.key === 'F11') { e.preventDefault(); setMax(!document.body.classList.contains('ui-max')); }
  if (e.key === 'Escape' && document.body.classList.contains('ui-max')) setMax(false);
});
// Le panneau des aperçus se replie pour laisser 100 % de la largeur à l'éditeur.
$('#btn-panel').onclick = () => {
  const off = document.body.classList.toggle('no-preview');
  toast(off ? 'Aperçus masqués — plus de place pour l’édition' : 'Aperçus affichés');
  setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
};

/* --------------------------------------------- loupe 1:1 sur les aperçus */
const zoomDlg = $('#zoomdlg'), zoomFrame = $('#zoomframe');
const ZOOM = {
  'plein':    { title:'TRAVAIL · Plein écran', src:'outputs/plein.html?preview=1&zoom=1' },
  'air-plein':{ title:'À L’ANTENNE · Plein écran', src:'outputs/plein.html?preview=1' },
  'bas':      { title:'TRAVAIL · Bas centré', src:'outputs/bas.html?preview=1&zoom=1' },
  'air-bas':  { title:'À L’ANTENNE · Bas centré', src:'outputs/bas.html?preview=1' },
  'coeur':    { title:'TRAVAIL · Cœur', src:'outputs/coeur.html?preview=1&zoom=1' },
  'air-coeur':{ title:'À L’ANTENNE · Cœur', src:'outputs/coeur.html?preview=1' },
};
document.addEventListener('click', e => {
  const z = e.target.closest('[data-zoom]'); if (!z) return;
  const cfg = ZOOM[z.dataset.zoom]; if (!cfg || !zoomDlg) return;
  $('#zoomtitle').textContent = cfg.title + ' — rendu réel';
  zoomFrame.src = cfg.src;
  zoomDlg.showModal();
});
$('#zoomclose').onclick = () => zoomDlg.close();
$('#zoomreload').onclick = () => { zoomFrame.src = zoomFrame.src; };

$('#btn-folder').onclick = async () => {
  if (store.folderMode) { toast('Le mode dossier est déjà actif — les sorties OBS lisent donnees/etat/live.js'); return; }
  try {
    const ok = await store.enableFolderMode();
    if (ok) { toast('Mode dossier activé : tout fonctionne sans serveur, et tout est écrit dans le projet', 'ok'); paintStatus(); }
  } catch (e) { toast('Impossible d\'activer : ' + e.message, 'err'); }
};

$('#btn-undo').onclick = undo;
$('#btn-black').onclick = toggleBlackout;
$('#btn-preview-p').onclick = () => actions.preview('plein');
$('#btn-preview-b').onclick = () => actions.preview('bas');
installShortcuts({ store, activeModule: () => active, actions });

/* --------------------------------------------------- menu contextuel (clic droit) */
const ctx = $('#ctx');
document.addEventListener('contextmenu', e => {
  if (!e.target.closest('#main')) return;
  e.preventDefault();
  ctx.innerHTML = `
    <button data-a="sendp">📺 Envoyer en plein écran <span class="muted">F</span></button>
    <button data-a="sendb">▭ Envoyer en bas centré <span class="muted">S</span></button>
    <hr><button data-a="next">→ Suivant <span class="muted">→ / Espace</span></button>
    <button data-a="prev">← Précédent <span class="muted">←</span></button>
    <hr><button data-a="clear">✕ Masquer les sorties <span class="muted">Échap</span></button>
    <button data-a="black">■ Noir <span class="muted">B</span></button>
    <button data-a="undo">↶ Revenir en arrière <span class="muted">Ctrl+Z</span></button>
    <hr><button data-a="orateur">✉ Message à l'orateur <span class="muted">M</span></button>`;
  ctx.style.display = 'block';
  ctx.style.left = Math.min(e.clientX, innerWidth - 230) + 'px';
  ctx.style.top = Math.min(e.clientY, innerHeight - 320) + 'px';
});
document.addEventListener('click', e => {
  if (!ctx.contains(e.target)) { ctx.style.display = 'none'; return; }
  const b = e.target.closest('[data-a]'); if (!b) return;
  ctx.style.display = 'none';
  const a = b.dataset.a;
  if (a === 'sendp' || a === 'sendb') active?.onKey?.(a === 'sendp' ? 'sendFullscreen' : 'sendLower');
  else if (a === 'next' || a === 'prev') active?.onKey?.(a);
  else if (a === 'clear') actions.clear();
  else if (a === 'black') actions.blackout();
  else if (a === 'undo') actions.undo();
  else if (a === 'orateur') actions.goto('orateur');
});

/* --------------------------------------------------- barre d'état + infos */
function paintStatus(){
  const dot = $('#conn-dot'), txt = $('#conn-txt');
  if (dot) dot.classList.toggle('off', !store.connected && !store.folderMode);
  if (txt) txt.textContent = store.connected ? 'Serveur local · sync instantanée'
    : store.folderMode ? 'Mode dossier · 100 % sans serveur'
    : 'Serveur absent — activez le mode dossier';
  const bf = $('#btn-folder');
  if (bf) {
    bf.style.display = (store.connected || !store.folderModeSupported) ? 'none' : '';
    bf.classList.toggle('on', !!store.folderMode);
    bf.textContent = store.folderMode ? '✓ Dossier actif' : '📂 Mode dossier';
  }
  const onair = $('#onair');
  if (onair) { const b = store.state.live?.blackout; onair.textContent = b ? '■ NOIR' : '● EN DIRECT'; onair.style.opacity = b ? .55 : 1; }
  const m = store.state.minuteur || {};
  const clock = $('#clock');
  if (clock) {
    const rem = remainingMs(store.state);
    clock.textContent = new Date().toLocaleTimeString('fr-FR') + (m.visible && m.index>=0 ? `  ·  ⏱ ${fmt(rem)}` : '');
  }
  const info = $('#sideinfo');
  if (info) {
    const outs = Object.keys(store.state.presence||{}).length;
    const lt = store.state.live?.lowerthird;
    const ltOn = lt && !lt.cut && (!lt.duration || Date.now()-lt.startedAt < lt.duration*1000);
    info.innerHTML = `<div class="row" style="justify-content:space-between">
        <span class="pill">${outs} sortie(s) connectée(s)</span>
        <span class="pill ${ltOn?'ok':''}">${ltOn?'Lowerthird actif':'Aucun lowerthird'}</span></div>
      <div class="hint" style="margin-top:8px">Les aperçus « TRAVAIL » montrent ce que vous préparez. Les aperçus « À L'ANTENNE » sont de vraies pages de sortie : c'est exactement ce qu'OBS reçoit.</div>`;
  }
}
store.on(paintStatus); paintStatus(); setInterval(paintStatus, 1000);

/* ------------------------------------------------------------- panneaux */
function minuteurPanel(){
  const m = store.state.minuteur||{};
  return `<div class="tool-head"><h1>⏱ Minuteur</h1><span class="pill acc">Régie indépendante — une autre personne peut la gérer depuis le réseau local</span></div>
    <div class="card tight" style="margin-bottom:12px">
      <div class="row"><strong id="mp-clock" style="font-size:44px;font-weight:800;font-variant-numeric:tabular-nums">--:--</strong>
        <span class="spacer"></span><button class="btn primary" id="mp-open">Ouvrir la régie du minuteur ↗</button></div>
      <div class="hint" style="margin-top:8px">La trame est enregistrée automatiquement. Le décompte continue en négatif (−) si l'intervenant dépasse son temps. Ajoutez 30 s, 1 min, 5 min, 10 min, 30 min ou 1 h — et retirez-en — en direct.</div>
    </div>
    <div class="card tight"><strong>Trame en cours</strong><div id="mp-items" style="margin-top:10px"></div></div>
    <div class="card tight" style="margin-top:12px"><div class="muted small">Aperçu de la sortie minuteur</div>
      <iframe src="outputs/minuteur.html?preview=1" style="width:100%;aspect-ratio:16/9;border:1px solid var(--line);border-radius:10px;background:#000;margin-top:9px"></iframe></div>`;
}
function bindMinuteurPanel(){
  const o = $('#mp-open'); if (o) o.onclick = () => window.open('regies/minuteur.html','fs-minuteur','width=1100,height=860');
  const paint = () => {
    const m = store.state.minuteur||{};
    const c = $('#mp-clock'); if (c) { const r = remainingMs(store.state); c.textContent = (m.visible&&m.index>=0)?fmt(r):'--:--'; c.style.color = (r!==null&&r<0)?'var(--danger)':''; }
    const it = $('#mp-items'); if (it) it.innerHTML = (m.items||[]).length ? m.items.map((x,i)=>`<div class="list-item ${i===m.index?'sel':''}"><span class="badge-n">${i+1}</span><div class="grow"><div class="t">${esc(x.title)}</div><div class="s">${((x.durationMs||0)/60000).toFixed(1)} min · ${esc(x.note||'')}</div></div>${i===m.index?'<span class="pill ok">EN COURS</span>':''}</div>`).join('') : '<div class="empty">Aucune trame. Ouvrez la régie du minuteur pour créer le déroulé de l\'événement.</div>';
  };
  paint();
  clearInterval(bindMinuteurPanel._t);
  bindMinuteurPanel._t = setInterval(() => { if (activeName==='minuteur') paint(); else clearInterval(bindMinuteurPanel._t); }, 300);
}
store.on(() => { if (activeName==='minuteur') bindMinuteurPanel(); });

function aidePanel(){
  return `<div class="tool-head"><h1>❔ Aide & raccourcis</h1><span class="pill acc">Interface pensée pour les réflexes de tout utilisateur</span></div>
  <div class="grid2" style="align-items:start">
    <div class="card tight"><h3>Clavier</h3>
      <div class="grid2 small">
        <div><kbd>→</kbd> <kbd>↓</kbd> <kbd>Espace</kbd></div><div>Suivant (verset / écran / média / section)</div>
        <div><kbd>←</kbd> <kbd>↑</kbd></div><div>Précédent</div>
        <div><kbd>Entrée</kbd></div><div>Valider la saisie en cours</div>
        <div><kbd>Échap</kbd> <kbd>Retour arrière</kbd></div><div>Masquer les sorties</div>
        <div><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd></div><div>Bible · Chants · Médias · Lowerthirds</div>
        <div><kbd>F</kbd> / <kbd>S</kbd></div><div>Envoyer plein écran / bas centré</div>
        <div><kbd>P</kbd> / <kbd>L</kbd></div><div>Mettre en avant l'aperçu plein / bas</div>
        <div><kbd>B</kbd> ou <kbd>N</kbd></div><div>Noir (blackout)</div>
        <div><kbd>M</kbd></div><div>Message à l'orateur</div>
        <div><kbd>Ctrl</kbd>+<kbd>Z</kbd></div><div>Revenir à l'affichage précédent</div>
        <div><strong>Clic droit</strong></div><div>Menu contextuel dans la régie</div>
      </div></div>
    <div class="card tight"><h3>Bible — saisie rapide</h3>
      <p class="muted small">Tapez <code>es</code> → les livres proches s'affichent → <kbd>Entrée</kbd> → vous êtes dans « Chapitre » → <code>8</code> → <kbd>Espace</kbd> → vous êtes dans « Verset » → <code>9</code> → <kbd>Entrée</kbd>. Le verset s'affiche.</p>
      <p class="muted small">En mode « Découpage bas centré », <kbd>→</kbd> fait défiler les sections du verset long. Le plein écran reste fixe et n'avance qu'une fois toutes les sections passées.</p>
      <div class="sep"></div><h3>Chants</h3>
      <p class="muted small">Un retour = une ligne de la même partie. Deux retours = une nouvelle partie. Le texte sort toujours en grand, même saisi en petit.</p>
      <div class="sep"></div><h3>Médias</h3>
      <p class="muted small">Premier clic = aperçu. Deuxième clic = envoi vers OBS. Les vidéos sont servies enHTTP Range : lecture fluide et cherchable même sur 30 minutes.</p>
    </div></div>
  <div class="card tight" style="margin-top:12px"><h3>Sorties par défaut</h3>
    <p class="muted small">Deux sorties universelles <strong>8K</strong> (plein écran, bas centré), plus un lien dédié pour chacun des 4 outils dans les deux formats, plus la vue orateur et la vue minuteur. Créez autant de sorties personnalisées que d'écrans (portrait, taille précise) : leur design est copié du plein écran jusqu'à modification.</p>
    <a class="btn primary" href="index.html" target="_blank" style="margin-top:10px">🔌 Voir tous les liens OBS</a></div>`;
}

/* ------------------------------------------------------------- démarrage */
const q = new URLSearchParams(location.search).get('tab');
goto(MODULES[q] ? q : 'bible');
