// Onglet BIBLE — recherche ultra-rapide, découpage des versets longs, multi-versions.
import { store, esc, $, $$, el, toast, richEditor, setWork, sendToObs, clearOutput, pickFile, download, confirmDlg, formDlg } from './core.js';
import { BOOKS, searchBooks, parseReference, formatRef, stepVerse, chapterList, searchVerses, getBook } from '../core/bible-utils.js';
import { listVersions, loadVersion, getVerse, getRange, verseCount, refKey, importBible, fetchOnlineVerse } from '../core/bible-data.js';
import { splitText, partsForLength } from '../core/measure.js';
import { sanitizeHtml, toPlainText, sliceHtml } from '../core/sanitize.js';

let versions = [], cur = null, host = null, sub = 'lecture';
let suggestOpen = false, suggestHi = 0, suggestList = [];
let contentEdit = null, dirtyTimer = null;

export async function mount(container) {
  host = container;
  host.innerHTML = `
    <div class="tool-head"><h1>📖 Bible</h1><span class="pill acc">Tapez 1–2 lettres → Entrée → chapitre → Espace → verset → Entrée</span></div>
    <div class="subtabs" id="bib-sub">
      <button class="subtab on" data-s="lecture">Lecture & projection</button>
      <button class="subtab" data-s="recherche">Recherche / favoris</button>
      <button class="subtab" data-s="versions">Versions & import</button>
      <button class="subtab" data-s="reglages">Réglages de découpage</button>
    </div>
    <div id="bib-body"></div>`;
  $('#bib-sub', host).onclick = e => { const b = e.target.closest('button[data-s]'); if (!b) return; sub = b.dataset.s; $$('#bib-sub .subtab',host).forEach(x=>x.classList.toggle('on',x===b)); render(); };
  versions = await listVersions(store);
  if (!versions.length) toast('Aucune Bible trouvée — importez une version dans l\'onglet « Versions & import ».', 'err');
  render();
  return { onKey };
}

function B() { return store.state.bible; }
function primary() { return versions.find(v => v.id === B().version) || versions[0] || null; }
async function datasets() {
  const out = [];
  for (const id of (B().versions || [B().version]).slice(0, 3)) {
    const v = versions.find(x => x.id === id);
    if (v) out.push(v);
  }
  if (!out.length && primary()) out.push(primary());
  return out;
}

/* ----------------------------------------------------------------- rendu */
function render() {
  const body = $('#bib-body', host);
  if (!body) return;
  if (sub === 'lecture') renderLecture(body);
  else if (sub === 'recherche') renderRecherche(body);
  else if (sub === 'versions') renderVersions(body);
  else renderReglages(body);
  refreshPreview();
}

function renderLecture(box) {
  const b = B();
  box.innerHTML = `
    <div class="op-workspace op-bible-workspace">
      <aside class="op-library-panel" aria-label="Livres de la Bible">
        <div class="op-panel-heading"><div><strong>Livres</strong><span id="b-book-count" class="op-panel-count"></span></div></div>
        <div class="op-list-search bible-search">
          <input class="inp" id="b-book" autocomplete="off" placeholder="Chercher un livre (ex. Jean)…" value="">
          <div class="suggest hidden" id="b-sug"></div>
        </div>
        <div class="op-list-scroll" id="b-book-list"></div>
        <div class="op-library-footer"><span class="pill">${esc(primary()?.name || 'Aucune version')}</span><button class="btn xs" id="b-versions-shortcut">+ Version</button></div>
      </aside>

      <section class="op-work-panel">
        <div class="op-work-panel-header bible-work-head">
          <div class="op-active-identity"><span class="op-tool-kicker">BIBLE · VERSION ACTIVE</span><strong id="b-active-book">${esc(b.book)}</strong><span id="b-count" class="muted small"></span></div>
          <div class="op-smart-nav">
            <label><span>Chapitre</span><input class="inp" id="b-chap" inputmode="numeric" value="${b.chapter}" aria-label="Chapitre"></label>
            <label><span>Verset</span><input class="inp" id="b-verse" inputmode="numeric" value="${b.verse}" aria-label="Verset"></label>
            <button class="btn primary" id="b-go" title="Charger le chapitre et le verset">Aller ↵</button>
          </div>
        </div>

        <div class="op-chapter-row"><span class="op-section-label">CHAPITRES</span><div class="op-chapter-strip" id="b-chapters"></div></div>
        <div class="op-reading-options">
          <label class="chk"><input type="checkbox" id="b-split" ${b.splitMode?'checked':''}> Découpage du bas centré</label>
          <label class="chk"><input type="checkbox" id="b-mirror" ${b.mirrorToPlein?'checked':''}> Même texte en plein</label>
          <span class="spacer"></span>
          <button class="btn xs" id="b-prev">◀ Précédent</button><button class="btn xs" id="b-next">Suivant ▶</button>
        </div>

        <div class="op-verses-heading"><div><strong>Jean ${b.chapter} — choisissez un verset</strong><span id="b-parts-count" class="muted small"></span></div><span class="pill acc" id="b-ref">—</span></div>
        <div class="op-verse-scroll"><div class="op-verse-list" id="b-grid"></div></div>

        <div class="op-current-verse">
          <div class="op-current-head"><span class="op-tool-kicker">VERSET SÉLECTIONNÉ</span><span class="pill" id="b-vtag">—</span></div>
          <div class="op-current-reading" id="b-reading" aria-live="polite">Choisissez un verset dans la liste pour le lire ici.</div>
          <div class="op-parts-row"><span class="op-section-label">SECTIONS · BAS CENTRÉ</span><div class="parts-bar" id="b-parts"></div></div>
          <details class="op-verse-editor"><summary>Modifier / annoter le texte affiché</summary><div id="b-editor-host"></div></details>
          <details class="op-version-details"><summary>Versions affichées simultanément</summary><div id="b-vers"></div></details>
          <div class="row op-send-row">
            <button class="btn primary" id="b-send-p">Plein écran <kbd>F</kbd></button>
            <button class="btn blue" id="b-send-b">Bas centré <kbd>S</kbd></button>
            <button class="btn" id="b-send-both">Les deux</button>
            <button class="btn danger" id="b-clear">Masquer</button>
          </div>
        </div>
      </section>
    </div>`;

  const bookIn = $('#b-book', box), chapIn = $('#b-chap', box), verseIn = $('#b-verse', box);
  paintBookList(''); paintChapters();
  bookIn.addEventListener('input', () => {
    const query=bookIn.value.trim();
    if(query) showSuggest(query); else $('#b-sug',box)?.classList.add('hidden');
    paintBookList(query);
  });
  bookIn.addEventListener('focus', () => { if(bookIn.value.trim()) showSuggest(bookIn.value); });
  bookIn.addEventListener('blur', () => setTimeout(() => $('#b-sug',box)?.classList.add('hidden'), 160));
  bookIn.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); suggestHi = Math.min(suggestList.length-1, suggestHi+1); paintSuggest(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); suggestHi = Math.max(0, suggestHi-1); paintSuggest(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const first = bookIn.value.trim() ? (suggestList[suggestHi] || suggestList[0]) : null;
      if (!first) return;
      store.patch({ bible:{ book:first.name, chapter:1, verse:1, partIndex:0 } }); bookIn.value = ''; chapIn.value = 1; verseIn.value = 1;
      $('#b-sug',box)?.classList.add('hidden');
      recalc(); render();
      $('#b-chap',host)?.focus(); $('#b-chap',host)?.select();
    } else if (e.key === 'Escape') $('#b-sug',box)?.classList.add('hidden');
  });
  chapIn.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === ':' || e.key === '.') { e.preventDefault(); verseIn.focus(); verseIn.select(); }
    else if (e.key === 'Enter') { e.preventDefault(); applyInputs(); }
  });
  chapIn.addEventListener('change', () => applyInputs());
  verseIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyInputs(); } });
  $('#b-go',box).onclick = applyInputs;
  $('#b-versions-shortcut',box).onclick = () => { sub='versions'; $$('#bib-sub .subtab',host).forEach(x=>x.classList.toggle('on',x.dataset.s==='versions')); render(); };
  $('#b-prev',box).onclick = () => step(-1);
  $('#b-next',box).onclick = () => step(1);
  $('#b-split',box).onchange = e => { store.patch({ bible:{ splitMode:e.target.checked, partIndex:0 } }); recalc(); render(); };
  $('#b-mirror',box).onchange = e => { store.patch({ bible:{ mirrorToPlein:e.target.checked } }); render(); };
  $('#b-send-p',box).onclick = () => send('plein');
  $('#b-send-b',box).onclick = () => send('bas');
  $('#b-send-both',box).onclick = () => send('both');
  $('#b-clear',box).onclick = () => clearOutput('both');

  contentEdit = richEditor({ placeholder:'Texte du verset…', html:'', height:'150px', onChange: onEdit });
  $('#b-editor-host',box).appendChild(contentEdit);

  renderVersionsList();
  recalc();
  paintBookList(''); paintChapters();
  paintVerseGrid();
  paintParts();
  paintText();
}

function applyInputs() {
  const bookInput = $('#b-book',host).value.trim();
  const book = bookInput || B().book;
  const parsed = parseReference(`${book} ${$('#b-chap',host).value} ${$('#b-verse',host).value}`);
  if (!parsed?.book) { toast('Livre introuvable — essayez les premières lettres', 'err'); return; }
  store.patch({ bible:{ book:parsed.book.name, chapter:parsed.chapter, verse:parsed.verse, toVerse:parsed.toVerse, partIndex:0 } });
  $('#b-book',host).value = '';
  $('#b-chap',host).value = parsed.chapter;
  $('#b-verse',host).value = parsed.verse;
  recalc(); paintBookList(''); paintChapters(); paintVerseGrid(); paintParts(); paintText(); refreshPreview();
}

function showSuggest(q) {
  const sug = $('#b-sug',host); if (!sug) return;
  suggestList = searchBooks(q, 10); suggestHi = 0;
  sug.classList.remove('hidden'); paintSuggest();
}
function paintSuggest() {
  const sug = $('#b-sug',host); if (!sug) return;
  sug.innerHTML = suggestList.length ? suggestList.map((b,i)=>`<div class="${i===suggestHi?'hi':''}" data-i="${i}"><span>${esc(b.name)}</span><span class="abbr">${esc(b.id.toUpperCase())} · ${b.chapters} ch.</span></div>`).join('') : '<div class="muted">Aucun livre</div>';
  sug.onclick = e => { const d = e.target.closest('[data-i]'); if (!d) return; const b = suggestList[+d.dataset.i];
    store.patch({ bible:{ book:b.name, chapter:1, verse:1, partIndex:0 } }); sug.classList.add('hidden');
    $('#b-book',host).value = ''; $('#b-chap',host).value = 1; $('#b-verse',host).value = 1;
    recalc(); render(); $('#b-chap',host)?.focus(); $('#b-chap',host)?.select(); };
}

async function currentTexts() {
  const b = B(), ds = await datasets();
  const book = b.book, ch = b.chapter, v = b.verse;
  const out = [];
  for (const d of ds) {
    let text = getVerse(d.dataset, book, ch, v);
    if (!text && b.toVerse) text = getRange(d.dataset, book, ch, v, b.toVerse).map(x=>x.text).join(' ');
    const k = refKey(d.id, { book, chapter:ch, verse:v, toVerse:b.toVerse });
    const ov = b.overrides?.[k];
    out.push({ id:d.id, name:d._meta?.short || d.name, label:d.name, text: ov?.html || sanitizeHtml(esc(text || '—')), raw: text || '', missing: !text, edited: !!ov });
  }
  if (!out.length) out.push({ id:'?', name:'—', label:'Aucune version', text:'Importez une Bible dans l\'onglet « Versions & import ».', raw:'', missing:true });
  return out;
}

function fullContentHtml(texts) {
  if (texts.length === 1) return texts[0].text;
  return texts.map((t,i) => `<div style="display:block;${i?'font-size:.68em;opacity:.94;margin-top:.35em;border-top:2px solid rgba(255,255,255,.25);padding-top:.28em':''}"><span style="font-size:.55em;opacity:.7;letter-spacing:.08em">${esc(t.name)}</span><br>${t.text}</div>`).join('');
}

function recalc() {
  const b = B();
  const v = primary();
  const raw = v ? (getVerse(v.dataset, b.book, b.chapter, b.verse) || '') : '';
  const n = b.splitMode ? partsForLength(raw, b.splitMaxChars || 150) : 1;
  const parts = n > 1 ? splitText(raw, n) : [raw];
  const old = b.parts || [];
  if (JSON.stringify(old) !== JSON.stringify(parts)) store.patch({ bible:{ parts, partIndex: Math.min(b.partIndex||0, parts.length-1) } });
}
function paintBookList(query='') {
  const list = $('#b-book-list',host), count = $('#b-book-count',host);
  if (!list) return;
  const version = primary();
  const available = Object.keys(version?.dataset?.books || {});
  const availableNames = BOOKS.filter(book => available.includes(book.name));
  const q = String(query||'').trim();
  const found = q ? searchBooks(q, 66).filter(book=>availableNames.some(a=>a.id===book.id)) : availableNames;
  if (count) count.textContent = `${availableNames.length} disponibles`;
  list.innerHTML = found.length ? found.map(book=>`<button class="op-book-row ${book.name===B().book?'selected':''}" data-book="${esc(book.name)}" type="button">
      <span class="op-book-abbr">${esc(book.id.toUpperCase())}</span><span class="op-book-name">${esc(book.name)}</span><span class="op-book-meta">${book.chapters}</span>
    </button>`).join('') : '<div class="op-empty">Aucun livre trouvé dans cette version.</div>';
  list.onclick = e => {
    const row=e.target.closest('[data-book]'); if(!row) return;
    store.patch({bible:{book:row.dataset.book,chapter:1,verse:1,toVerse:null,partIndex:0}});
    $('#b-book',host).value=''; $('#b-chap',host).value='1'; $('#b-verse',host).value='1';
    recalc(); paintBookList(''); paintChapters(); paintVerseGrid(); paintParts(); paintText(); refreshPreview();
  };
}

function paintChapters() {
  const strip=$('#b-chapters',host), b=B(), version=primary(); if(!strip) return;
  const chapters=Object.keys(version?.dataset?.books?.[b.book]||{}).map(Number).sort((a,c)=>a-c);
  strip.innerHTML=chapters.length?chapters.map(ch=>`<button class="op-chapter-btn ${ch===b.chapter?'selected':''}" data-chapter="${ch}" type="button">${ch}</button>`).join(''):'<span class="op-empty-inline">Aucun chapitre importé pour ce livre.</span>';
  strip.onclick=e=>{const btn=e.target.closest('[data-chapter]');if(!btn)return;
    store.patch({bible:{chapter:+btn.dataset.chapter,verse:1,toVerse:null,partIndex:0}});
    $('#b-chap',host).value=btn.dataset.chapter;$('#b-verse',host).value='1';recalc();paintChapters();paintVerseGrid();paintParts();paintText();refreshPreview();};
}

function paintVerseGrid() {
  const grid = $('#b-grid',host), b = B(); if (!grid) return;
  const version = primary();
  const ch = version?.dataset?.books?.[b.book]?.[String(b.chapter)] || {};
  const nums = Object.keys(ch).map(Number).sort((a,c)=>a-c);
  const max = b.splitMaxChars || 150;
  grid.innerHTML = nums.length ? nums.map(n => {
    const text=String(ch[n]||'');
    const parts=b.splitMode?partsForLength(text,max):1;
    const long=b.splitMode&&parts>1;
    return `<article class="vbtn op-verse-card ${n===b.verse?'selected':''} ${long?'has-parts':''}" data-v="${n}" tabindex="0" role="button" aria-pressed="${n===b.verse}" title="${text.length} caractères${long?' · '+parts+' sections':''}">
      <span class="op-verse-number">${n}</span><span class="op-verse-text">${esc(text)}</span>
      <button type="button" class="op-verse-show" data-show-verse="${n}" title="Afficher ce verset dans les sorties">Afficher ↗</button>
      ${long?`<span class="op-verse-part-count">${parts} sections</span>`:''}
    </article>`;
  }).join('') : '<div class="op-empty">Aucun verset dans ce chapitre. Importez une Bible complète dans « Versions & import ».</div>';
  grid.onclick = e => {
    const show=e.target.closest('[data-show-verse]');
    const card=e.target.closest('[data-v]'); if(!card)return;
    const verse=Number((show||card).dataset.showVerse || card.dataset.v);
    store.patch({bible:{verse,toVerse:null,partIndex:0}});$('#b-verse',host).value=String(verse);
    recalc();paintVerseGrid();paintParts();paintText();refreshPreview();
    if(show) send('both');
  };
  grid.onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-v]')){e.preventDefault();e.target.click();}};
  const c=$('#b-count',host);if(c)c.textContent=`${nums.length} versets`;
  const book=$('#b-active-book',host);if(book)book.textContent=b.book;
  const title=$('.op-verses-heading strong',host);if(title)title.textContent=`${b.book} ${b.chapter} — choisissez un verset`;
}

function paintParts() {
  const box = $('#b-parts',host), b = B(); if (!box) return;
  const parts = b.parts || [''];
  box.innerHTML = parts.map((p,i)=>`<button class="partbtn ${i===b.partIndex?'sel':''}" data-i="${i}">${i+1}/${parts.length}<span class="muted" style="font-weight:400"> · ${p.split(/\s+/).length} mots</span></button>`).join('');
  box.onclick = e => { const btn = e.target.closest('[data-i]'); if (!btn) return;
    store.patch({ bible:{ partIndex:+btn.dataset.i } }); paintParts(); refreshPreview(); };
  const c = $('#b-parts-count',host); if (c) c.textContent = parts.length > 1 ? `${parts.length} sections (découpage automatique)` : 'verset court — 1 section';
}
async function paintText() {
  const b = B();
  const texts = await currentTexts();
  const ref = formatRef(b.book, b.chapter, b.verse, b.toVerse);
  const set = (s,v) => { const e = $(s,host); if (e) e.textContent = v; };
  set('#b-ref', ref); set('#b-vtag', texts.map(t=>t.name).join(' + '));
  const reading=$('#b-reading',host); if(reading) reading.innerHTML=texts.map((t,i)=>`<div class="op-reading-version ${i?'secondary':''}">${texts.length>1?`<small>${esc(t.name)}</small>`:''}${t.text}</div>`).join('');
  if (contentEdit && document.activeElement !== contentEdit.area) contentEdit.setValue(texts[0]?.text || '');
  refreshPreview(texts);
}

function onEdit(html) {
  const b = B();
  const k = refKey(b.version, { book:b.book, chapter:b.chapter, verse:b.verse, toVerse:b.toVerse });
  clearTimeout(dirtyTimer);
  dirtyTimer = setTimeout(() => {
    store.patch({ bible:{ overrides:{ ...(b.overrides||{}), [k]: { html: sanitizeHtml(html), at:Date.now() } } } });
    refreshPreview();
  }, 350);
}

async function refreshPreview(texts) {
  const b = B();
  const list = texts || await currentTexts();
  const ref = formatRef(b.book, b.chapter, b.verse, b.toVerse);
  const full = fullContentHtml(list);
  const part = (b.parts || [''])[Math.min(b.partIndex||0, (b.parts||[]).length-1)] || '';
  const partHtml = sanitizeHtml(esc(part));
  const vnames = list.map(t=>t.name).join(' · ');
  const pleinContent = b.mirrorToPlein && (b.parts||[]).length > 1 ? partHtml : full;
  const varsPlein = { reference:ref, content:pleinContent, version:vnames };
  const varsBas = { reference:ref, content:(b.parts||[]).length > 1 ? partHtml : full, version:vnames };
  setWork({ plein:{ designId:'bible:plein', vars:varsPlein }, bas:{ designId:'bible:bas', vars:varsBas } });
}

async function send(which, keep = null) {
  const b = B();
  const list = await currentTexts();
  const ref = formatRef(b.book, b.chapter, b.verse, b.toVerse);
  const full = fullContentHtml(list);
  const part = (b.parts||[''])[Math.min(b.partIndex||0,(b.parts||[]).length-1)] || '';
  const partHtml = sanitizeHtml(esc(part));
  const vnames = list.map(t=>t.name).join(' · ');
  const pleinContent = b.mirrorToPlein && (b.parts||[]).length > 1 ? partHtml : full;
  const opts = { tool:'bible', key:`${ref}|${b.partIndex}`, keep };
  if (which === 'plein') opts.plein = { designId:'bible:plein', vars:{ reference:ref, content:pleinContent, version:vnames } };
  else if (which === 'bas') opts.bas = { designId:'bible:bas', vars:{ reference:ref, content:(b.parts||[]).length>1?partHtml:full, version:vnames } };
  else { opts.plein = { designId:'bible:plein', vars:{ reference:ref, content:pleinContent, version:vnames } };
         opts.bas = { designId:'bible:bas', vars:{ reference:ref, content:(b.parts||[]).length>1?partHtml:full, version:vnames } }; }
  sendToObs(opts);
  store.patch({ bible:{ history:[...(b.history||[]).slice(-29), { book:b.book, chapter:b.chapter, verse:b.verse }] } });
}

/** Flèches : le bas-centré avance section par section ; le plein ne bouge qu'à la fin. */
async function step(delta) {
  const b = B();
  recalc();
  const parts = store.state.bible.parts || [''];
  const idx = store.state.bible.partIndex || 0;
  if (parts.length > 1 && idx + delta >= 0 && idx + delta < parts.length) {
    store.patch({ bible:{ partIndex: idx + delta } });
    paintParts(); await refreshPreview();
    // Par défaut le plein écran ne bouge PAS : envoi partiel qui le PRÉSERVE.
    // Si l'option « Plein = bas (grand) » est activée, les deux suivent la section.
    if (store.state.live?.tool === 'bible' && store.state.live?.lower) {
      if (b.mirrorToPlein) send('both'); else send('bas', 'fullscreen');
    }
    return;
  }
  const v = primary();
  const count = v ? verseCount(v.dataset, b.book, b.chapter) : 30;
  const next = stepVerse({ book:b.book, chapter:b.chapter, verse:b.verse, toVerse:null }, delta, () => count);
  store.patch({ bible:{ book:next.book, chapter:next.chapter, verse:next.verse, toVerse:null, partIndex:0 } });
  const bi = $('#b-chap',host), vi = $('#b-verse',host);
  if (bi) bi.value = next.chapter; if (vi) vi.value = next.verse;
  recalc(); paintBookList(''); paintChapters(); paintVerseGrid(); paintParts(); await paintText();
  if (store.state.live?.tool === 'bible') send('both');   // les deux avancent ensemble
}
function onKey(action) {
  if (action === 'next') return step(1);
  if (action === 'prev') return step(-1);
  if (action === 'confirm') return applyInputs();
  if (action === 'sendFullscreen') return send('plein');
  if (action === 'sendLower') return send('bas');
}

/* ------------------------------------------------------ recherche / favoris */
function renderRecherche(box) {
  const b = B();
  box.innerHTML = `
    <div class="card tight" style="margin-bottom:12px">
      <div class="row"><input class="inp grow" id="b-q" placeholder="Mots-clés, passage en paraphrase, ou référence (ex. es 8 9)">
        <select class="inp" id="b-mode" style="width:auto"><option value="keywords">Mots-clés</option><option value="paraphrase">Paraphrase</option><option value="reference">Référence</option></select>
        <button class="btn primary" id="b-search">Rechercher</button></div>
      <div class="hint">Tapez quelques mots qui se trouvent DANS un verset : les propositions apparaissent. La paraphrase tolère les approximations.</div>
    </div>
    <div id="b-results"></div>
    <div class="card tight" style="margin-top:12px">
      <div class="row" style="justify-content:space-between"><strong>⭐ Favoris</strong><button class="btn xs" id="b-fav-add">+ Ajouter le verset courant</button></div>
      <div id="b-favs" style="margin-top:10px"></div>
    </div>`;
  const run = async () => {
    const q = $('#b-q',box).value.trim(); const mode = $('#b-mode',box).value;
    const res = $('#b-results',box);
    if (!q) { res.innerHTML = '<div class="empty">Saisissez votre recherche.</div>'; return; }
    if (mode === 'reference') {
      const p = parseReference(q);
      if (!p?.book) { res.innerHTML = '<div class="empty">Référence incompréhensible.</div>'; return; }
      store.patch({ bible:{ book:p.book.name, chapter:p.chapter, verse:p.verse, partIndex:0 } });
      sub = 'lecture'; $$('#bib-sub .subtab',host).forEach(x=>x.classList.toggle('on',x.dataset.s==='lecture')); render();
      toast(`Aller à ${formatRef(p.book.name,p.chapter,p.verse)}`,'ok'); return;
    }
    const v = primary(); if (!v) { res.innerHTML = '<div class="empty">Aucune version chargée.</div>'; return; }
    const found = searchVerses(v.dataset, q, 40);
    res.innerHTML = found.length ? found.map(r=>`<div class="list-item" data-b="${esc(r.book)}" data-c="${r.chapter}" data-v="${r.verse}">
        <div class="grow"><div class="t">${esc(formatRef(r.book,r.chapter,r.verse))}</div><div class="s">${esc(r.text.slice(0,150))}…</div></div><span class="pill">${r.score.toFixed(0)}</span></div>`).join('')
      : '<div class="empty">Aucun résultat dans la version chargée. Essayez la paraphrase ou importez une Bible complète.</div>';
    res.onclick = e => { const d = e.target.closest('[data-b]'); if (!d) return;
      store.patch({ bible:{ book:d.dataset.b, chapter:+d.dataset.c, verse:+d.dataset.v, partIndex:0 } });
      sub='lecture'; $$('#bib-sub .subtab',host).forEach(x=>x.classList.toggle('on',x.dataset.s==='lecture')); render(); };
  };
  $('#b-search',box).onclick = run;
  $('#b-q',box).onkeydown = e => { if (e.key === 'Enter') run(); };
  $('#b-q',box).oninput = () => { clearTimeout(run._t); run._t = setTimeout(run, 320); };
  const favs = b.favorites || [];
  $('#b-favs',box).innerHTML = favs.length ? favs.map((f,i)=>`<div class="list-item" data-i="${i}"><div class="grow"><div class="t">${esc(f.label)}</div></div><button class="btn xs danger rm" data-i="${i}">✕</button></div>`).join('') : '<div class="empty">Aucun favori.</div>';
  $('#b-favs',box).onclick = e => {
    if (e.target.closest('.rm')) { const i = +e.target.closest('.rm').dataset.i; const f=[...(B().favorites||[])]; f.splice(i,1); store.patch({bible:{favorites:f}}); render(); return; }
    const d = e.target.closest('[data-i]'); if (!d) return;
    const f = favs[+d.dataset.i]; const p = parseReference(f.label);
    if (p?.book) { store.patch({ bible:{book:p.book.name,chapter:p.chapter,verse:p.verse,partIndex:0} }); sub='lecture'; render(); }
  };
  $('#b-fav-add',box).onclick = () => { const bb=B(); const label=formatRef(bb.book,bb.chapter,bb.verse);
    if ((bb.favorites||[]).some(f=>f.label===label)) return toast('Déjà en favori');
    store.patch({ bible:{ favorites:[...(bb.favorites||[]), { label, at:Date.now() }] } }); render(); toast('Ajouté aux favoris','ok'); };
}

/* ----------------------------------------------------------- versions */
function renderVersionsList() {
  const wrap = $('#b-vers',host); if (!wrap) return;
  const sel = B().versions || [B().version];
  wrap.innerHTML = `<div class="row">${versions.map(v=>`<label class="chk" style="padding:6px 10px;border:1px solid var(--line);border-radius:8px;background:var(--p-1)">
      <input type="checkbox" data-v="${esc(v.id)}" ${sel.includes(v.id)?'checked':''}> <strong>${esc(v.name)}</strong> <span class="muted small">${esc(v.lang)}</span></label>`).join('') || '<span class="muted">Aucune version</span>'}</div>`;
  wrap.onchange = e => {
    const c = e.target.closest('[data-v]'); if (!c) return;
    let s = [...(B().versions || [B().version])];
    const id = c.dataset.v;
    if (c.checked) { if (s.length >= 3) { c.checked = false; return toast('Maximum 3 versions simultanées','err'); } s.push(id); }
    else { s = s.filter(x=>x!==id); if (!s.length) { c.checked = true; return toast('Gardez au moins une version','err'); } }
    store.patch({ bible:{ versions:s, version:s[0] } });
    recalc(); paintText(); renderVersionsList();
  };
}
function renderVersions(box) {
  box.innerHTML = `
    <div class="card tight">
      <div class="row" style="justify-content:space-between;margin-bottom:10px"><strong>Versions installées</strong>
        <div class="row"><button class="btn" id="v-import">📥 Importer (JSON, USFM, OSIS, CSV, TXT, XML)</button>
        <button class="btn" id="v-online">🌐 Récupérer le verset en ligne</button></div></div>
      <div id="v-list"></div>
      <div class="hint">Le changement de version conserve la référence courante. Les versions s'affichent empilées, jusqu'à trois.</div>
    </div>
    <div class="card tight" style="margin-top:12px">
      <strong>Version active</strong>
      <div class="row" style="margin-top:10px" id="v-active"></div>
    </div>`;
  const list = $('#v-list',box);
  list.innerHTML = versions.length ? versions.map(v=>`<div class="list-item"><span class="pill acc">${esc(v.short||v.lang)}</span><div class="grow"><div class="t">${esc(v.name)}</div><div class="s">${Object.keys(v.dataset?.books||{}).length} livres · ${esc(v.file)} · ${esc(v.dataset?._meta?.license||'')}</div></div>
      <button class="btn xs" data-use="${esc(v.id)}">Activer</button><button class="btn xs danger" data-del="${esc(v.id)}">✕</button></div>`).join('') : '<div class="empty">Aucune Bible. Importez un fichier pour commencer.</div>';
  list.onclick = async e => {
    const u = e.target.closest('[data-use]'); if (u) { store.patch({ bible:{ version:u.dataset.use } }); toast('Version activée — référence conservée','ok'); renderVersions(box); return; }
    const d = e.target.closest('[data-del]'); if (d) {
      if (!await confirmDlg('Supprimer cette version installée ?','Supprimer')) return;
      await store.remove('bibles', versions.find(v=>v.id===d.dataset.del)?.file || '');
      versions = versions.filter(v=>v.id!==d.dataset.del);
      store.patch({ bible:{ versions: versions.length?[versions[0].id]:[] } });
      renderVersions(box);
    }
  };
  $('#v-active',box).innerHTML = versions.map(v=>`<button class="btn ${B().version===v.id?'on':''}" data-a="${esc(v.id)}">${esc(v.name)}</button>`).join('') || '<span class="muted">—</span>';
  $('#v-active',box).onclick = e => { const b=e.target.closest('[data-a]'); if(b){ store.patch({bible:{version:b.dataset.a}}); renderVersions(box); toast('Version changée','ok'); } };
  $('#v-import',box).onclick = async () => {
    const f = await pickFile('.json,.txt,.csv,.tsv,.xml,.usfm,.sfm,.osis,.zef'); if (!f) return;
    try {
      const ds = importBible(await f.text(), f.name);
      const name = ds._meta.id + '.json';
      await store.save('bibles', name, ds);
      versions = await listVersions(store);
      store.patch({ bible:{ version:ds._meta.id, versions:[ds._meta.id] } });
      toast(`« ${ds._meta.name} » importée : ${Object.keys(ds.books).length} livres`,'ok');
      renderVersions(box); recalc();
    } catch (err) { toast('Import impossible : '+err.message,'err'); }
  };
  $('#v-online',box).onclick = async () => {
    const b = B();
    toast('Tentative de récupération en ligne…');
    const r = await fetchOnlineVerse({ book:b.book, chapter:b.chapter, verse:b.verse }, { translation:b.version, store });
    if (r?.text) { versions = await listVersions(store); toast('Verset récupéré et mis en cache local','ok'); recalc(); }
    else toast('Hors ligne ou API indisponible — la version locale reste active','err');
  };
}

function renderReglages(box) {
  const b = B();
  box.innerHTML = `
    <div class="card tight">
      <h3>Découpage automatique des versets longs</h3>
      <p class="muted small">Un verset comme <strong>Esther 8:9</strong> est découpé en sections pour rester lisible en bas centré. Le nombre de sections dépend de la longueur.</p>
      <div class="grid2" style="margin-top:12px">
        <div class="field"><label class="lbl">Longueur max par section (caractères)</label><input class="inp" type="number" id="r-max" min="60" max="600" value="${b.splitMaxChars||150}"></div>
        <div class="field"><label class="lbl">Sections maximum</label><input class="inp" type="number" readonly value="4"></div>
      </div>
      <div id="r-demo" class="card tight" style="margin-top:10px;background:#0a0f18"></div>
      <div class="sep"></div>
      <label class="chk"><input type="checkbox" id="r-split" ${b.splitMode?'checked':''}> Activer le découpage sur le bas centré</label>
      <div class="hint">Quand activé, les boutons de sélection des versets longs sont séparés visuellement et portent leur nombre de sections.</div>
    </div>`;
  const demo = () => {
    const max = Number($('#r-max',box).value)||150;
    const v = primary(); const raw = v ? (getVerse(v.dataset,'Esther',8,9)||'') : '';
    const n = partsForLength(raw, max);
    const parts = splitText(raw, n);
    $('#r-demo',box).innerHTML = `<div class="muted small" style="margin-bottom:8px">Esther 8:9 → ${raw.length} caractères → <strong>${n} section(s)</strong></div>` +
      parts.map((p,i)=>`<div style="padding:7px 9px;margin-bottom:6px;border-left:3px solid var(--accent);background:var(--p-1);border-radius:6px"><span class="muted small">${i+1}/${n} · ${p.length} car.</span><div>${esc(p.slice(0,90))}${p.length>90?'…':''}</div></div>`).join('');
  };
  $('#r-max',box).oninput = e => { store.patch({ bible:{ splitMaxChars:Number(e.target.value)||150 } }); demo(); recalc(); };
  $('#r-split',box).onchange = e => store.patch({ bible:{ splitMode:e.target.checked } });
  demo();
}

export { onKey };
