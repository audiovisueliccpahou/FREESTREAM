#!/usr/bin/env python3
"""
FREESTREAM — serveur de repli sans aucune dépendance (bibliothèque standard Python).
Utilisé par DEMARRER.bat quand Node.js n'est pas installé sur la machine.
100 % hors ligne : n'écoute que sur le réseau local.
"""
import os, sys, json, time, mimetypes, shutil, subprocess, threading, socket, re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get('FREESTREAM_PORT') or (sys.argv[1] if len(sys.argv) > 1 else 8787))
STATE_FILE = os.environ.get('FREESTREAM_STATE_FILE') or os.path.join(ROOT, 'donnees', 'etat', 'state.json')
STATE_JS = os.environ.get('FREESTREAM_STATE_JS') or os.path.join(ROOT, 'donnees', 'etat', 'live.js')

FOLDERS = {
    'bibles':'donnees/bibles','chants':'donnees/chants','lowerthirds':'donnees/lowerthirds',
    'medias':'donnees/medias','projets':'donnees/projets','designs':'donnees/designs',
    'polices':'donnees/polices','etat':'donnees/etat',
}
MIME = {
 '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml',
 '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif',
 '.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf',
 '.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.mkv':'video/x-matroska',
 '.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.m4a':'audio/mp4',
 '.pdf':'application/pdf','.txt':'text/plain; charset=utf-8',
 '.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation',
 '.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

# État par défaut minimal : le navigateur envoie l'état complet dès sa connexion.
state = {'rev':1,'updatedAt':int(time.time()*1000),'live':{'tool':None,'fullscreen':None,'lower':None,
         'lowerthird':None,'blackout':False,'history':[]},'presence':{},
         'bible':{'book':'Jean','chapter':3,'verse':16},'minuteur':{'items':[],'index':-1,'running':False,'visible':False}}
try:
    with open(STATE_FILE,'r',encoding='utf-8') as f:
        loaded = json.load(f)
    def merge(a,b):
        for k,v in b.items():
            if isinstance(v,dict) and isinstance(a.get(k),dict): merge(a[k],v)
            else: a[k]=v
    merge(state, loaded)
except Exception: pass

clients = []
lock = threading.Lock()
save_timer = [None]

def persist():
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    tmp = STATE_FILE + '.tmp'
    with open(tmp,'w',encoding='utf-8') as f: json.dump(state,f,ensure_ascii=False,indent=2)
    os.replace(tmp, STATE_FILE)
    try:
        with open(STATE_JS,'w',encoding='utf-8') as f:
            f.write('window.FREESTREAM_STATE=' + json.dumps(state,ensure_ascii=False) + ';')
    except Exception: pass

def persist_soon():
    if save_timer[0]: save_timer[0].cancel()
    save_timer[0] = threading.Timer(0.12, persist); save_timer[0].daemon=True; save_timer[0].start()

def broadcast():
    payload = ('id: %s\nevent: state\ndata: %s\n\n' % (state.get('rev',1), json.dumps(state,ensure_ascii=False))).encode('utf-8')
    with lock:
        dead=[]
        for c in clients:
            try: c.write(payload); c.flush()
            except Exception: dead.append(c)
        for c in dead:
            try: clients.remove(c)
            except Exception: pass

def deep_merge(a,b):
    for k,v in b.items():
        if isinstance(v,dict) and isinstance(a.get(k),dict): deep_merge(a[k],v)
        else: a[k]=v
    return a

def safe(rel):
    p = os.path.abspath(os.path.join(ROOT, rel.lstrip('/\\')))
    if p == ROOT or p.startswith(ROOT + os.sep): return p
    return None

def folder_dir(name):
    if name not in FOLDERS: return None
    return safe(FOLDERS[name])

def safe_name(s):
    n = os.path.basename(str(s or '').replace('\\','/'))
    n = re.sub(r'[^a-zA-Z0-9._\- àâäéèêëïîôöùûüçÀÂÄÉÈÊËÏÎÔÖÙÛÜÇ]','_',n)
    n = re.sub(r'\.\.+','.',n).lstrip('.').strip()
    return n or 'fichier'

class Handler(BaseHTTPRequestHandler):
    server_version = 'FREESTREAM/0.1'
    protocol_version = 'HTTP/1.1'
    def log_message(self, fmt, *args): pass

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin','*')
        self.send_header('Access-Control-Allow-Headers','Content-Type, x-fs-folder, x-fs-name')
        self.send_header('Access-Control-Allow-Methods','GET,POST,OPTIONS')
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')

    def _json(self, code, obj, extra=None):
        body = json.dumps(obj,ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self._cors()
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(body)))
        if extra:
            for k,v in extra.items(): self.send_header(k,v)
        self.end_headers()
        try: self.wfile.write(body)
        except Exception: pass

    def _body(self, binary=False):
        n = int(self.headers.get('Content-Length','0') or 0)
        data = self.rfile.read(n) if n else b''
        return data if binary else data.decode('utf-8','replace')

    def do_OPTIONS(self): self.send_response(204); self._cors(); self.send_header('Content-Length','0'); self.end_headers()

    def do_GET(self):
        self._real_get()

    def do_HEAD(self):
        self._real_get()

    def _real_get(self):
        u = urlparse(self.path); p = u.path; q = parse_qs(u.query)
        try:
            if p == '/api/health': return self._json(200,{'ok':True,'rev':state.get('rev'),'clients':len(clients),'uptime':time.time()-START})
            if p == '/api/state': return self._json(200,state)
            if p == '/api/info':
                ips=[]
                try:
                    s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.connect(('8.8.8.8',80)); ips=[s.getsockname()[0]]; s.close()
                except Exception: pass
                return self._json(200,{'root':ROOT,'port':PORT,'host':self.headers.get('Host'),'lan':ips,'soffice':bool(find_soffice()),'node':'python '+sys.version.split()[0]})
            if p == '/api/list':
                d = folder_dir(q.get('folder',[''])[0])
                if not d: return self._json(400,{'error':'Dossier inconnu'})
                os.makedirs(d,exist_ok=True)
                items=[{'name':n,'size':os.path.getsize(os.path.join(d,n)),'mtime':os.path.getmtime(os.path.join(d,n)),
                        'kind':n.rsplit('.',1)[-1].lower()} for n in sorted(os.listdir(d)) if os.path.isfile(os.path.join(d,n))]
                return self._json(200,{'items':items})
            if p == '/api/events': return self._events()
            if p == '/api/convert/check': return self._json(200,{'available':bool(find_soffice())})
            if p == '/api/read':
                src = q.get('path',[''])[0]
                if not src: return self._json(400,{'error':'path requis'})
                try:
                    with open(src,'r',encoding='utf-8') as f: return self._json(200,{'name':os.path.basename(src),'content':f.read()})
                except Exception as e: return self._json(404,{'error':str(e)})
            return self._static(p)
        except (BrokenPipeError, ConnectionResetError): pass
        except Exception as e: return self._json(500,{'error':str(e)})

    def _events(self):
        self.send_response(200); self._cors()
        self.send_header('Content-Type','text/event-stream; charset=utf-8')
        self.send_header('Connection','keep-alive'); self.send_header('X-Accel-Buffering','no')
        self.end_headers()
        try:
            self.wfile.write(b'retry: 800\n\n'); self.wfile.flush()
            first = ('id: %s\nevent: state\ndata: %s\n\n' % (state.get('rev',1), json.dumps(state,ensure_ascii=False))).encode('utf-8')
            self.wfile.write(first); self.wfile.flush()
        except Exception: return
        with lock: clients.append(self.wfile)
        try:
            while not self.server._stopping:
                time.sleep(12)
                try: self.wfile.write(b': ping\n\n'); self.wfile.flush()
                except Exception: break
        finally:
            with lock:
                try: clients.remove(self.wfile)
                except Exception: pass

    def _static(self, path, head=False):
        rel = unquote(path.split('?')[0])
        if rel in ('/','') : rel = '/index.html'
        if rel == '/regie': rel = '/regie.html'
        if rel.startswith('/media/'): rel = '/donnees/medias/' + rel[7:]
        f = safe(rel)
        if not f: return self._json(403,{'error':'Accès refusé'})
        if not os.path.isfile(f): return self._json(404,{'error':'Introuvable : '+rel})
        size = os.path.getsize(f)
        ext = os.path.splitext(f)[1].lower()
        ctype = MIME.get(ext) or mimetypes.guess_type(f)[0] or 'application/octet-stream'
        rng = self.headers.get('Range')
        start, end = 0, size-1
        code = 200
        if rng:
            m = re.match(r'^bytes=(\d*)-(\d*)$', rng.strip())
            if m:
                start = int(m.group(1)) if m.group(1) else 0
                end = int(m.group(2)) if m.group(2) else size-1
                if start >= size:
                    self.send_response(416); self._cors(); self.send_header('Content-Range','bytes */%d'%size); self.send_header('Content-Length','0'); self.end_headers(); return
                end = min(end, size-1); code = 206
        length = max(0, end-start+1)
        self.send_response(code); self._cors()
        self.send_header('Content-Type',ctype); self.send_header('Accept-Ranges','bytes')
        self.send_header('Content-Length',str(length))
        if code == 206: self.send_header('Content-Range','bytes %d-%d/%d'%(start,end,size))
        self.end_headers()
        if self.command == 'HEAD': return
        with open(f,'rb') as fh:
            fh.seek(start); remaining = length
            while remaining > 0:
                chunk = fh.read(min(1024*1024, remaining))
                if not chunk: break
                try: self.wfile.write(chunk)
                except Exception: break
                remaining -= len(chunk)

    def do_POST(self):
        u = urlparse(self.path); p = u.path
        try:
            # Upload binaire (même méthode POST que le serveur Node)
            if p == '/api/upload': return self._upload()
            raw = self._body()
            data = json.loads(raw) if raw else {}
            if p in ('/api/patch','/api/state'):
                if p == '/api/state': state.clear(); deep_merge(state, data)
                else: deep_merge(state, data.get('patch') or data)
                state['rev'] = state.get('rev',0)+1; state['updatedAt']=int(time.time()*1000)
                persist_soon(); broadcast()
                return self._json(200,{'ok':True,'rev':state['rev']})
            if p == '/api/presence':
                i = data.get('id')
                if i:
                    state.setdefault('presence',{})[i] = {**data,'lastSeen':int(time.time()*1000)}
                    threading.Timer(20, lambda: (state.get('presence',{}).pop(i,None), broadcast())).start()
                return self._json(200,{'ok':True,'presence':state.get('presence',{})})
            if p == '/api/save':
                d = folder_dir(data.get('folder'))
                if not d: return self._json(400,{'error':'Dossier inconnu'})
                os.makedirs(d,exist_ok=True)
                n = safe_name(data.get('name'))
                tgt = os.path.join(d,n)
                if os.path.abspath(tgt) != os.path.abspath(os.path.join(d,n)): return self._json(400,{'error':'Chemin refusé'})
                content = data.get('data')
                content = content if isinstance(content,str) else json.dumps(content,ensure_ascii=False,indent=2)
                with open(tgt,'w',encoding='utf-8') as f: f.write(content)
                return self._json(200,{'name':n,'size':len(content.encode('utf-8'))})
            if p == '/api/delete':
                d = folder_dir(data.get('folder'))
                if not d: return self._json(400,{'error':'Dossier inconnu'})
                tgt = os.path.join(d, os.path.basename(str(data.get('name',''))))
                if os.path.isfile(tgt): os.remove(tgt)
                return self._json(200,{'ok':True})
            if p == '/api/copy':
                d = folder_dir(data.get('folder'))
                if not d: return self._json(400,{'error':'Dossier inconnu'})
                src = os.path.abspath(str(data.get('src','')))
                if not os.path.isfile(src): return self._json(404,{'error':'Fichier introuvable'})
                os.makedirs(d,exist_ok=True)
                base = os.path.basename(src); stem,ext = os.path.splitext(base)
                dest = os.path.join(d,base)
                if os.path.exists(dest): dest = os.path.join(d,stem+'-'+str(int(time.time()))+ext)
                shutil.copy2(src,dest)
                return self._json(200,{'name':os.path.basename(dest),'size':os.path.getsize(dest),'copied':True})
            if p == '/api/duplicate':
                d = folder_dir(data.get('folder'))
                if not d: return self._json(400,{'error':'Dossier inconnu'})
                src = os.path.join(d, os.path.basename(str(data.get('name',''))))
                if not os.path.isfile(src): return self._json(404,{'error':'Fichier introuvable'})
                stem,ext = os.path.splitext(os.path.basename(src))
                dst = os.path.join(d, stem+' (copie)'+ext); n=2
                while os.path.exists(dst): dst = os.path.join(d, stem+' (copie %d)'%n+ext); n+=1
                shutil.copy2(src,dst)
                return self._json(200,{'ok':True,'name':os.path.basename(dst),'size':os.path.getsize(dst),'copied':True})
            if p == '/api/rename':
                d = folder_dir(data.get('folder'))
                if not d: return self._json(400,{'error':'Dossier inconnu'})
                src = os.path.join(d, os.path.basename(str(data.get('old',''))))
                dst = os.path.join(d, safe_name(data.get('new')))
                if os.path.isfile(src) and not os.path.exists(dst): os.rename(src,dst)
                return self._json(200,{'ok':True,'name':os.path.basename(dst)})
            if p == '/api/convert':
                src = os.path.join(safe(FOLDERS['medias']), os.path.basename(str(data.get('name',''))))
                if not os.path.isfile(src): return self._json(404,{'error':'Fichier introuvable'})
                so = find_soffice()
                if not so: return self._json(200,{'ok':False,'reason':'LibreOffice absent — exportez vos diapositives en PDF/PNG.'})
                out = os.path.join(ROOT,'donnees','medias','.converti'); os.makedirs(out,exist_ok=True)
                try:
                    subprocess.run([so,'--headless','--nologo','--nodefault','--convert-to','pdf','--outdir',out,src],timeout=180,check=False)
                    name = os.path.splitext(os.path.basename(src))[0]+'.pdf'
                    prod = os.path.join(out,name)
                    if os.path.isfile(prod):
                        shutil.copy2(prod, os.path.join(ROOT,'donnees','medias',name))
                        return self._json(200,{'ok':True,'name':name})
                except Exception as e: return self._json(200,{'ok':False,'reason':str(e)})
                return self._json(200,{'ok':False,'reason':'Conversion non produite'})
            if p == '/api/open':
                tgt = safe(data.get('rel',''))
                if tgt:
                    try:
                        if sys.platform == 'win32': os.startfile(tgt)
                        elif sys.platform == 'darwin': subprocess.Popen(['open',tgt])
                        else: subprocess.Popen(['xdg-open',tgt])
                    except Exception: pass
                return self._json(200,{'ok':True})
            if p == '/api/shutdown':
                self._json(200,{'ok':True}); threading.Thread(target=HTTPD.shutdown,daemon=True).start(); return
            return self._json(404,{'error':'Route inconnue','path':p})
        except (BrokenPipeError, ConnectionResetError): pass
        except Exception as e: return self._json(500,{'error':str(e)})

    # Upload binaire brut
    def do_PUT(self): return self._upload()

    def _upload(self):
        try:
            folder = self.headers.get('x-fs-folder')
            name = unquote(self.headers.get('x-fs-name','fichier'))
            d = folder_dir(folder)
            if not d: return self._json(400,{'error':'Dossier inconnu'})
            os.makedirs(d,exist_ok=True)
            n = int(self.headers.get('Content-Length','0') or 0)
            buf = self.rfile.read(n)
            with open(os.path.join(d,safe_name(name)),'wb') as f: f.write(buf)
            return self._json(200,{'name':safe_name(name),'size':len(buf),'copied':True})
        except Exception as e: return self._json(500,{'error':str(e)})

def find_soffice():
    for c in ['soffice','libreoffice',r'C:\Program Files\LibreOffice\program\soffice.exe',r'C:\Program Files (x86)\LibreOffice\program\soffice.exe']:
        try:
            subprocess.run([c,'--version'],timeout=8,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            return c
        except Exception: pass
    return None

class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    _stopping = False

if __name__ == '__main__':
    START = time.time()
    for d in FOLDERS.values():
        os.makedirs(safe(d),exist_ok=True)
    try:
        HTTPD = Server(('0.0.0.0',PORT),Handler)
    except OSError as e:
        print('\n  [ERREUR] Impossible d ecouter sur le port %d : %s' % (PORT,e))
        print('  Le port est peut-etre deja utilise. Essayez deja :')
        print('    http://localhost:%d/regie.html' % PORT)
        print('  Ou changez de port :  set PORT=9000 && DEMARRER.bat')
        sys.exit(1)
    HTTPD._stopping = False
    persist_soon()
    print('\n  FREESTREAM (serveur Python de repli) pret, 100% hors ligne')
    print('  Regie   : http://localhost:%d/regie.html' % PORT)
    print('  Sorties : http://localhost:%d/index.html' % PORT)
    print('  Dossier : %s\n' % ROOT)
    # METHODE OpenPresenter : le .bat reste au premier plan, c'est le serveur
    # qui ouvre le navigateur APRES que le port reponde vraiment.
    if os.environ.get('OPEN') == '1' or os.environ.get('FREESTREAM_OPEN') == '1':
        def _ouvrir():
            time.sleep(0.4)
            for page in ('regie.html','index.html'):
                url = 'http://localhost:%d/%s' % (PORT,page)
                try:
                    if sys.platform == 'win32': subprocess.Popen(['explorer',url])
                    elif sys.platform == 'darwin': subprocess.Popen(['open',url])
                    else: subprocess.Popen(['xdg-open',url])
                except Exception: pass
                time.sleep(0.5)
        threading.Thread(target=_ouvrir,daemon=True).start()
    try: HTTPD.serve_forever()
    except KeyboardInterrupt: pass
    finally: HTTPD._stopping=True; persist(); HTTPD.server_close()
