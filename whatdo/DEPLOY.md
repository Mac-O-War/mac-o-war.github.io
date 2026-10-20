# Putting "What Do?" online as an installable app

## What's in this folder

| File / folder | What it does |
|---|---|
| `index.html` | The game. It still works if you just double-click it. |
| `manifest.webmanifest` | App name, icons, colours, full-screen landscape mode |
| `sw.js` | Service worker: lets the game install, play offline and update |
| `icons/` | App icons (Android, iPhone, desktop) |
| `screenshots/` | Pictures shown on Android's install sheet |
| `vendor/three.min.js` | The 3D engine, bundled so the game works offline |
| `fonts/` | The two game fonts, bundled for offline use |

Upload **the whole folder, keeping its structure**. The paths are relative, so it works at a domain root (`https://example.com/`) or in a subfolder (`https://example.com/whatdo/`).

## It must be served over HTTPS

Browsers only install PWAs from `https://` addresses (or `localhost` while testing). All of these are free and give you HTTPS automatically:

- **Netlify Drop:** go to app.netlify.com/drop and drag this folder onto the page. You get a link in seconds.
- **GitHub Pages:** push the folder to a repo, then open Settings → Pages → deploy from branch.
- **Cloudflare Pages:** upload the folder as a new project.

If you use your own web server, make sure `.webmanifest` is served as `application/manifest+json`. Most servers already do this.

## Link previews (Open Graph)

When someone shares the game link, sites like iMessage, WhatsApp, Discord, Facebook and X show a preview card using `screenshots/og-image.png` (1200×630).

The tags are set for **https://restoneuc.com/whatdo/index.html**, and the preview image is **https://restoneuc.com/whatdo/screenshots/og-image.png**. Make sure `screenshots/og-image.png` is uploaded. If the game ever moves, update `og:url`, `og:image`, `og:image:secure_url`, `twitter:image` and the `canonical` link near the top of `index.html`.

Most sites ignore relative image paths. To check the result, paste your link into opengraph.xyz or the Facebook Sharing Debugger.

## How players install it

- **Android (Chrome / Edge / Samsung):** an **⬇ INSTALL APP** button appears on the start screen. They can also use the browser menu ⋮ → **Install app**.
- **iPhone / iPad:** the start screen shows a hint. Tap **Share ⬆ → Add to Home Screen**.
- **Desktop (Chrome / Edge):** the install icon in the address bar, or the **INSTALL APP** button.

Once installed, it opens full screen in landscape with its own icon and works offline.

## Releasing an update

1. Upload the new `index.html` (and any changed files).
2. **`VERSION` in `sw.js` updates itself.** A git pre-commit hook in the repo root (`.git/hooks/pre-commit`) stamps it with the date and time whenever a commit includes game files. A new `VERSION` is what tells installed copies there's an update. On a machine without the hook, change it by hand to any new string.
3. Next time players open the game, they see **NEW VERSION — TAP TO UPDATE** on the menu. It never appears mid-run.

If you add new files, also add them to the `ASSETS` list in `sw.js` so they're available offline.

## Checking it

In desktop Chrome, open the site, press F12, then go to **Application → Manifest** and **Service workers**. The **Lighthouse** tab can run a full check.
