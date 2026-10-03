# Connecting your Wolt account

You only need a Wolt account to **order**. Browsing, Fetch and dry runs work without one.

Woltron keeps your Wolt session in `secrets.json` in its data folder (file mode `0600`) and never sends it
to the browser UI.

## Recommended: paste a login link

This gives Woltron **its own Wolt session**, separate from your browser.

1. Open [wolt.com](https://wolt.com) in a **private window** and log in with your email.
2. Wolt emails you a login button. **Don't click it.** Right-click it and choose **Copy link**.
3. In Woltron go to **Settings → Wolt account**, paste the link and click **Connect Wolt**.

Login emails usually wrap the link in a click-tracking redirect. Woltron follows it the same way your
browser would to find the login token.

## Alternative: paste a browser token

1. Log in on wolt.com (preferably in a private window).
2. Open DevTools (`F12`) → **Storage** (Firefox) or **Application** (Chrome) → **Cookies** → `wolt.com`.
3. Copy the value of **`__wrtoken`** and paste it into the same box in Settings.

Woltron accepts the value however your browser shows it: Firefox's `%22…%22`, Chrome's `"…"`,
`__wrtoken=…`, or a whole cookie header.

> **Why the private window?** Wolt issues a new refresh token every time a session renews and invalidates
> the old one. If your everyday browser tab and Woltron share one session, whichever renews second can
> get the whole session revoked, and Woltron gets signed out. A private window you close (without
> clicking *Log out*) never renews again, so the session stays Woltron's.

## Staying connected

- Access tokens last about 30 minutes. Woltron renews them automatically and saves each new refresh token.
- If Wolt rejects the session, **Settings → Wolt account** shows *Not connected* with the reason. Connect again
  with a fresh login link.
- **Disconnect** forgets the session on this computer.

## Limitations

- Woltron can't send the login email itself, because Wolt protects that step with a captcha. Request it on wolt.com.
- Accounts that require an extra SMS or MFA step can't be connected with a login link. Use the token method.
- Newer wolt.com sessions that use DoorDash's identity provider aren't supported yet. If a token fails with
  *invalid credentials*, log out and back in on wolt.com and try again.
