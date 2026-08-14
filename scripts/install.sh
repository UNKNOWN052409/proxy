#!/usr/bin/env bash
set -Eeuo pipefail

REF="${UNIPROXY_REF:-d467983}"
SHA256="${UNIPROXY_ARCHIVE_SHA256:-5e0f186a4ae20b890e97b0e9250c27114c6805a1ffc941abd8ab0229b1e072f4}"
ROOT="${UNIPROXY_INSTALL_ROOT:-${HOME}/.local/share/npm-uniproxy}"
BIN="${UNIPROXY_BIN_DIR:-${HOME}/.local/bin}"
DEST="$ROOT/$REF"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/npm-uniproxy.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

command -v curl >/dev/null || { echo 'curl is required.' >&2; exit 1; }
command -v tar >/dev/null || { echo 'tar is required.' >&2; exit 1; }
command -v node >/dev/null || { echo 'Node.js 20+ is required.' >&2; exit 1; }
command -v npm >/dev/null || { echo 'npm is required.' >&2; exit 1; }

curl -fsSL "https://codeload.github.com/UNKNOWN052409/proxy/tar.gz/$REF" -o "$TMP/source.tar.gz"
ACTUAL="$(sha256sum "$TMP/source.tar.gz" 2>/dev/null | awk '{print $1}' || shasum -a 256 "$TMP/source.tar.gz" | awk '{print $1}')"
[[ "$ACTUAL" == "$SHA256" ]] || { echo 'Checksum mismatch; installation stopped.' >&2; exit 1; }

tar -xzf "$TMP/source.tar.gz" -C "$TMP"
SRC="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d -print -quit)"
[[ -f "$SRC/package.json" ]] || { echo 'Invalid release archive.' >&2; exit 1; }
mkdir -p "$ROOT" "$BIN"
rm -rf "$DEST"
mv "$SRC" "$DEST"
(cd "$DEST" && npm ci --omit=dev --ignore-scripts)
ln -sfn "$DEST/bin/uniproxy.js" "$BIN/uniproxy"
printf 'Installed npm-uniproxy. Add %s to PATH, then run: uniproxy\n' "$BIN"
