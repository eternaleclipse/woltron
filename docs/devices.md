# Phone & other devices

The web UI is fully responsive, with bottom tabs, bottom sheets and a big Fetch button, and it can be installed
as an app (PWA) on your phone's home screen.

## Pair your phone

1. On the computer running Woltron: **Settings → Phone & devices → Allow devices on my network**.
2. Scan the QR code with your phone (same Wi-Fi network).
3. Optional: in your phone's browser choose **Add to Home Screen**.

The QR link contains a **pairing token**. The phone stores it and sends it with every request, and the server
rejects other devices without it. **Rotate pairing code** signs out every paired device.

## Notes

- With LAN access on, the server listens on all interfaces (`0.0.0.0`) instead of `127.0.0.1`.
- Requests from the computer itself never need the token.
- Webhook URLs ([Automations](automations.md)) work from other devices once LAN access is on, and need only
  their own secret.
- For access away from home, put Woltron behind something like Tailscale rather than exposing the port to the internet.
