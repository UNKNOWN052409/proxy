#!/usr/bin/env bash
set -Eeuo pipefail

REPO="${UNIPROXY_REPO:-UNKNOWN052409/proxy}"
REF="${UNIPROXY_REF:-d467983}"
EXPECTED_SHA256="${UNIPROXY_ARCHIVE_SHA256:-5e0f186a4ae20b890e97b0e9250c27114c6805a1ffc941abd8ab0229b1e072f4}"
INSTALL_ROOT="${UNIPROXY_INSTALL_ROOT:-${HOME}/.local/share/npm-uniproxy}"
BIN_DIR="${UNIPROXY_BIN_DIR:-${HOME}/.local/bin}"
INSTALL_DIR="${INSTALL_ROOT}/${REF}"
ARCHIVE="$(mktemp "${TMPDIR:-/tmp}/npm-uniproxy.XXXXXX.tar.gz")"
EXTRACT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/npm-uniproxy-src.XXXXXX")"

cleanup() {
  rm -f "$ARCHIVE"
  rm -rf "$EXTRACT_DIR"
}
trap cleanup EXIT

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required." >&2
  exit 1
fi
if ! command -v tar >/dev/null 2>&1; then
  echo "tar is required." >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js 20+ and npm are required. Install them first (Termux: pkg install nodejs)." >&2
  exit 1
fi

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "GITHUB_TOKEN is required because the repository is private. Do not put it in this script." >&2
  echo "Create it in the current shell only, then re-run this installer." >&2
  exit 1
fi

URL="https://api.github.com/repos/${REPO}/tarball/${REF}"
curl --fail --silent --show-error --location \
  -H 'Accept: application/vnd.github+json' \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  "$URL" -o "$ARCHIVE"

ACTUAL_SHA256="$(sha256sum "$ARCHIVE" 2>/dev/null | awk '{print $1}' || shasum -a 256 "$ARCHIVE" | awk '{print $1}')"
if [[ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]]; then
  echo "Archive checksum mismatch; refusing to install." >&2
  echo "Expected: $EXPECTED_SHA256" >&2
  echo "Actual:   $ACTUAL_SHA256" >&2
  exit 1
fi

tar -xzf "$ARCHIVE" -C "$EXTRACT_DIR"
SOURCE_DIR="$(find "$EXTRACT_DIR" -mindepth 1 -maxdepth 1 -type d -print -quit)"
[[ -n "$SOURCE_DIR" && -f "$SOURCE_DIR/package.json" ]] || { echo "Downloaded archive has no package.json." >&2; exit 1; }

mkdir -p "$INSTALL_ROOT" "$BIN_DIR"
rm -rf "$INSTALL_DIR"
mv "$SOURCE_DIR" "$INSTALL_DIR"
(cd "$INSTALL_DIR" && npm ci --omit=dev --ignore-scripts)
ln -sfn "$INSTALL_DIR/bin/uniproxy.js" "$BIN_DIR/uniproxy"

cat <<EOF
Installed npm-uniproxy at: $INSTALL_DIR
Executable: $BIN_DIR/uniproxy
Add $BIN_DIR to PATH if needed:
  export PATH="$BIN_DIR:\$PATH"
Start the local gateway:
  uniproxy
EOF
