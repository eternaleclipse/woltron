#!/usr/bin/env bash
# Per-user Linux install of the Woltron desktop app (no root needed).
#   npm run build && npm -w @woltron/desktop run dist && scripts/install-linux.sh
# Installs apps/desktop/release/linux-unpacked to ~/.local/opt/Woltron, adds a launcher + icons and
# registers the woltron:// URL handler. Restarts Woltron if it's running.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=apps/desktop/release/linux-unpacked
APP="$HOME/.local/opt/Woltron"
ICONS="$HOME/.local/share/icons/hicolor"
APPS="$HOME/.local/share/applications"
[ -x "$SRC/woltron" ] || { echo "Build first: npm run build && npm -w @woltron/desktop run dist" >&2; exit 1; }

running=0
if pgrep -f "$APP/woltron" >/dev/null; then running=1; pkill -TERM -f "$APP/woltron" || true; sleep 2; fi

mkdir -p "$APP" "$HOME/.local/bin" "$APPS"
rsync -a --delete "$SRC/" "$APP/"

# Icons get a content-hashed name: GNOME caches icons by name, so a new name is the only reliable way
# to make the launcher/dock pick up new artwork without logging out.
icon="woltron-$(md5sum assets/icon/png/512x512.png | cut -c1-8)"
find "$ICONS" -name 'woltron*.png' -delete 2>/dev/null || true
for s in 16 24 32 48 64 128 256 512; do
  f="assets/icon/png/${s}x${s}.png"
  [ -f "$f" ] && install -Dm644 "$f" "$ICONS/${s}x${s}/apps/$icon.png"
done

# --no-sandbox: Ubuntu's AppArmor blocks unprivileged user namespaces and chrome-sandbox can't be SUID
# without root. The window only loads Woltron's own local UI. Install the .deb with sudo for a sandboxed setup.
cat > "$HOME/.local/bin/woltron" <<EOF
#!/bin/sh
exec "$APP/woltron" --no-sandbox "\$@"
EOF
chmod +x "$HOME/.local/bin/woltron"

cat > "$APPS/woltron.desktop" <<EOF
[Desktop Entry]
Name=Woltron
Comment=Your very good food-fetching dog
Exec=$HOME/.local/bin/woltron %U
Icon=$icon
Type=Application
Terminal=false
Categories=Utility;
Keywords=wolt;food;order;delivery;
MimeType=x-scheme-handler/woltron;
StartupWMClass=woltron-desktop
EOF

touch "$ICONS"
gtk-update-icon-cache -f -q "$ICONS" 2>/dev/null || true
update-desktop-database "$APPS" 2>/dev/null || true
xdg-mime default woltron.desktop x-scheme-handler/woltron

echo "Installed Woltron to $APP (icon: $icon)"
if [ "$running" = 1 ]; then (setsid gtk-launch woltron >/dev/null 2>&1 </dev/null &); echo "Restarted Woltron"; fi
