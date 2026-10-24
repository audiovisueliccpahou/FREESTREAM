// FREESTREAM — configuration centrale.
// Modifiable à la main : aucun build, aucun transpilage.

export const CANVAS_8K = Object.freeze({ w: 7680, h: 4320 });
export const PORT_DEFAULT = 8787;

export const TOOLS = Object.freeze([
  { id: 'bible',      label: 'Bible',        icon: '📖', short: 'B' },
  { id: 'chants',     label: 'Chants',       icon: '🎵', short: 'C' },
  { id: 'medias',     label: 'Médias',       icon: '🎬', short: 'M' },
  { id: 'lowerthird', label: 'Lowerthirds',  icon: '▭',  short: 'L' },
]);

export const FOLDERS = Object.freeze({
  bibles:      'donnees/bibles',
  chants:      'donnees/chants',
  lowerthirds: 'donnees/lowerthirds',
  medias:      'donnees/medias',
  projets:     'donnees/projets',
  designs:     'donnees/designs',
  polices:     'donnees/polices',
  etat:        'donnees/etat',
});

// Raccourcis clavier. L'utilisateur peut les redéfinir dans données/etat/state.json.
// On privilégie les réflexesuniversels : flèches = naviguer, Espace = suivant,
// Entrée = valider, Échap = masquer, 1..4 = outils, Ctrl+Z = revenir.
export const SHORTCUTS = Object.freeze({
  'ArrowRight':      'next',
  'ArrowLeft':       'prev',
  'ArrowDown':       'next',
  'ArrowUp':         'prev',
  ' ':               'next',
  'PageDown':        'next',
  'PageUp':          'prev',
  'Enter':           'confirm',
  'Escape':          'clear',
  'Backspace':       'clear',
  '1':               'tool:bible',
  '2':               'tool:chants',
  '3':               'tool:medias',
  '4':               'tool:lowerthird',
  'b':               'blackout',
  'n':               'blackout',
  'p':               'previewFullscreen',
  'l':               'previewLower',
  'f':               'sendFullscreen',
  's':               'sendLower',
  'm':               'orateurMessage',
});

export const MIME = Object.freeze({
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
  '.webp':'image/webp', '.gif':'image/gif', '.ico':'image/x-icon',
  '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf', '.otf':'font/otf',
  '.mp4':'video/mp4', '.webm':'video/webm', '.mov':'video/quicktime',
  '.mkv':'video/x-matroska', '.m4v':'video/mp4', '.ogv':'video/ogg',
  '.mp3':'audio/mpeg', '.wav':'audio/wav', '.ogg':'audio/ogg',
  '.m4a':'audio/mp4', '.flac':'audio/flac', '.aac':'audio/aac',
  '.pdf':'application/pdf', '.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.ppt':'application/vnd.ms-powerpoint',
  '.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt':'text/plain; charset=utf-8', '.md':'text/markdown; charset=utf-8',
  '.srt':'text/plain; charset=utf-8', '.vtt':'text/vtt; charset=utf-8',
});

export const MEDIA_EXT = Object.freeze({
  video: ['.mp4','.webm','.mov','.mkv','.m4v','.ogv'],
  audio: ['.mp3','.wav','.ogg','.m4a','.flac','.aac'],
  image: ['.png','.jpg','.jpeg','.webp','.gif','.svg'],
  doc:   ['.pdf','.pptx','.ppt','.docx'],
});

export function mediaKind(name = '') {
  const e = '.' + String(name).split('.').pop().toLowerCase();
  for (const [k, list] of Object.entries(MEDIA_EXT)) if (list.includes(e)) return k;
  if (/^https?:\/\//i.test(name)) return 'link';
  return 'link';
}

export const DEFAULT_FONT = 'FREESTREAM Sans';
export const FONT_STACK = `"FREESTREAM Sans", "Segoe UI", "Inter", "Helvetica Neue", Arial, sans-serif`;
