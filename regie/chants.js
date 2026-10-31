// Onglet CHANTS — saisie par doubles retours, grands caractères garantis, CRUD, import/export.
import { store, esc, $, $$, el, toast, richEditor, setWork, sendToObs, clearOutput, pickFile, download, confirmDlg, formDlg } from './core.js';
import { parseSong, serializeSong, allSlides, chunkSection, searchSongs, importSong, importMany, exportSong, songPlain } from '../core/songs-utils.js';
import { sanitizeHtml } from '../core/sanitize.js';
import { mediaKind } from '../core/config.js';

let host = null, songs = [], sel = null, sub = 'liste', slideIdx = 0, query = '';
let editArea = null, slideEditor = null, saveT = null;

export async function mount(container) {
  host = container;
  host.innerHTML = `
    <div class="tool-head"><h1>🎵 Chants</h1><span class="pill acc">1 retour = même partie · 2 retours = nouvelle partie · sortie TOUJOURS en grands caractères</span></div>
    <div class="subtabs" id="ch-sub">
      <button class="subtab on" data-s="liste">Bibliothèque</button>
      <button class="subtab" data-s="editeur">Éditeur</button>
      <button class="subtab" data-s="projection">Projection</button>
      <button class="subtab" data-s="fond">Fond & calques</button>
    </div><div id="ch-body"></div>`;
  $('#ch-sub',host).onclick = e => { const b=e.target.closest('[data-s]'); if(!b) return; sub=b.dataset.s; $$('#ch-sub .subtab',host).forEach(x=>x.classList.toggle('on',x===b)); render(); };
  await reload(); render();
  return { onKey };
}

async function reload() {
  const files = await store.list('chants');
  songs = [];
  for (const f of files.filter(x=>/\.json$/i.test(x.name))) {
    try { const d = await store.load('chants', f.name); if (d?.sections) songs.push({ ...d, _file:f.name }); } catch { }
  }
  if (!songs.length) {
    // Chant de démonstration pour pouvoir tester immédiatement.
    const demo = parseSong("Ainsi soit-il, Seigneur\nQue ta volonté soit faite\nEn mon cœur, en ma maison\nAujourd'hui et à jamais\n\nTu es digne, tu es saint\nTu es le Dieu de ma vie\nJe te loue, je te loue\nDe tout mon être", 'Chant de démonstration');
    await store.save('chants', 'chant-demo.json', demo);
    songs = [{ ...demo, _file:'chant-demo.json' }];
  }
  const requested = songs.find(s=>s.id===store.state.chants?.currentId);
  if (requested) { sel = requested; slideIdx = Number(store.state.chants?.chunkIndex) || 0; }
  else if (!sel || !songs.find(s=>s.id===sel.id)) { sel = songs[0] || null; slideIdx = 0; }
}

function keyOf(song, idx) { return `${song?.id}|${idx}`; }

/* ------------------------------------------------------------------ rendu */
function render() {
  const box = $('#ch-body',host); if (!box) return;
  if (sub==='liste') renderListe(box);
  else if (sub==='editeur') renderEditeur(box);
  else if (sub==='projection') renderProjection(box);
  else renderFond(box);
  refreshPreview();
}

function renderListe(box) {
  box.innerHTML = `
    <div class="op-workspace op-songs-workspace">
      <aside class="op-library-panel" aria-label="Bibliothèque des chants">
        <div class="op-panel-heading"><div><strong>Chants</strong><span class="op-panel-count">${songs.length} titres</span></div></div>
        <div class="op-list-search"><input class="inp" id="ch-q" placeholder="🔍 Rechercher titre ou paroles…" value="${esc(query)}"></div>
        <div class="op-library-actions"><button class="btn primary" id="ch-new">+ Nouveau chant</button><button class="btn" id="ch-import">📥 Importer</button><button class="btn" id="ch-export-all">📤 Tout exporter</button></div>
        <div id="ch-list" class="op-list-scroll"></div>
        <div class="op-library-footer"><span class="muted small">Recherche dans les paroles incluse</span></div>
      </aside>
      <section class="op-work-panel op-song-detail"><div id="ch-peek"></div></section>
    </div>`;
  const paint = () => {
    const found = searchSongs(songs, query), list=$('#ch-list',box);
    list.innerHTML = found.length ? found.map(s=>`<div class="op-song-row list-item ${sel?.id===s.id?'selected sel':''}" data-id="${esc(s.id)}">
        <span class="op-song-count">${(s.sections||[]).length}</span>
        <div class="op-song-name"><strong>${esc(s.title)}</strong><span>${esc(s.author||s.snippet||'Sans artiste')}</span></div>
        <div class="op-song-row-actions"><button class="btn xs dup" data-id="${esc(s.id)}" title="Dupliquer">⧉</button><button class="btn xs ren" data-id="${esc(s.id)}" title="Renommer">✎</button><button class="btn xs danger del" data-id="${esc(s.id)}" title="Supprimer">✕</button></div>
      </div>`).join('') : '<div class="op-empty">Aucun chant trouvé.</div>';
    const peek=$('#ch-peek',box);
    if (!sel) { peek.innerHTML='<div class="op-empty op-detail-empty">Sélectionnez un chant dans la bibliothèque.</div>';return; }
    const slides=allSlides(sel,store.state.chants.linesPerChunk||4);
    slideIdx=Math.max(0,Math.min(slideIdx,slides.length-1));
    peek.innerHTML=`
      <div class="op-work-panel-header op-song-header">
        <div class="op-active-identity"><span class="op-tool-kicker">CHANT · ${slides.length} ÉCRAN(S)</span><strong>${esc(sel.title)}</strong><span class="muted small">${esc(sel.author||'Artiste non renseigné')} · ${(sel.sections||[]).length} section(s)</span></div>
        <div class="op-song-actions"><button class="btn" id="ch-open">✎ Éditer</button><button class="btn" id="ch-proj">Projection complète</button><button class="btn primary" id="ch-peek-send">📺 Afficher la sélection</button><button class="btn" id="ch-peek-coeur" title="Envoyer uniquement la sortie Cœur">♥ Cœur seul</button></div>
      </div>
      <div class="op-song-reading-heading"><strong>Paroles et sections</strong><span class="muted small">Cliquez sur une partie pour la lire dans l’aperçu · « Afficher » l’envoie à OBS</span></div>
      <div class="op-song-slides" id="ch-song-slides">${slides.map((slide,i)=>`<article class="op-song-slide ${i===slideIdx?'selected':''}" data-slide="${i}" tabindex="0" role="button" aria-pressed="${i===slideIdx}">
        <div class="op-song-slide-meta"><span class="op-slide-number">${i+1}</span><span class="op-slide-label">${esc(slide.label||'Partie '+((slide.sectionIndex||0)+1))}</span><span class="op-slide-count">${slide.index+1}/${slide.total}</span></div>
        <div class="op-song-slide-text">${esc(slide.text)}</div>
        <button class="btn xs primary op-song-show" data-show-slide="${i}" type="button">Afficher ↗</button>
      </article>`).join('') || '<div class="op-empty">Ce chant ne contient encore aucune partie. Ouvrez l’éditeur pour en ajouter.</div>'}</div>
      <div class="op-song-footer"><span class="muted small">Le plein écran et les aperçus gardent le grand format « Chants ».</span><div><button class="btn xs" id="ch-song-prev">◀ Partie</button> <button class="btn xs" id="ch-song-next">Partie ▶</button></div></div>`;
  };
  paint();
  $('#ch-q',box).oninput = e => { query = e.target.value; paint(); };
  $('#ch-list',box).onclick = async e => {
    const del = e.target.closest('.del'), ren = e.target.closest('.ren'), dup = e.target.closest('.dup');
    if (del) { const id=del.dataset.id; const s=songs.find(x=>x.id===id);
      if (!await confirmDlg(`Supprimer « ${s.title} » ?`)) return;
      await store.remove('chants', s._file); await reload(); render(); return; }
    if (ren) { const id=ren.dataset.id; const s=songs.find(x=>x.id===id);
      const r = await formDlg('Renommer le chant', [{name:'title',label:'Titre',value:s.title}]); if(!r?.title) return;
      s.title=r.title; s.updatedAt=Date.now(); await persist(s); await reload(); render(); return; }
    if (dup) { const id=dup.dataset.id; const s=songs.find(x=>x.id===id);
      const n={...structuredClone(s),id:'song-'+Date.now().toString(36),title:s.title+' (copie)',createdAt:Date.now(),updatedAt:Date.now()};
      delete n._file; await persist(n); await reload(); render(); toast('Chant dupliqué','ok'); return; }
    const d = e.target.closest('[data-id]'); if (!d) return;
    sel = songs.find(x=>x.id===d.dataset.id)||null; slideIdx=0;
    if (sel) store.patch({chants:{currentId:sel.id,chunkIndex:0,sectionIndex:0}});
    paint(); refreshPreview();
  };
  $('#ch-peek',box).onclick=e=>{
    if(e.target.closest('#ch-open')){sub='editeur';$$('#ch-sub .subtab',host).forEach(x=>x.classList.toggle('on',x.dataset.s==='editeur'));render();return;}
    if(e.target.closest('#ch-proj')){sub='projection';$$('#ch-sub .subtab',host).forEach(x=>x.classList.toggle('on',x.dataset.s==='projection'));render();return;}
    if(e.target.closest('#ch-peek-send')){send();return;}
    if(e.target.closest('#ch-peek-coeur')){sendCoeurOnly();return;}
    if(e.target.closest('#ch-song-prev')){step(-1);paint();return;}
    if(e.target.closest('#ch-song-next')){step(1);paint();return;}
    const show=e.target.closest('[data-show-slide]'), card=e.target.closest('[data-slide]');
    if(!card)return;
    slideIdx=Number((show||card).dataset.showSlide ?? card.dataset.slide);
    const slides=allSlides(sel,store.state.chants.linesPerChunk||4), slide=slides[slideIdx];
    store.patch({chants:{currentId:sel.id,chunkIndex:slideIdx,sectionIndex:slide?.sectionIndex||0}});
    paint();refreshPreview();
    // OpenPresenter-style: one click on a lyric section both selects and displays it.
    send();
  };
  $('#ch-peek',box).onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-slide]')){e.preventDefault();e.target.click();}};
  $('#ch-new',box).onclick = async () => {
    const r = await formDlg('Nouveau chant', [{name:'title',label:'Titre',value:'Nouveau chant'},{name:'text',label:'Paroles (1 retour = ligne · 2 retours = nouvelle partie)',type:'textarea',rows:8,value:''}]);
    if (!r) return;
    const s = parseSong(r.text || 'Paroles ici', r.title);
    await persist(s); await reload(); sel = songs.find(x=>x.title===r.title)||songs[0]; sub='editeur'; render(); toast('Chant créé','ok');
  };
  $('#ch-import',box).onclick = async () => {
    const fs = await pickFile('.json,.txt,.cho,.chopro,.crd,.pro5,.pro6,.xml', true); if (!fs?.length) return;
    let n=0;
    for (const f of fs) { try { for (const s of importMany(await f.text(), f.name)) { await persist(s); n++; } } catch(err){ toast(`${f.name} : ${err.message}`,'err'); } }
    await reload(); render(); toast(`${n} chant(s) importé(s)`,'ok');
  };
  $('#ch-export-all',box).onclick = () => download('chants-freestream.json', JSON.stringify(songs.map(s=>{const c={...s};delete c._file;return c;}),null,2));
}
async function persist(s) {
  s.updatedAt = Date.now();
  const name = s._file || `chant-${s.id}.json`;
  const copy = { ...s }; delete copy._file;
  const r = await store.save('chants', name, copy);
  s._file = r.name || name;
}

function renderEditeur(box) {
  if (!sel) { box.innerHTML = '<div class="empty">Sélectionnez ou créez un chant.</div>'; return; }
  box.innerHTML = `
    <div class="card tight" style="margin-bottom:12px">
      <div class="grid3">
        <div class="field"><label class="lbl">Titre</label><input class="inp" id="e-title" value="${esc(sel.title)}"></div>
        <div class="field"><label class="lbl">Auteur / artiste</label><input class="inp" id="e-author" value="${esc(sel.author||'')}"></div>
        <div class="field"><label class="lbl">Tonalité</label><input class="inp" id="e-key" value="${esc(sel.key||'')}"></div>
      </div>
      <div class="row"><button class="btn primary" id="e-save">💾 Enregistrer</button>
        <button class="btn" id="e-export">📤 Exporter</button>
        <button class="btn danger" id="e-del">✕ Supprimer</button>
        <span class="spacer"></span><span class="muted small" id="e-stat"></span></div>
    </div>
    <div class="grid2" style="grid-template-columns:1.15fr .85fr;align-items:start">
      <div class="card tight">
        <div class="row" style="justify-content:space-between"><strong>Paroles (texte brut)</strong><span class="muted small">↵ = ligne · ↵↵ = partie</span></div>
        <textarea class="inp" id="e-text" style="min-height:48vh;font-size:16px;line-height:1.55;white-space:pre-wrap"></textarea>
        <div class="hint">L'analyse est automatique : elle détecte les étiquettes (Couplet, Refrain, Pont…) et sépare les parties. Saisi en petits caractères, le chant sortira quand même en GRAND à l'écran.</div>
      </div>
      <div class="card tight">
        <div class="row" style="justify-content:space-between"><strong>Structure analysée</strong><span class="pill" id="e-nb"></span></div>
        <div id="e-sections" class="scroll" style="max-height:32vh;margin-top:10px"></div>
        <div class="sep"></div>
        <div class="field"><label class="lbl">Lignes par écran (garde les gros caractères)</label>
          <input class="inp" type="number" id="e-lines" min="1" max="12" value="${store.state.chants.linesPerChunk||4}"></div>
        <div class="hint">Moins de lignes = police plus grande. Le moteur ajuste automatiquement sans jamais déborder.</div>
        <div class="sep"></div>
        <strong>Mise en forme de l'écran courant</strong>
        <div id="e-rich" style="margin-top:9px"></div>
      </div>
    </div>`;
  $('#e-text',box).value = serializeSong(sel);
  const analyse = () => {
    const parsed = parseSong($('#e-text',box).value, $('#e-title',box).value);
    const nb = $('#e-nb',box); if (nb) nb.textContent = `${parsed.sections.length} parties`;
    const wrap = $('#e-sections',box);
    wrap.innerHTML = parsed.sections.map((s,i)=>`<div style="padding:8px 10px;margin-bottom:6px;border-left:3px solid var(--accent-2);border-radius:7px;background:var(--p-1)">
      <div class="row" style="justify-content:space-between"><strong>${esc(s.label||'Partie '+(i+1))}</strong><span class="muted small">${s.lines.length} lignes · ${chunkSection(s,Number($('#e-lines',box)?.value)||4).length} écran(s)</span></div>
      <div class="muted small" style="margin-top:4px">${esc(s.lines.slice(0,3).join(' / '))}${s.lines.length>3?'…':''}</div></div>`).join('') || '<div class="empty">Écrivez vos paroles.</div>';
  };
  $('#e-text',box).oninput = () => { analyse(); clearTimeout(saveT); saveT = setTimeout(()=>autoSave(),700); $('#e-stat',box).textContent='Sauvegarde automatique…'; };
  $('#e-lines',box).onchange = e => { store.patch({chants:{linesPerChunk:Number(e.target.value)||4}}); analyse(); refreshPreview(); };
  $('#e-save',box).onclick = async () => { await autoSave(); toast('Chant enregistré','ok'); };
  $('#e-export',box).onclick = async () => {
    const r = await formDlg('Exporter le chant',[{name:'fmt',label:'Format',type:'select',options:[{value:'json',label:'FREESTREAM (.json)'},{value:'txt',label:'Texte (.txt)'},{value:'chordpro',label:'ChordPro (.cho)'},{value:'freeshow',label:'FreeShow (.json)'}],value:'json'}]);
    if(!r) return; const ext = r.fmt==='chordpro'?'cho':r.fmt; download(`${sel.title.replace(/[^\w\- ]/g,'')}.${ext}`, exportSong(sel,r.fmt), r.fmt.includes('json')||r.fmt==='freeshow'?'application/json':'text/plain');
  };
  $('#e-del',box).onclick = async () => { if(!await confirmDlg(`Supprimer « ${sel.title} » ?`)) return; await store.remove('chants',sel._file); await reload(); sub='liste'; render(); };
  slideEditor = richEditor({placeholder:'Mise en forme de cet écran (facultatif)…',height:'110px',onChange: html => {
    const k = keyOf(sel, slideIdx);
    sel.overrides = { ...(sel.overrides||{}), [k]: sanitizeHtml(html) };
    clearTimeout(saveT); saveT = setTimeout(()=>autoSave(),600); refreshPreview();
  }});
  $('#e-rich',box).appendChild(slideEditor);
  const k = keyOf(sel,slideIdx);
  slideEditor.setValue(sel.overrides?.[k] || '');
  analyse();
}
async function autoSave() {
  if (!sel) return;
  const ta = $('#e-text',host);
  if (ta) {
    const parsed = parseSong(ta.value, $('#e-title',host)?.value || sel.title);
    sel.sections = parsed.sections; sel.meta = parsed.meta;
  }
  const ti = $('#e-title',host); if (ti) sel.title = ti.value;
  const au = $('#e-author',host); if (au) sel.author = au.value;
  const ky = $('#e-key',host); if (ky) sel.key = ky.value;
  await persist(sel);
  const st = $('#e-stat',host); if (st) st.textContent = '✓ Enregistré à ' + new Date().toLocaleTimeString('fr-FR');
  refreshPreview();
}

function renderProjection(box) {
  if (!sel) { box.innerHTML='<div class="empty">Sélectionnez un chant.</div>'; return; }
  const slides = allSlides(sel, store.state.chants.linesPerChunk||4);
  slideIdx = Math.max(0, Math.min(slideIdx, slides.length-1));
  box.innerHTML = `
    <div class="card tight" style="margin-bottom:12px">
      <div class="row"><span class="pill acc">${esc(sel.title)}</span><span class="muted small">${slides.length} écran(s) · ${store.state.chants.linesPerChunk||4} lignes/écran</span>
        <span class="spacer"></span><button class="btn" id="p-prev">◀ <kbd>←</kbd></button><button class="btn primary" id="p-next"><kbd>→</kbd> ▶</button>
        <button class="btn blue" id="p-send">📺 Envoyer les 3</button>
        <button class="btn" id="p-coeur" title="Envoie uniquement la sortie Cœur, sans toucher au plein écran ni au bas centré">♥ Cœur seul</button>
        <button class="btn danger" id="p-clear">Masquer</button></div>
    </div>
    <div class="grid2" style="grid-template-columns:1fr 1fr;align-items:start">
      <div class="card tight"><strong>Écrans</strong><div id="p-slides" class="scroll" style="max-height:54vh;margin-top:10px"></div></div>
      <div class="card tight"><strong>Contenu de l'écran courant</strong>
        <div id="p-content" style="margin-top:10px;font-size:20px;font-weight:700;line-height:1.4;min-height:140px"></div>
        <div class="sep"></div><div class="muted small">Taille de police garantie grande : le design « Chants » impose un plancher (minFontSize). Modifiez-le dans l'onglet Designs si besoin.</div>
      </div>
    </div>`;
  const list = $('#p-slides',box);
  list.innerHTML = slides.map((s,i)=>`<div class="list-item ${i===slideIdx?'sel':''}" data-i="${i}"><span class="badge-n">${i+1}</span>
      <div class="grow"><div class="t" style="white-space:pre-line">${esc(s.text.slice(0,70))}</div><div class="s">${esc(s.label||'Partie '+(s.sectionIndex+1))} · écran ${s.index+1}/${s.total}</div></div></div>`).join('');
  list.onclick = e => { const d=e.target.closest('[data-i]'); if(!d) return; slideIdx=+d.dataset.i; store.patch({chants:{currentId:sel.id,chunkIndex:slideIdx,sectionIndex:slides[slideIdx].sectionIndex}}); renderProjection(box); refreshPreview(); };
  $('#p-content',box).textContent = slides[slideIdx]?.text || '';
  $('#p-prev',box).onclick = () => step(-1);
  $('#p-next',box).onclick = () => step(1);
  $('#p-send',box).onclick = () => send();
  $('#p-coeur',box).onclick = () => sendCoeurOnly();
  $('#p-clear',box).onclick = () => clearOutput('both');
}
function step(d){ const slides=allSlides(sel,store.state.chants.linesPerChunk||4); slideIdx=Math.max(0,Math.min(slides.length-1,slideIdx+d));
  store.patch({chants:{currentId:sel.id,chunkIndex:slideIdx,sectionIndex:slides[slideIdx]?.sectionIndex||0}});
  if (sub==='projection') renderProjection($('#ch-body',host));
  refreshPreview(); if (store.state.live?.tool==='chants') send(); }

function slideVars() {
  const slides = allSlides(sel, store.state.chants.linesPerChunk||4);
  const s = slides[Math.max(0,Math.min(slideIdx,slides.length-1))] || {text:'',label:'',index:0,total:1};
  const ov = sel?.overrides?.[keyOf(sel,slideIdx)];
  const content = ov || sanitizeHtml(esc(s.text).replace(/\n/g,'<br>'));
  return { title: sel?.title||'', content, section: s.label ? `${s.label} · ${s.index+1}/${s.total}` : `${s.index+1}/${s.total}`, line1:'', line2:'' };
}
/**
 * Section suivante pour la sortie CŒUR.
 * On privilégie la prochaine SECTION (groupe) différente de la section courante ;
 * s'il n'y en a plus, on prend l'écran suivant. Ainsi le bas de l'écran annonce
 * toujours ce que l'assemblée va chanter, et non une simple redite.
 */
function nextSectionVars() {
  const slides = sel ? allSlides(sel, store.state.chants.linesPerChunk || 4) : [];
  if (!slides.length) return { next: '', nextLabel: '' };
  const cur = slides[Math.max(0, Math.min(slideIdx, slides.length - 1))] || {};
  const curSection = cur.sectionIndex ?? 0;
  let n = null;
  for (let i = slideIdx + 1; i < slides.length; i++) {
    if ((slides[i].sectionIndex ?? 0) !== curSection) { n = slides[i]; break; }
  }
  if (!n) n = slides[slideIdx + 1] || null;
  if (!n) return { next: '', nextLabel: 'FIN DU CHANT' };
  const label = n.label?.trim() ? `À SUIVRE · ${n.label}` : 'À SUIVRE · suite';
  return {
    next: sanitizeHtml(esc(n.text || '').replace(/\n/g, '<br>')),
    nextLabel: sanitizeHtml(esc(label)),
  };
}

function coeurVars() { return { ...slideVars(), ...nextSectionVars() }; }

function refreshPreview() {
  if (!sel) return;
  const v = slideVars();
  setWork({ plein:{designId:'chants:plein',vars:v}, bas:{designId:'chants:bas',vars:v}, coeur:{designId:'chants:coeur',vars:coeurVars()} });
}
function send() {
  if (!sel) return;
  const v = slideVars();
  const key = `${sel.id}|${slideIdx}`;
  sendToObs({ tool:'chants', key,
    plein:{designId:'chants:plein',vars:v},
    bas:{designId:'chants:bas',vars:v},
    coeur:{designId:'chants:coeur',vars:coeurVars()} });
}
/** Envoi isolé : ne touche ni le plein écran ni le bas centré. */
function sendCoeurOnly() {
  if (!sel) return toast('Sélectionnez un chant','err');
  store.patch({ live: { coeur: { tool:'chants', key:`${sel.id}|${slideIdx}:c`, designId:'chants:coeur', vars: coeurVars() } } });
  toast('♥ Cœur envoyé — plein écran et bas centré inchangés','ok');
}
function onKey(a){ if(!sel) return; if(a==='next'||a==='prev') return step(a==='next'?1:-1); if(a==='sendFullscreen'||a==='sendLower') return send(); }

/* --------------------------------------------------- fond & calques rapides */
function renderFond(box) {
  const d = store.state.designs?.['chants:plein'] || {};
  const bg = d.background || {};
  const ovl = (d.layers||[]).find(l=>l.type==='overlay');
  box.innerHTML = `
    <div class="card tight">
      <h3>Fond des chants — vidéo / image + calque de couleur</h3>
      <p class="muted small">Ajoutez une vidéo de fond et un voile de couleur pour garder le texte lisible. <strong>Le fond ne bouge jamais quand le texte change.</strong></p>
      <div class="row" style="margin-top:12px">
        <button class="btn" id="f-upload">📥 Ajouter un média de fond</button>
        <select class="inp" id="f-pick" style="width:auto;min-width:240px"><option value="">— Fond transparent —</option></select>
        <button class="btn primary" id="f-apply">Appliquer</button>
      </div>
      <div class="sep"></div>
      <div class="grid3">
        <div class="field"><label class="lbl">Voile de couleur</label><input type="color" id="f-color" value="${esc((ovl?.color||'rgba(0,0,0,.38)').startsWith('#')?ovl.color:'#000000')}"></div>
        <div class="field"><label class="lbl">Opacité du voile</label><input type="range" id="f-op" min="0" max="100" value="${Math.round(parseFloat((ovl?.color||'rgba(0,0,0,.38)').match(/[\d.]+\)$/)?.[0]||'.38')*100)}"></div>
        <div class="field"><label class="lbl">Type de fond</label><select class="inp" id="f-kind"><option value="transparent">Transparent (caméra)</option><option value="color">Couleur unie</option><option value="image">Image</option><option value="video">Vidéo</option></select></div>
      </div>
      <div class="row"><button class="btn primary" id="f-save">💾 Enregistrer le fond</button>
        <button class="btn" id="f-editor">🎨 Ouvrir l'éditeur de design complet</button></div>
    </div>`;
  store.list('medias').then(files => {
    const sel2 = $('#f-pick',box); if(!sel2) return;
    sel2.innerHTML = '<option value="">— Fond transparent —</option>' + files.map(f=>`<option value="/media/${encodeURIComponent(f.name)}" ${bg.src==='/media/'+f.name?'selected':''}>${esc(f.name)}</option>`).join('');
  });
  $('#f-kind',box).value = bg.kind || 'transparent';
  $('#f-upload',box).onclick = async () => { const f = await pickFile('video/*,image/*'); if(!f) return;
    try { const r = await store.upload(f,'medias'); toast(`${r.name} copié dans donnees/medias`,'ok'); renderFond(box); } catch(e){ toast('Copie impossible : '+e.message,'err'); } };
  $('#f-save',box).onclick = () => {
    const nd = structuredClone(store.state.designs['chants:plein']);
    const src = $('#f-pick',box).value;
    const kind = $('#f-kind',box).value;
    nd.background = { ...nd.background, kind: src && kind==='transparent' ? (mediaKind(src)==='video'?'video':'image') : kind, src: src||null, color:'#000000' };
    const ov = (nd.layers||[]).find(l=>l.type==='overlay');
    const col = $('#f-color',box).value, op = Number($('#f-op',box).value)/100;
    const rgba = `${col}${Math.round(op*255).toString(16).padStart(2,'0')}`;
    if (ov) ov.color = rgba; else nd.layers.unshift({id:'ovl-quick',type:'overlay',box:{x:0,y:0,w:7680,h:4320},color:rgba,opacity:1,visible:true});
    store.patch({ designs:{ 'chants:plein':nd } });
    toast('Fond enregistré — il reste figé pendant que le texte défile','ok');
  };
  $('#f-editor',box).onclick = () => { window.dispatchEvent(new CustomEvent('fs:goto',{detail:'designs'})); };
}

export { onKey };
