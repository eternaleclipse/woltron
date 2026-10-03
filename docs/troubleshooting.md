# Troubleshooting

**Wolt shows "Not connected" after it worked before.**
Wolt revoked the session, often because a browser shared it ([why](connecting-wolt.md#alternative-paste-a-browser-token)).
Connect again with a fresh **login link**; this gives Woltron its own session.

**"Wolt rejected the login (401)".**
The link or token was already used or has expired. Request a new login email and paste the link without clicking it.

**Fetch only does keyword search / no reasons.**
No OpenRouter key is available. Set `OPENROUTER_API_KEY` or paste a key in **Settings → Fetch brain**.

**Desktop app won't start on Ubuntu: "SUID sandbox helper binary…".**
Use `scripts/install-linux.sh` (runs with `--no-sandbox`), install the `.deb` with sudo, or for development
run `npm -w @woltron/desktop run dev -- --no-sandbox`.

**The GNOME dock shows a generic icon.**
Reinstall with `scripts/install-linux.sh`. It registers the icon under a fresh name and sets
`StartupWMClass=woltron-desktop` so GNOME links the window to the launcher. Log out and back in if it persists.

**Old artwork or UI after an update (browser).**
Reload once with `Ctrl+Shift+R`. The desktop app clears its caches automatically after each update.

**Port 4321 is in use.**
Set `WOLTRON_PORT`. The desktop app falls back to the next free port by itself.

**My phone can't connect.**
Enable **Settings → Phone & devices → Allow devices on my network**, make sure both devices are on the same
network, and scan the QR code again (the link includes the pairing token).

**A run was "Skipped".**
Open it: the log says which guard stopped it (spending limit, venue closed, skip date, max total).
