// Onglet MÉDIAS — 1er clic = aperçu, 2ᵉ clic = envoi vers OBS.
// Vidéos cherchables, son, documents avec diapositives, liens YouTube contrôlables.
import { store, esc, $, $$, el, toast, setWork, sendToObs, clearOutput, pickFile, confirmDlg, formDlg, fmtTime } from './core.js';
import { mediaKind, MEDIA_EXT } from '../core/config.js';
import { normalizeMediaUrl, shortName, ytPlay, ytPause, ytSeek, ytMute, ytUnMute, ytVolume, youtubeId } from '../core/media.js';

let host = null, items = [], sel = null, previewId = null, query = '', playerEl = null, tick = null;

export async function mount(container) {
  host = container;
  host.innerHTML = `
    <div class="tool-head"><h1>🎬 Médias</h1><span class="pill acc">1 clic = aperçu · 2ᵉ clic = à l'antenne (OBS)</span></div>
    <div class="op-workspace op-media-workspace">
      <aside class="op-library-panel" aria-label="Médiathèque">
        <div class="op-panel-heading"><div><strong>Médiathèque</strong><span class="op-panel-count" id="m-count"></span></div></div>
        <div class="op-media-add-actions"><button class="btn primary" id="m-add">📥 Ajouter des fichiers</button><button class="btn" id="m-path">📂 Copier chemin</button><button class="btn" id="m-link">🔗 Ajouter un lien</button><button class="btn" id="m-convert">🔄 Convertir PDF</button></div>
        <div class="op-list-search"><input class="inp" id="m-q" placeholder="🔍 Rechercher un média…" value="${esc(query)}"></div>
        <div id="m-list" class="op-list-scroll"></div>
        <div class="op-library-footer"><span class="muted small">Les fichiers sont copiés dans le projet.</span></div>
      </aside>
      <section class="op-work-panel op-media-detail">
        <div class="op-work-panel-header media-work-head"><div class="op-active-identity"><span class="op-tool-kicker">LECTEUR DE TRAVAIL</span><strong id="m-active">Sélectionnez un média</strong><span class="muted small">Préparez et vérifiez avant la diffusion</span></div><span class="pill" id="m-state">—</span></div>
        <div class="op-media-player-area"><div class="playerbox" id="m-player"><div class="ph">Cliquez une fois sur un média pour l'apercevoir.</div></div></div>
        <div class="media-ctrl" id="m-ctrl"></div>
        <div class="op-media-options">
          <label class="chk" title="Si l'image ou la vidéo n'est pas en 16:9, un fond flouté inspiré du média comble tout l'écran au lieu des bandes noires"><input type="checkbox" id="m-vig" ${store.state.settings?.mediaVignette!==false?'checked':''}> Vignette de fond</label>
          <label class="chk" title="Recadre légèrement pour occuper 100 % de l'écran (le média réel est coupé sur les bords)"><input type="checkbox" id="m-cover" ${store.state.settings?.mediaCover?'checked':''}> Remplir (recadrer)</label>
          <span class="spacer"></span>
          <button class="btn primary" id="m-send">📺 Envoyer vers OBS</button><button class="btn blue" id="m-send-bas">▭ Bas centré</button><button class="btn danger" id="m-clear">Masquer</button>
        </div>
        <div class="op-media-footnote">Aperçu de travail au centre · sorties réellement à l’antenne dans les moniteurs à droite. Les médias non 16:9 sont complétés par une vignette inspirée du contenu.</div>
      </section>
    </div>`;
  $('#m-add',host).onclick = addFiles;
  $('#m-path',host).onclick = addPath;
  $('#m-link',host).onclick = addLink;
  $('#m-convert',host).onclick = convertAll;
  $('#m-q',host).oninput = e => { query = e.target.value; paintList(); };
  $('#m-send',host).onclick = () => send('plein');
  $('#m-send-bas',host).onclick = () => send('bas');
  $('#m-clear',host).onclick = () => clearOutput('both');
  $('#m-vig',host).onchange = e => { applyMediaLook(e.target.checked, $('#m-cover',host)?.checked); };
  $('#m-cover',host).onchange = e => { applyMediaLook($('#m-vig',host)?.checked, e.target.checked); };
  await reload(); paintList();
  if (sel) paintPlayer(); else paintCtrl();
  return { onKey, destroy: () => clearInterval(tick) };
}

async function reload() {
  const files = await store.list('medias');
  const links = store.state.medias?.links || [];
  items = [
    ...files.map(f => ({ id:'f:'+f.name, name:f.name, src:'/media/'+encodeURIComponent(f.name), kind:mediaKind(f.name), size:f.size, local:true })),
    ...links.map(l => ({ id:'l:'+l.id, name:l.name, src:l.url, kind:normalizeMediaUrl(l.url).kind, youtube:!!youtubeId(l.url), link:true })),
  ];
  const requestedId = store.state.medias?.previewId;
  if (requestedId) {
    sel = items.find(x=>x.id===requestedId) || null;
    previewId = sel?.id || null;
  }
}

function paintList() {
  const box = $('#m-list',host); if (!box) return;
  const q = query.toLowerCase();
  const found = items.filter(i=>!q || i.name.toLowerCase().includes(q) || i.kind.includes(q));
  $('#m-count',host).textContent = `${found.length} élément(s)`;
  box.innerHTML = found.length ? found.map(i=>{
    const live = store.state.live?.tool==='medias' && store.state.medias?.activeId===i.id;
    const pv = previewId===i.id;
    return `<div class="media-item ${pv?'previewing':''} ${live?'live':''}" data-id="${esc(i.id)}">
      <div class="thumb">${i.kind==='video'?'🎞':i.kind==='image'?'🖼':i.kind==='doc'?'📄':i.kind==='audio'?'♫':i.youtube?'▶':'🔗'}</div>
      <div class="grow"><div class="nm">${esc(i.name)}</div><div class="mt">${esc(i.kind)}${i.size?' · '+(i.size/1048576).toFixed(1)+' Mo':''}${live?' · <span style="color:var(--danger)">À L’ANTENNE</span>':pv?' · en aperçu':''}</div></div>
      <button class="btn xs ren" data-id="${esc(i.id)}">✎</button><button class="btn xs dup" data-id="${esc(i.id)}">⧉</button>
      <button class="btn xs danger del" data-id="${esc(i.id)}">✕</button></div>`;
  }).join('') : '<div class="empty">Aucun média. Ajoutez des fichiers — ils seront COPIÉS dans donnees/medias.</div>';
  box.onclick = async e => {
    const ren=e.target.closest('.ren'), dup=e.target.closest('.dup'), del=e.target.closest('.del');
    const id = (ren||dup||del)?.dataset.id;
    if (ren) { const it=items.find(x=>x.id===id); const r=await formDlg('Renommer',[{name:'n',label:'Nom',value:it.name}]); if(!r?.n) return;
      if (it.link) { const links=[...(store.state.medias.links||[])]; const l=links.find(x=>'l:'+x.id===id); if(l) l.name=r.n; store.patch({medias:{links}}); }
      else { try { await fetch('/api/rename',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({folder:'medias',old:it.name,new:r.n})}).catch(()=>{}); } catch{} }
      await reload(); paintList(); return; }
    if (dup) { const it=items.find(x=>x.id===id);
      if (it.link) { const links=[...(store.state.medias.links||[])]; links.push({...links.find(x=>'l:'+x.id===id),id:'lnk-'+Date.now().toString(36),name:it.name+' (copie)'}); store.patch({medias:{links}}); toast('Lien dupliqué','ok'); }
      else {
        const r = await store.duplicate('medias', it.name);
        if (r?.ok) toast(`Copie réelle créée : ${r.name}`,'ok');
        else toast('Duplication impossible — vérifiez le serveur','err');
      }
      await reload(); paintList(); return; }
    if (del) { const it=items.find(x=>x.id===id); if(!await confirmDlg(`Supprimer « ${it.name} » ?`)) return;
      if (it.link) { store.patch({medias:{links:(store.state.medias.links||[]).filter(x=>'l:'+x.id!==id)}}); }
      else await store.remove('medias', it.name);
      if (previewId===id) previewId=null; await reload(); paintList(); return; }
    const d = e.target.closest('[data-id]'); if (!d) return;
    const id2 = d.dataset.id;
    if (previewId !== id2) { previewId = id2; sel = items.find(x=>x.id===id2); store.patch({medias:{previewId:id2}}); paintList(); paintPlayer(); toast('Aperçu chargé — cliquez une 2ᵉ fois pour envoyer à OBS'); }
    else { sel = items.find(x=>x.id===id2); send('plein'); paintList(); }
  };
}

async function addFiles() {
  const fs = await pickFile('video/*,audio/*,image/*,.pdf,.pptx,.ppt,.docx,.mp4,.webm,.mov,.mkv,.mp3,.wav,.png,.jpg,.jpeg,.webp', true);
  if (!fs?.length) return;
  let n=0;
  for (const f of fs) { try { await store.upload(f,'medias'); n++; } catch(e){ toast(`${f.name} : ${e.message}`,'err'); } }
  await reload(); paintList(); toast(`${n} fichier(s) copié(s) dans donnees/medias`,'ok');
}
async function addPath() {
  const r = await formDlg('Copier un fichier extérieur', [{name:'src',label:'Chemin complet (ex. D:\\Vidéos\\clip.mp4)',placeholder:'D:\\…'}]);
  if (!r?.src) return;
  try { const out = await store.copyExternal(r.src,'medias'); await reload(); paintList(); toast(`${out.name} copié dans le projet`,'ok'); }
  catch(e){ toast('Copie impossible : '+e.message,'err'); }
}
async function addLink() {
  const r = await formDlg('Ajouter un lien', [{name:'name',label:'Nom affiché',value:'Vidéo en ligne'},{name:'url',label:'URL (YouTube, live, MP4, image, PDF…)',placeholder:'https://…'}]);
  if (!r?.url) return;
  const links = [...(store.state.medias?.links||[]), { id:'lnk-'+Date.now().toString(36), name:r.name||shortName(r.url), url:r.url }];
  store.patch({ medias:{ links } }); await reload(); paintList();
  toast(youtubeId(r.url) ? 'Lien YouTube ajouté (live ou VOD) — contrôlable depuis la régie' : 'Lien ajouté','ok');
}
async function convertAll() {
  try {
    const chk = await (await fetch('/api/convert/check')).json();
    if (!chk.available) return toast('LibreOffice absent. Installez-le, ou exportez vos diapositives en PDF/PNG puis ajoutez-les.','err');
  } catch { return toast('Serveur indisponible','err'); }
  const docs = items.filter(i=>/\.(pptx?|docx)$/i.test(i.name));
  if (!docs.length) return toast('Aucun PPTX/DOCX à convertir.');
  for (const d of docs) {
    toast(`Conversion de ${d.name}…`);
    const r = await (await fetch('/api/convert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:d.name,to:'pdf'})})).json();
    toast(r.ok ? `${r.name} converti en PDF` : (r.reason||'Échec'), r.ok?'ok':'err');
  }
  await reload(); paintList();
}

function paintPlayer() {
  const box = $('#m-player',host); if (!box) return;
  clearInterval(tick);
  box.innerHTML = '';
  if (!sel) { box.innerHTML = '<div class="ph">Cliquez une fois sur un média pour l\'apercevoir.</div>'; $('#m-state',host).textContent='—'; $('#m-active',host).textContent='Sélectionnez un média'; paintCtrl(); return; }
  const n = normalizeMediaUrl(sel.src);
  $('#m-state',host).textContent = sel.kind + (n.youtube?' · YouTube':'');
  $('#m-active',host).textContent = sel.name;
  if (n.kind === 'image') { const im=document.createElement('img'); im.src=n.src; box.appendChild(im); }
  else if (n.kind === 'video') {
    const v=document.createElement('video'); v.src=n.src; v.controls=true; v.playsInline=true; v.preload='metadata';
    box.appendChild(v); playerEl=v;
    v.onloadedmetadata = () => paintCtrl();
    v.ontimeupdate = () => { const s=$('#m-seek',host); if(s && document.activeElement!==s) s.value=v.currentTime; const t=$('#m-time',host); if(t) t.textContent=fmtTime(v.currentTime*1000)+' / '+fmtTime((v.duration||0)*1000); };
    v.onended = () => { if (store.state.medias?.loop) { v.currentTime=0; v.play(); } };
    setTimeout(()=>v.play().catch(()=>{}),80);
    tick = setInterval(() => { if (store.state.live?.tool==='medias' && store.state.medias.activeId===sel.id && !v.paused && Math.abs((store.state.medias.time||0)-v.currentTime)>1) store.patch({medias:{time:v.currentTime}}); }, 1200);
  }
  else if (n.kind === 'audio') { const a=document.createElement('audio'); a.src=n.src; a.controls=true; a.style.cssText='width:92%;margin:22% 4%'; box.appendChild(a); playerEl=a; a.play().catch(()=>{}); }
  else if (n.kind === 'doc') {
    const slide = store.state.medias?.slide || 1;
    const f=document.createElement('iframe'); f.src=n.src+`#page=${slide}&toolbar=0&navpanes=0`; box.appendChild(f); playerEl=f;
  }
  else { const f=document.createElement('iframe'); f.src=n.src; f.setAttribute('allow','autoplay; encrypted-media; picture-in-picture'); box.appendChild(f); playerEl=f; }
  paintCtrl();
}

function paintCtrl() {
  const box = $('#m-ctrl',host); if (!box) return;
  const m = store.state.medias || {};
  const isVideo = sel && (sel.kind==='video' || normalizeMediaUrl(sel.src).kind==='video');
  const isDoc = sel && normalizeMediaUrl(sel.src).kind==='doc';
  const isYt = sel && !!youtubeId(sel.src);
  if (!sel) { box.innerHTML = '<div class="hint">Aucun média sélectionné.</div>'; return; }
  box.innerHTML = `
    ${isVideo||isYt ? `<div class="row">
      <button class="btn" id="c-play">${m.playing?'⏸ Pause':'▶ Lecture'}</button>
      <button class="btn" id="c-mute">${m.muted?'🔇 Muet':'🔊 Son'}</button>
      <input type="range" class="seek grow" id="c-vol" min="0" max="100" value="${Math.round((m.volume??1)*100)}" title="Volume">
      <label class="chk"><input type="checkbox" id="c-loop" ${m.loop?'checked':''}> Boucle</label></div>
      <div class="row"><span class="muted small" id="c-time">00:00</span>
      <input type="range" class="seek grow" id="m-seek" min="0" max="${isVideo?(playerEl?.duration||100):3600}" step="0.1" value="${m.time||0}">
      <input class="inp" id="c-start" type="number" min="0" step="1" value="0" style="width:88px" title="Démarrer à (secondes)">
      <button class="btn" id="c-go">⤓ Démarrer à</button></div>
      <div class="hint">Vidéo servie en HTTP Range : la lecture d'un fichier de 30 min reste fluide et cherchable, sans charger tout le fichier.</div>` : ''}
    ${isDoc ? `<div class="row"><button class="btn" id="d-prev">◀ Diapo</button><span class="pill">Diapo <span id="d-num">${m.slide||1}</span></span>
      <button class="btn" id="d-next">Diapo ▶</button><input class="inp" id="d-count" type="number" min="1" value="${m.slideCount||1}" style="width:90px" title="Nombre total">
      <button class="btn" id="d-set">Définir total</button></div>
      <div class="hint">PDF : navigation page par page. PPTX/DOCX : convertissez en PDF avec le bouton ci-dessus, puis contrôlez les diapositives ici.</div>` : ''}
    ${isYt ? '<div class="hint">Lien YouTube (VOD ou direct) : lecture/pause/son/volume pilotés depuis la régie et répercutés dans OBS. Nécessite Internet pour cette source uniquement.</div>' : ''}`;
  const c = id => $(id,host);
  if (c('#c-play')) c('#c-play').onclick = () => { const p = !(store.state.medias.playing); store.patch({medias:{playing:p}}); if(isVideo){ p?playerEl.play().catch(()=>{}):playerEl.pause(); } else if(isYt){ p?ytPlay(box.closest('.card').querySelector('iframe')):ytPause(box.closest('.card').querySelector('iframe')); } paintCtrl(); pushMedia(); };
  if (c('#c-mute')) c('#c-mute').onclick = () => { const mu=!store.state.medias.muted; store.patch({medias:{muted:mu}}); if(isVideo) playerEl.muted=mu; else if(isYt){ mu?ytMute($('#m-player iframe',host)):ytUnMute($('#m-player iframe',host)); } paintCtrl(); pushMedia(); };
  if (c('#c-vol')) c('#c-vol').oninput = e => { const v=Number(e.target.value)/100; store.patch({medias:{volume:v}}); if(isVideo) playerEl.volume=v; else if(isYt) ytVolume($('#m-player iframe',host),v); pushMedia(); };
  if (c('#c-loop')) c('#c-loop').onchange = e => { store.patch({medias:{loop:e.target.checked}}); if(isVideo) playerEl.loop=e.target.checked; pushMedia(); };
  if (c('#m-seek')) c('#m-seek').onchange = e => { const t=Number(e.target.value); store.patch({medias:{time:t,seekToken:Date.now()}}); if(isVideo) playerEl.currentTime=t; else if(isYt) ytSeek($('#m-player iframe',host),t); pushMedia(); };
  if (c('#c-go')) c('#c-go').onclick = () => { const t=Number(c('#c-start').value)||0; store.patch({medias:{time:t,seekToken:Date.now(),playing:true}}); if(isVideo){playerEl.currentTime=t;playerEl.play().catch(()=>{});} else if(isYt){ytSeek($('#m-player iframe',host),t);ytPlay($('#m-player iframe',host));} paintCtrl(); pushMedia(); };
  if (c('#d-prev')) c('#d-prev').onclick = () => slide(-1);
  if (c('#d-next')) c('#d-next').onclick = () => slide(1);
  if (c('#d-set')) c('#d-set').onclick = () => { store.patch({medias:{slideCount:Number(c('#d-count').value)||1}}); pushMedia(); };
}
function slide(d){ const m=store.state.medias; const n=Math.max(1,Math.min(m.slideCount||999,(m.slide||1)+d)); store.patch({medias:{slide:n}}); paintCtrl(); pushMedia(); paintPlayer(); }
function pushMedia(){ if (store.state.live?.tool==='medias' && store.state.medias.activeId===sel?.id) send('plein', true); }

/** Modifie le calque média du design (même moteur côté preview et côté OBS). */
function applyMediaLook(vignette, cover) {
  store.patch({ settings: { mediaVignette: !!vignette, mediaCover: !!cover } });
  const designs = { ...(store.state.designs || {}) };
  for (const k of ['medias:plein']) {
    const d = designs[k]; if (!d) continue;
    const nd = structuredClone(d);
    for (const l of nd.layers || []) if (l.type === 'media') {
      l.vignette = !!vignette;
      l.fit = cover ? 'cover' : 'contain';
    }
    designs[k] = nd;
  }
  store.patch({ designs });
  toast(vignette ? 'Vignette de fond activée — plus de bandes noires' : 'Vignette désactivée', 'ok');
  if (sel && store.state.live?.tool === 'medias') send('plein', true);
}

function send(which='plein', quiet=false) {
  if (!sel) return toast('Sélectionnez d\'abord un média','err');
  const n = normalizeMediaUrl(sel.src);
  const m = store.state.medias;
  const media = { src:n.src, kind:n.kind, youtube:n.youtube, playing:m.playing??true, muted:m.muted??false,
    volume:m.volume??1, currentTime:m.time||0, seekToken:m.seekToken||0, loop:m.loop??false, slide:m.slide||1 };
  const vars = { title: sel.name.replace(/\.[^.]+$/,'') };
  const opts = { tool:'medias', key:`${sel.id}|${m.slide||1}|${m.playing}|${m.muted}` };
  if (which==='plein') opts.plein = { designId:'medias:plein', vars:{...vars, mediaSrc:n.src}, media };
  else opts.bas = { designId:'medias:bas', vars };
  sendToObs(opts);
  store.patch({ medias:{ activeId:sel.id, previewId:sel.id, slide:m.slide||1, slideCount:m.slideCount||1 } });
  if (!quiet) paintList();
}
function onKey(a){ if(a==='next') return items.length ? (()=>{const i=items.findIndex(x=>x.id===sel?.id); sel=items[(i+1)%items.length]; previewId=sel.id; paintList(); paintPlayer(); send('plein');})() : null;
  if(a==='prev') { const i=items.findIndex(x=>x.id===sel?.id); sel=items[(i-1+items.length)%items.length]; previewId=sel.id; paintList(); paintPlayer(); send('plein'); }
  if(a==='sendFullscreen') send('plein'); if(a==='sendLower') send('bas'); }
export { onKey };
