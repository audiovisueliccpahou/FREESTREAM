#!/usr/bin/env bash
# =============================================================================
#  FREESTREAM — démarrage en UN CLIC (macOS / Linux)
#  Vérifie l'environnement, installe Python si nécessaire (avec accord),
#  démarre le serveur, attend qu'il réponde, puis ouvre le navigateur.
#  Si rien n'est disponible : ouvre quand même la régie en MODE DOSSIER.
# =============================================================================
set -u
cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"
PORT="${FREESTREAM_PORT:-8787}"
BASE="http://localhost:$PORT"
LOG="$ROOT/demarrage.log"

G='\033[32m'; Y='\033[33m'; R='\033[31m'; C='\033[36m'; D='\033[90m'; N='\033[0m'
ESC="$(printf '\033')"
step() { printf "  %b\n" "$1"; printf "[%s] %s\n" "$(date +%H:%M:%S)" "$(printf '%s' "$1" | sed "s/${ESC}\[[0-9;]*m//g")" >> "$LOG"; }
: > "$LOG"

printf '\n'
printf '  ╔══════════════════════════════════════════════════════════╗\n'
printf '  ║   FREESTREAM — régie de culte 100 %% hors ligne         ║\n'
printf '  ╚══════════════════════════════════════════════════════════╝\n\n'
step "Dossier du projet : $ROOT"

OS="$(uname -s 2>/dev/null || echo Unknown)"
step "Système détecté : $OS"

# ---------------------------------------------------------------- navigateur
open_url() {
  if [ "$OS" = "Darwin" ]; then
    if command -v open >/dev/null 2>&1; then open "$1" >/dev/null 2>&1; return; fi
  else
    for b in xdg-open gnome-open kde-open sensible-browser; do
      if command -v "$b" >/dev/null 2>&1; then "$b" "$1" >/dev/null 2>&1 & return; fi
    done
  fi
  printf "  ${Y}Ouvrez manuellement : %s${N}\n" "$1"
}

# ------------------------------------------------------------- vérifications
health() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 2 "$BASE/api/health" >/dev/null 2>&1 && return 0
  else
    python3 - "$BASE/api/health" <<'PY' >/dev/null 2>&1
import sys, urllib.request
try:
    urllib.request.urlopen(sys.argv[1], timeout=2).read(); sys.exit(0)
except Exception: sys.exit(1)
PY
    [ $? -eq 0 ] && return 0
  fi
  return 1
}

SERVER_PID=""
start_server() {
  local label="$1"; shift
  step "Démarrage : ${C}$label${N}"
  "$@" >> "$LOG" 2>&1 &
  SERVER_PID=$!
  local i=0
  while [ $i -lt 20 ]; do
    sleep 0.5
    if health; then step "${G}✓ Serveur $label opérationnel sur le port $PORT.${N}"; return 0; fi
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then break; fi
    i=$((i+1))
  done
  step "${Y}  $label n'a pas répondu.${N}"
  kill "$SERVER_PID" 2>/dev/null || true
  SERVER_PID=""
  return 1
}

# ------------------------------------------- installation optionnelle de Python
ensure_python() {
  if command -v python3 >/dev/null 2>&1 && python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3,7) else 1)' 2>/dev/null; then
    step "${G}✓ Python 3 détecté : $(python3 --version 2>&1).${N}"; return 0
  fi
  step "${Y}Python 3 absent — installation possible.${N}"
  printf "  Installer Python 3 automatiquement ? (nécessite Internet) [o/N] : "
  read -r answer 2>/dev/null || answer=""
  case "$answer" in
    o|O|y|Y) ;;
    *) step "${Y}Installation refusée — le mode dossier reste disponible.${N}"; return 1 ;;
  esac
  if [ "$OS" = "Darwin" ]; then
    if command -v brew >/dev/null 2>&1; then
      step "Installation via Homebrew…"; brew install python3 >> "$LOG" 2>&1
    else
      step "Installation via les outils de développement Apple…"
      xcode-select --install >> "$LOG" 2>&1 || true
      step "${Y}Si une fenêtre Apple s'ouvre, validez l'installation puis relancez.${N}"
    fi
  else
    if command -v apt-get >/dev/null 2>&1; then
      step "Installation via apt…"; (sudo apt-get update -qq && sudo apt-get install -y python3) >> "$LOG" 2>&1
    elif command -v dnf >/dev/null 2>&1; then sudo dnf install -y python3 >> "$LOG" 2>&1
    elif command -v pacman >/dev/null 2>&1; then sudo pacman -S --noconfirm python >> "$LOG" 2>&1
    elif command -v apk >/dev/null 2>&1; then sudo apk add python3 >> "$LOG" 2>&1
    else step "${Y}Aucun gestionnaire de paquets reconnu.${N}"
    fi
  fi
  if command -v python3 >/dev/null 2>&1; then step "${G}✓ Python 3 installé : $(python3 --version 2>&1).${N}"; return 0; fi
  step "${Y}Installation non aboutie — repli en mode dossier.${N}"; return 1
}

# ------------------------------------------------------------------ démarrage
STARTED=0
if command -v node >/dev/null 2>&1; then
  step "${G}✓ Node.js détecté ($(node --version)).${N}"
  if start_server "Node.js" node "$ROOT/server.js" "$PORT"; then STARTED=1; fi
else
  step "Node.js non détecté — recherche de Python…"
fi
if [ "$STARTED" -eq 0 ]; then
  if ensure_python; then
    if start_server "Python 3" python3 "$ROOT/server.py" "$PORT"; then STARTED=1; fi
  fi
fi

trap 'if [ -n "${SERVER_PID:-}" ]; then kill "$SERVER_PID" 2>/dev/null || true; fi' EXIT INT TERM

printf '\n'
if [ "$STARTED" -eq 1 ]; then
  open_url "$BASE/regie.html"
  sleep 1
  open_url "$BASE/index.html"
  printf '  ──────────────────────────────────────────────────────────\n'
  printf "    RÉGIE      : ${C}%s/regie.html${N}\n" "$BASE"
  printf "    LIENS OBS  : ${C}%s/index.html${N}\n" "$BASE"
  printf '  ──────────────────────────────────────────────────────────\n'
  step "Laissez ce terminal ouvert pendant le culte. Journal : $LOG"
  step "${D}Ctrl+C pour arrêter le serveur.${N}"
  if [ -n "$SERVER_PID" ]; then wait "$SERVER_PID"; fi
else
  # ------------------------------------------ REPLI : zéro installation
  step "${C}Ouverture en MODE DOSSIER — aucune installation requise.${N}"
  open_url "file://$ROOT/regie.html?mode=dossier"
  sleep 1
  open_url "file://$ROOT/index.html"
  printf '\n'
  step "${Y}Dans la régie, cliquez sur « 📂 Mode dossier » et sélectionnez ce dossier une fois.${N}"
  step "Les sorties OBS liront donnees/etat/live.js : tout fonctionne sans serveur."
  printf '\n'
  read -r -p "  Appuyez sur Entrée pour fermer… " _ 2>/dev/null || sleep 3
fi
