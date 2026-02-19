#!/usr/bin/env bash
# setup.sh — PDF Export Pro dependency bootstrapper
#
# Downloads the three required third-party libraries into lib/
# and generates placeholder extension icons into icons/.
#
# Usage:
#   chmod +x setup.sh
#   ./setup.sh
#
# Requirements: curl (or wget), node >= 14

set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # no colour

info()    { echo -e "${BOLD}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()     { echo -e "${RED}[ERR]${NC}   $*"; exit 1; }

# ── Dependency check ───────────────────────────────────────────────────────

command -v node  >/dev/null 2>&1 || die "Node.js not found. Install it from https://nodejs.org"
command -v curl  >/dev/null 2>&1 || command -v wget >/dev/null 2>&1 || die "Neither curl nor wget found."

FETCH_CMD="curl"
command -v curl >/dev/null 2>&1 || FETCH_CMD="wget"

fetch() {
  local url="$1" dest="$2"
  if [ "$FETCH_CMD" = "curl" ]; then
    curl -fsSL --retry 3 "$url" -o "$dest"
  else
    wget -q --tries=3 "$url" -O "$dest"
  fi
}

# ── Create directories ─────────────────────────────────────────────────────

mkdir -p lib icons

# ── Download libraries ─────────────────────────────────────────────────────

info "Downloading Mozilla Readability…"
fetch \
  "https://cdn.jsdelivr.net/npm/@mozilla/readability@0.5.0/Readability.js" \
  "lib/Readability.js"
success "lib/Readability.js"

info "Downloading html2canvas…"
fetch \
  "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js" \
  "lib/html2canvas.min.js"
success "lib/html2canvas.min.js"

info "Downloading jsPDF…"
fetch \
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js" \
  "lib/jspdf.umd.min.js"
success "lib/jspdf.umd.min.js"

# ── Generate icons ─────────────────────────────────────────────────────────

info "Generating extension icons…"
node generate-icons.js
success "icons/icon{16,32,48,128}.png"

# ── Done ───────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Open Chrome and go to  chrome://extensions"
echo "  2. Enable 'Developer mode' (top-right toggle)"
echo "  3. Click 'Load unpacked' and select this folder:"
echo "     $(pwd)"
echo ""
