#!/usr/bin/env node
/**
 * FREESTREAM — serveur local, AUCUNE dépendance npm.
 * 100 % offline : n'écoute que sur le réseau local, ne contacte jamais Internet.
 *
 * Rôles :
 *  - sert les fichiers du dossier projet (avec HTTP Range → vidéo cherchable/fluide)
 *  - état partagé en temps réel via Server-Sent Events (régie → sorties OBS)
 *  - sauvegarde automatique de TOUT dans donnees/<dossier>/
 *  - copie dans le projet les fichiers pris ailleurs
 *  - conversion PPTX/DOCX → PDF si LibreOffice est présent
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MIME, FOLDERS, PORT_DEFAULT } from './core/config.js';
import { defaultState, mergeState, ensureDefaults } from './core/defaults.js';

const execFileAsync = promisify(execFile);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.FREESTREAM_PORT || process.argv[2] || PORT_DEFAULT);
const HOST = process.env.FREESTREAM_HOST || '0.0.0.0';
const STATE_FILE = process.env.FREESTREAM_STATE_FILE || path.join(ROOT, FOLDERS.etat, 'state.json');
const STATE_JS = process.env.FREESTREAM_STATE_JS || path.join(ROOT, FOLDERS.etat, 'live.js');   // repli mode fichier (sans serveur)
const MAX_BODY = 250 * 1024 * 1024;

/* ------------------------------------------------------------------ utils */
const send = (res, code, body, headers = {}) => {
  if (res.writableEnded) return;
  res.writeHead(code, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
};
const json = (res, code, obj, headers) => send(res, code, JSON.stringify(obj), { 'Content-Type': MIME['.json'], ...headers });
const inside = p => { const r = path.resolve(p); return r === ROOT || r.startsWith(ROOT + path.sep); };
const safe = rel => { const p = path.resolve(ROOT, '.' + path.sep + String(rel || '').replace(/^[/\\]+/, '')); return inside(p) ? p : null; };
/** Seuls les dossiers de données déclarés sont accessibles en écriture. Jamais la racine. */
const FOLDER_KEYS = new Set(Object.keys(FOLDERS));
const folderDir = folder => FOLDER_KEYS.has(folder) ? safe(FOLDERS[folder]) : null;
/** Nom de fichier sûr : pas de séparateur, pas de « .. », pas de caractère de commande. */
function safeName(s) {
  let n = path.basename(String(s || '').replace(/\\/g, '/'));
  n = n.replace(/[^a-zA-Z0-9._\- àâäéèêëïîôöùûüçÀÂÄÉÈÊËÏÎÔÖÙÛÜÇ]/g, '_');
  n = n.replace(/\.\.+/g, '.').replace(/^\.+/, '').trim();
  if (!n || n === '.') n = 'fichier';
  return n;
}
const b64name = safeName;
const log = (...a) => console.log(`[FREESTREAM ${new Date().toLocaleTimeString('fr-FR')}]`, ...a);

async function readBody(req, binary = false) {
  const chunks = []; let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw Object.assign(new Error('Corps trop volumineux'), { code: 413 });
    chunks.push(c);
  }
  const buf = Buffer.concat(chunks);
  return binary ? buf : buf.toString('utf8');
}
async function readJson(req) { const t = await readBody(req); return t ? JSON.parse(t) : {}; }

/* ------------------------------------------------------------------ état */
let state;
try { state = mergeState(defaultState(), JSON.parse(await fsp.readFile(STATE_FILE, 'utf8'))); }
catch { state = defaultState(); }
ensureDefaults(state);   // migration : un ancien state.json ne masque pas les nouvelles sorties
await fsp.mkdir(path.dirname(STATE_FILE), { recursive: true });

let saveTimer = null;
function persistSoon() {
  if (!state.settings?.autosave) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const tmp = STATE_FILE + '.tmp';
      await fsp.writeFile(tmp, JSON.stringify(state, null, 2));
      await fsp.rename(tmp, STATE_FILE);
      // Miroir lisible par une balise <script> → repli totalement sans serveur.
      await fsp.writeFile(STATE_JS, 'window.FREESTREAM_STATE=' + JSON.stringify(state) + ';');
    } catch (e) { log('ERREUR sauvegarde:', e.message); }
  }, 120);
}

const clients = new Set();
function broadcast() {
  const payload = `id: ${state.rev}\nevent: state\ndata: ${JSON.stringify(state)}\n\n`;
  for (const res of clients) { try { res.write(payload); } catch { clients.delete(res); } }
  persistSoon();
}
function tick(rev = true) {
  if (rev) state.rev++;
  state.updatedAt = Date.now();
  broadcast();
}

/* ------------------------------------------------------- présence des sorties */
const presenceTimers = new Map();
function touchPresence(id, info = {}) {
  if (!id) return;
  state.presence[id] = { ...(state.presence[id] || {}), ...info, lastSeen: Date.now() };
  clearTimeout(presenceTimers.get(id));
  presenceTimers.set(id, setTimeout(() => {
    delete state.presence[id]; presenceTimers.delete(id); tick();
  }, 20000));
}

/* ------------------------------------------------------------------ fichiers */
async function listFolder(folder) {
  const dir = folderDir(folder);
  if (!dir) throw Object.assign(new Error('Dossier inconnu'), { code: 400 });
  await fsp.mkdir(dir, { recursive: true });
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  return entries.filter(e => e.isFile()).map(e => {
    const st = fs.statSync(path.join(dir, e.name));
    return { name: e.name, size: st.size, mtime: st.mtimeMs, kind: e.name.split('.').pop().toLowerCase() };
  }).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

async function saveDoc({ folder, name, data }) {
  const dir = folderDir(folder); if (!dir) throw Object.assign(new Error('Dossier inconnu'), { code: 400 });
  await fsp.mkdir(dir, { recursive: true });
  const file = path.join(dir, b64name(name));
  if (!inside(file)) throw Object.assign(new Error('Chemin refusé'), { code: 400 });
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  await fsp.writeFile(file, content);
  return { name: path.basename(file), size: Buffer.byteLength(content) };
}

async function deleteDoc({ folder, name }) {
  const dir = folderDir(folder); if (!dir) throw Object.assign(new Error('Dossier inconnu'), { code: 400 });
  const file = path.join(dir, path.basename(String(name)));
  if (!inside(file)) throw Object.assign(new Error('Chemin refusé'), { code: 400 });
  await fsp.rm(file, { force: true });
  return { ok: true };
}

async function copyExternal(src, folder) {
  const dir = folderDir(folder); if (!dir) throw Object.assign(new Error('Dossier inconnu'), { code: 400 });
  const source = path.resolve(String(src));
  await fsp.mkdir(dir, { recursive: true });
  let dest = path.join(dir, path.basename(source));
  if (fs.existsSync(dest)) {
    const ext = path.extname(dest), stem = path.basename(dest, ext);
    dest = path.join(dir, `${stem}-${Date.now().toString(36)}${ext}`);
  }
  await fsp.copyFile(source, dest);
  return { name: path.basename(dest), size: (await fsp.stat(dest)).size, copied: true };
}

/* --------------------------------------------------------- conversion bureautique */
let sofficeCache;
async function findSoffice() {
  if (sofficeCache !== undefined) return sofficeCache;
  const candidates = ['soffice', 'libreoffice',
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe'];
  for (const c of candidates) {
    try { await execFileAsync(c, ['--version'], { timeout: 8000 }); return (sofficeCache = c); } catch { /* suivant */ }
  }
  return (sofficeCache = null);
}
async function convertDoc(name, to = 'pdf') {
  const src = safe(path.join(FOLDERS.medias, path.basename(name)));
  if (!src || !fs.existsSync(src)) throw Object.assign(new Error('Fichier introuvable'), { code: 404 });
  const bin = await findSoffice();
  if (!bin) return { ok: false, reason: 'LibreOffice absent — installez-le ou exportez vos diapositives en PNG/PDF.' };
  const outDir = path.join(ROOT, FOLDERS.medias, '.converti');
  await fsp.mkdir(outDir, { recursive: true });
  const { stdout } = await execFileAsync(bin, ['--headless', '--nologo', '--nodefault', '--convert-to', to, '--outdir', outDir, src], { timeout: 180000 });
  const produced = path.join(outDir, path.basename(src, path.extname(src)) + '.' + to);
  if (!fs.existsSync(produced)) return { ok: false, reason: 'Conversion non produite', detail: stdout };
  const finalName = path.basename(src, path.extname(src)) + '.' + to;
  await fsp.copyFile(produced, path.join(ROOT, FOLDERS.medias, finalName));
  return { ok: true, name: finalName };
}

/* ------------------------------------------------------------------ statique + RANGE */
async function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = safe(rel);
  if (!file) return send(res, 403, 'Accès refusé');
  let st;
  try { st = await fsp.stat(file); } catch { return send(res, 404, 'Introuvable : ' + rel); }
  if (st.isDirectory()) return serveStatic(req, res, path.posix.join(rel, 'index.html'));
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': st.size, 'Last-Modified': st.mtime.toUTCString() };

  // Support HTTP Range : indispensable pour seek vidéo / grosses vidéos de 30 min.
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m) {
      let start = m[1] ? Number(m[1]) : 0;
      let end = m[2] ? Number(m[2]) : st.size - 1;
      if (start >= st.size) return send(res, 416, '', { 'Content-Range': `bytes */${st.size}` });
      if (end >= st.size) end = st.size - 1;
      if (start > end) { start = 0; end = Math.min(st.size - 1, 1024 * 1024); }
      res.writeHead(206, { ...base, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${st.size}` });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(file, { start, end, highWaterMark: 1024 * 1024 }).pipe(res);
    }
  }
  res.writeHead(200, base);
  if (req.method === 'HEAD') return res.end();
  return fs.createReadStream(file, { highWaterMark: 1024 * 1024 }).pipe(res);
}

/* ------------------------------------------------------------------ API */
async function api(req, res, u) {
  const p = u.pathname;
  const q = u.searchParams;

  if (p === '/api/state' && req.method === 'GET') return json(res, 200, state);
  if (p === '/api/state' && req.method === 'POST') {           // remplacement complet
    const body = await readJson(req);
    if (!body || typeof body !== 'object') throw Object.assign(new Error('État invalide'), { code: 400 });
    state = mergeState(defaultState(), body); tick(); return json(res, 200, { ok: true, rev: state.rev });
  }
  if (p === '/api/patch' && req.method === 'POST') {           // patch profond (chemin d'accès rapide)
    const body = await readJson(req);
    mergeState(state, body.patch || body); tick();
    return json(res, 200, { ok: true, rev: state.rev });
  }
  if (p === '/api/events') {                                   // SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', 'Access-Control-Allow-Origin': '*',
    });
    res.write(`retry: ${state.settings?.sseRetryMs || 800}\n\n`);
    res.write(`id: ${state.rev}\nevent: state\ndata: ${JSON.stringify(state)}\n\n`);
    clients.add(res);
    const ka = setInterval(() => { try { res.write(': ping\n\n'); } catch { } }, 12000);
    req.on('close', () => { clearInterval(ka); clients.delete(res); });
    return;
  }
  if (p === '/api/presence' && req.method === 'POST') {
    const b = await readJson(req);
    touchPresence(b.id, { url: b.url, type: b.type, tool: b.tool });
    return json(res, 200, { ok: true, presence: state.presence });
  }
  if (p === '/api/list' && req.method === 'GET') return json(res, 200, { items: await listFolder(q.get('folder')) });
  if (p === '/api/save' && req.method === 'POST') return json(res, 200, await saveDoc(await readJson(req)));
  if (p === '/api/delete' && req.method === 'POST') return json(res, 200, await deleteDoc(await readJson(req)));
  if (p === '/api/read' && req.method === 'GET') {
    const f = q.get('path');
    if (!f) throw Object.assign(new Error('path requis'), { code: 400 });
    const target = path.resolve(f);
    // Lecture d'un fichier externe pour import (jamais d'écriture hors projet).
    return json(res, 200, { name: path.basename(target), content: await fsp.readFile(target, 'utf8') });
  }
  if (p === '/api/copy' && req.method === 'POST') {
    const b = await readJson(req);
    return json(res, 200, await copyExternal(b.src, b.folder));
  }
  if (p === '/api/duplicate' && req.method === 'POST') {
    const b = await readJson(req);
    const dir = folderDir(b.folder); if (!dir) throw Object.assign(new Error('Dossier inconnu'), { code: 400 });
    const from = path.join(dir, path.basename(String(b.name || '')));
    if (!inside(from) || !fs.existsSync(from)) throw Object.assign(new Error('Fichier introuvable'), { code: 404 });
    const ext = path.extname(from), stem = path.basename(from, ext);
    let to = path.join(dir, `${stem} (copie)${ext}`), n = 2;
    while (fs.existsSync(to)) to = path.join(dir, `${stem} (copie ${n++})${ext}`);
    if (!inside(to)) throw Object.assign(new Error('Chemin refusé'), { code: 400 });
    await fsp.copyFile(from, to);
    return json(res, 200, { ok: true, name: path.basename(to), size: (await fsp.stat(to)).size, copied: true });
  }
  if (p === '/api/rename' && req.method === 'POST') {
    const b = await readJson(req);
    const dir = folderDir(b.folder); if (!dir) throw Object.assign(new Error('Dossier inconnu'), { code: 400 });
    const from = path.join(dir, path.basename(String(b.old || '')));
    const to = path.join(dir, b64name(String(b.new || '')));
    if (!inside(from) || !inside(to)) throw Object.assign(new Error('Chemin refusé'), { code: 400 });
    if (!fs.existsSync(to)) await fsp.rename(from, to);
    return json(res, 200, { ok: true, name: path.basename(to) });
  }
  if (p === '/api/convert' && req.method === 'POST') { const b = await readJson(req); return json(res, 200, await convertDoc(b.name, b.to || 'pdf')); }
  if (p === '/api/convert/check' && req.method === 'GET') return json(res, 200, { available: !!(await findSoffice()) });
  if (p === '/api/upload' && req.method === 'POST') {
    // Upload binaire brut : headers x-fs-folder / x-fs-name. Efficace même pour 500 Mo.
    const folder = req.headers['x-fs-folder'];
    const name = req.headers['x-fs-name'];
    if (!FOLDERS[folder]) throw Object.assign(new Error('Dossier inconnu'), { code: 400 });
    const buf = await readBody(req, true);
    const dir = folderDir(folder); if (!dir) throw Object.assign(new Error('Dossier inconnu'), { code: 400 });
    await fsp.mkdir(dir, { recursive: true });
    const file = path.join(dir, b64name(decodeURIComponent(String(name || 'fichier'))));
    if (!inside(file)) throw Object.assign(new Error('Chemin refusé'), { code: 400 });
    await fsp.writeFile(file, buf);
    return json(res, 200, { name: path.basename(file), size: buf.length, copied: true });
  }
  if (p === '/api/open' && req.method === 'POST') {
    const b = await readJson(req);
    const target = safe(b.rel || '');
    if (!target) throw Object.assign(new Error('Chemin refusé'), { code: 400 });
    const cmd = process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    try { spawn(cmd, [target], { detached: true, stdio: 'ignore' }).unref(); } catch { }
    return json(res, 200, { ok: true });
  }
  if (p === '/api/info' && req.method === 'GET') {
    const ips = [];
    for (const list of Object.values(os.networkInterfaces())) for (const i of list || [])
      if (i.family === 'IPv4' && !i.internal) ips.push(i.address);
    return json(res, 200, { root: ROOT, port: PORT, host: req.headers.host, lan: [...new Set(ips)], soffice: !!(await findSoffice()), node: process.version });
  }
  if (p === '/api/health') return json(res, 200, { ok: true, rev: state.rev, clients: clients.size, uptime: process.uptime() });
  if (p === '/api/shutdown' && req.method === 'POST') {
    json(res, 200, { ok: true }); setTimeout(() => process.exit(0), 150); return;
  }
  return json(res, 404, { error: 'Route inconnue', path: p });
}

/* ------------------------------------------------------------------ serveur */
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-fs-folder, x-fs-name');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return send(res, 204, '');
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (u.pathname.startsWith('/api/')) return await api(req, res, u);
    if (u.pathname === '/regie') return serveStatic(req, res, '/regie.html');
    if (u.pathname.startsWith('/media/')) return serveStatic(req, res, '/donnees/medias/' + u.pathname.slice(7));
    return await serveStatic(req, res, u.pathname);
  } catch (e) {
    log('ERREUR', req.method, u.pathname, e.message);
    return json(res, e.code || 500, { error: e.message });
  }
});

server.requestTimeout = 0;
server.headersTimeout = 0;
server.listen(PORT, HOST, async () => {
  await fsp.mkdir(path.join(ROOT, FOLDERS.medias), { recursive: true });
  for (const f of Object.values(FOLDERS)) await fsp.mkdir(safe(f), { recursive: true });
  persistSoon();
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || [])
    if (i.family === 'IPv4' && !i.internal) ips.push(i.address);
  console.log('\n  ╔══════════════════════════════════════════════════════════╗');
  console.log('  ║   FREESTREAM — prêt, 100 % hors ligne                  ║');
  console.log('  ╚══════════════════════════════════════════════════════════╝');
  console.log(`  Régie      : http://localhost:${PORT}/regie.html`);
  console.log(`  Sorties    : http://localhost:${PORT}/index.html`);
  for (const ip of new Set(ips)) console.log(`  Réseau LAN : http://${ip}:${PORT}/regie.html`);
  console.log(`  Dossier    : ${ROOT}\n`);
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => {
  log('Arrêt, sauvegarde…');
  clearTimeout(saveTimer);
  try { await fsp.writeFile(STATE_FILE, JSON.stringify(state, null, 2)); } catch { }
  process.exit(0);
});
