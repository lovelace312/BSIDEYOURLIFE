# B-Side 🎶📷

A tiny installable web app (PWA) that takes a photo and stamps it with **the song
you're playing on Spotify**, **where you are**, and **when** — then lets you save or
share the result as a single image. Built to run on **Windows** with no Mac and no
paid developer account.

---

## What each file is

| File | What it does |
|---|---|
| `index.html` | The single screen / layout |
| `styles.css` | Looks & theme |
| `js/config.js` | **You edit this** — your Spotify Client ID goes here |
| `js/spotify.js` | Logs into Spotify securely (PKCE) and reads the current song |
| `js/app.js` | Camera, location, timestamp, and drawing the final card |
| `manifest.webmanifest` + `service-worker.js` | Makes it installable on your iPhone |
| `tools/make-icons.html` | Open in a browser once to generate the app icons |

---

## Step 1 — Get a free Spotify Client ID

1. Go to **https://developer.spotify.com/dashboard** and log in with your normal
   Spotify account (free — no payment).
2. Click **Create app**. Name it `B-Side` (anything is fine). For "Redirect URI"
   you'll add real URLs in the next steps — for now put `http://127.0.0.1:5500`
   and check the **Web API** box.
3. Open the app's **Settings** and copy the **Client ID**.
4. Paste it into `js/config.js`:
   ```js
   SPOTIFY_CLIENT_ID: "paste-your-id-here",
   ```

---

## Step 2 — Make the icons (one time)

Open `tools/make-icons.html` by double-clicking it. Click the button — your browser
downloads three PNG files. Move all three into the `icons/` folder.

---

## Step 3 — Test it on this PC

The camera and Spotify login need a proper web address (not a `file://` path), so
you need a little local web server. The easiest way:

1. Install **VS Code** (free), open this folder in it.
2. Install the **"Live Server"** extension (by Ritwick Dey).
3. Right-click `index.html` → **"Open with Live Server"**. It opens at
   `http://127.0.0.1:5500`.
4. Make sure that exact URL is in your Spotify app's Redirect URIs (Step 1.2).
5. Click **Connect Spotify**, approve, then play a song in Spotify and take a shot.

> No webcam on your PC? The shutter falls back to a file picker so you can still
> test the layout.

---

## Step 4 — Put it on your iPhone

Your phone can't reach this PC's local server, and the iPhone camera needs **HTTPS**.
The free fix is to host the folder online. Easiest option — **GitHub Pages**:

1. Create a free account at **https://github.com** and make a new repository
   (e.g. `bside`).
2. Upload all these files to it (drag-and-drop in the browser works).
3. Repo **Settings → Pages → Deploy from branch → `main` / root → Save**.
4. After a minute you'll get a URL like `https://YOURNAME.github.io/bside/`.
5. Add that **exact URL** to your Spotify app's Redirect URIs (Step 1.2).
6. On your iPhone, open that URL in **Safari**, then tap **Share → Add to Home
   Screen**. B-Side now has its own icon like a real app. 🎉

---

## Notes & limits

- iOS doesn't let any app read what *another* app is playing, so we read your song
  from **your Spotify account** via its API. If nothing is playing, B-Side uses your
  most recently played track, or you can type the song by hand.
- Location names come from the free OpenStreetMap service; if it can't find a name,
  it shows coordinates.
- Everything runs in your browser. Your Spotify login stays on your device.
