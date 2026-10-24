// Onglet ORATEUR — messages 15 s, coupure immédiate, contenu plein écran en incrustation.
import { store, esc, $, $$, el, toast, richEditor, formDlg } from './core.js';
import { sanitizeHtml, toPlainText } from '../core/sanitize.js';

let host=null, ed=null;
const PRESETS=['Vous avez 5 minutes','Terminez dans 1 minute','Merci, passez au chant suivant','Le micro est coupé','Répétez la dernière phrase','On vous entend mal'];

export async function mount(container){
  host=container;
  host.innerHTML=`
    <div class="tool-head"><h1>✉ Régie Orateur / Pasteur</h1>
      <span class="pill acc">Le message reste 15 s puis l'écran reprend le plein écran complet</span>
      <span class="spacer"></span><a class="btn" href="../outputs/orateur.html" target="_blank">👁 Ouvrir la vue orateur</a></div>
    <div class="grid2" style="grid-template-columns:1fr 1fr;align-items:start">
      <div class="card tight">
        <div class="row" style="justify-content:space-between;margin-bottom:8px"><strong>Envoyer un message</strong><span class="pill" id="or-state">Aucun message</span></div>
        <div id="or-ed"></div>
        <div class="row" style="margin-top:10px">
          <button class="btn primary lg" id="or-send">✉ Envoyer</button>
          <button class="btn danger" id="or-cut">✕ Couper maintenant</button>
        </div>
        <div class="sep"></div>
        <div class="grid2">
          <div class="field"><label class="lbl">Durée (secondes)</label><input class="inp" type="number" id="or-dur" min="1" max="600" value="${Math.round((store.state.orateur?.durationMs||15000)/1000)}"></div>
          <div class="field"><label class="lbl">Incrustation du plein écran</label><label class="chk" style="margin-top:8px"><input type="checkbox" id="or-pip" ${store.state.orateur?.showPip!==false?'checked':''}> Afficher le contenu en petit dans un coin pendant le message</label></div>
        </div>
        <div class="sep"></div>
        <strong>Messages rapides</strong>
        <div class="row" id="or-presets" style="margin-top:9px">${PRESETS.map(p=>`<button class="btn xs" data-p="${esc(p)}">${esc(p)}</button>`).join('')}</div>
      </div>
      <div class="card tight">
        <div class="row" style="justify-content:space-between;margin-bottom:8px"><strong>Aperçu de la vue orateur</strong><span class="muted small">identique à la sortie</span></div>
        <iframe src="../outputs/orateur.html?preview=1" style="width:100%;aspect-ratio:16/9;border:1px solid var(--line);border-radius:10px;background:#05070d"></iframe>
        <div class="hint" style="margin-top:9px">Quand aucun message n'est actif, l'écran reprend <strong>tout</strong> le contenu plein écran de l'outil en cours (Bible, chants ou média).</div>
        <div class="sep"></div>
        <div class="muted small">Lien OBS / écran de confiance :</div>
        <code id="or-url"></code>
      </div>
    </div>`;
  ed = richEditor({placeholder:'Message pour l\'orateur…',height:'120px',onChange:()=>{}});
  $('#or-ed',host).appendChild(ed);
  $('#or-url',host).textContent = location.origin + '/outputs/orateur.html';
  $('#or-send',host).onclick = () => send(ed.getValue());
  $('#or-cut',host).onclick = () => { store.patch({orateur:{ cut:true }}); toast('Message coupé'); paint(); };
  $('#or-dur',host).onchange = e => store.patch({orateur:{durationMs:(Number(e.target.value)||15)*1000}});
  $('#or-pip',host).onchange = e => store.patch({orateur:{showPip:e.target.checked}});
  $('#or-presets',host).onclick = e => { const b=e.target.closest('[data-p]'); if(b){ ed.setValue(esc(b.dataset.p)); send(ed.getValue()); } };
  paint();
  return { onKey:a=>{ if(a==='clear'){ store.patch({orateur:{cut:true}}); paint(); } if(a==='confirm') send(ed.getValue()); } };
}
function send(html){
  const text = toPlainText(html);
  if(!text.trim()) return toast('Message vide','err');
  store.patch({ orateur:{ message:{ html:sanitizeHtml(html), text }, startedAt:Date.now(), cut:false,
    durationMs:(Number($('#or-dur',host)?.value)||15)*1000, showPip:$('#or-pip',host)?.checked!==false } });
  toast('Message envoyé à l\'orateur','ok'); paint();
}
function paint(){
  const o=store.state.orateur||{};
  const active=!!o.message && !o.cut && Date.now()-(o.startedAt||0) < (o.durationMs||15000);
  const s=$('#or-state',host); if(s){ s.textContent = active ? `● En cours · ${Math.max(0,Math.ceil(((o.durationMs||15000)-(Date.now()-o.startedAt))/1000))} s` : 'Aucun message'; s.className='pill '+(active?'ok':''); }
}
