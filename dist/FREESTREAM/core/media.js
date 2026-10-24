// Normalisation des médias : fichiers locaux, liens directs, YouTube (live ou VOD).
import { mediaKind } from './config.js';

export function youtubeId(url) {
  const m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|live\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/.exec(String(url || ''));
  return m ? m[1] : null;
}

/** Transforme une URL YouTube en URL embarquable contrôlable (enablejsapi). */
export function normalizeMediaUrl(raw) {
  const u = String(raw || '').trim();
  if (!u) return { src: '', kind: 'link', youtube: false };
  const yid = youtubeId(u);
  if (yid) return { src: `https://www.youtube-nocookie.com/embed/${yid}?enablejsapi=1&rel=0&modestbranding=1&playsinline=1&autoplay=1&mute=0`, kind: 'link', youtube: true, id: yid };
  if (/^https?:\/\//i.test(u)) {
    let kind = mediaKind(u);
    if (kind === 'link') {
      if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(u)) kind = 'video';
      else if (/\.(mp3|wav|ogg|m4a|flac)(\?|$)/i.test(u)) kind = 'audio';
      else if (/\.(png|jpe?g|webp|gif)(\?|$)/i.test(u)) kind = 'image';
      else if (/\.pdf(\?|$)/i.test(u)) kind = 'doc';
    }
    return { src: u, kind, youtube: false };
  }
  return { src: u, kind: mediaKind(u), youtube: false };
}

/** Commandes YouTube via postMessage (fonctionne sur les lives comme sur les VOD). */
export function ytCommand(iframe, func, args = []) {
  if (!iframe?.contentWindow) return;
  try { iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), 'https://www.youtube-nocookie.com'); } catch { }
}
export const ytPlay   = f => ytCommand(f, 'playVideo');
export const ytPause  = f => ytCommand(f, 'pauseVideo');
export const ytSeek   = (f, seconds, allow = true) => ytCommand(f, 'seekTo', [seconds, allow]);
export const ytMute   = f => ytCommand(f, 'mute');
export const ytUnMute = f => ytCommand(f, 'unMute');
export const ytVolume = (f, v) => ytCommand(f, 'setVolume', [Math.round(v * 100)]);

export function shortName(u) { try { return decodeURIComponent(String(u).split('/').pop().split('?')[0]); } catch { return String(u).split('/').pop(); } }
