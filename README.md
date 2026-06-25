# GrabIt — Complete Setup Guide

## WHY A SERVER IS NEEDED FOR YOUTUBE

YouTube blocks all direct extraction attempts from browsers.
yt-dlp is a Python tool that bypasses this — but it MUST run on a server,
not inside a Chrome extension. This is how every working YouTube downloader works.

Good news: Server deploys FREE on Railway in about 10 minutes.

---

## STEP 1 — DEPLOY SERVER TO RAILWAY (FREE)

Railway gives you $5/month free credit — enough for this server.

1. Go to: https://railway.app
2. Sign up with GitHub (free)
3. Click "New Project" → "Deploy from GitHub repo"
   OR: Click "New Project" → "Empty Project" → drag the `grabit-server` folder

4. Railway auto-detects Node.js and builds using the Dockerfile

5. Add environment variables (click your service → Variables tab):
   API_KEY = grabit-my-secret-key-123   ← make up any strong key

6. Click Deploy. Wait ~2 minutes.

7. Go to Settings → Networking → Generate Domain
   You get a URL like: https://grabit-server-production.up.railway.app

---

## STEP 2 — UPDATE EXTENSION WITH YOUR SERVER URL

Open: extension/background/background.js

Change these two lines at the top:
  const SERVER_URL = "https://YOUR-APP.railway.app";
  const API_KEY    = "grabit-secret-key-change-this";

Replace with YOUR actual Railway URL and the API_KEY you set.

---

## STEP 3 — RELOAD EXTENSION

1. Chrome → chrome://extensions
2. Find GrabIt → click the ↺ reload button
3. Now open YouTube, paste URL in the YouTube tab → works!

---

## TEST YOUR SERVER

Open your browser and go to:
  https://YOUR-APP.railway.app/

You should see: {"ok":true,"service":"GrabIt Server","version":"1.0.0"}

---

## PROMO CODES (built in, ready to use)

The following codes unlock Pro for FREE (for testing):
  KRUNAL      → Lifetime Pro
  GRABIT2024  → Lifetime Pro
  TRYGRABIT   → 1 Month Free

Enter in Settings → Promo Code field inside the extension.

Add your own codes in background.js → PROMO_CODES object.

---

## SUPPORTED SITES (via yt-dlp)

YouTube, Instagram Reels, TikTok, Twitter/X, Facebook,
Vimeo, Dailymotion, Twitch clips, Reddit videos,
SoundCloud, Bandcamp, and 1800+ more sites.

---

## FORMATS AVAILABLE

VIDEO: 4K (2160p), 2K (1440p), 1080p, 720p, 480p, 360p — all MP4
AUDIO: MP3 320kbps, MP3 192kbps, MP3 128kbps, M4A, OGG, WAV

---

## TROUBLESHOOTING

"Server Unreachable" → Your Railway URL in background.js is wrong or server crashed
"Download Failed"    → yt-dlp needs update: run `pip install yt-dlp --upgrade` in Railway shell
"Unauthorized"       → API_KEY in background.js doesn't match Railway environment variable
