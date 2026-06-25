// GrabIt Server — yt-dlp backend
// Runs on Railway/Render/VPS for free
// Node.js + yt-dlp (Python)

const express = require("express");
const cors    = require("cors");
const { exec, spawn } = require("child_process");
const path    = require("path");
const fs      = require("fs");
const os      = require("os");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Your extension's secret key — put same value in background.js
const API_KEY = process.env.API_KEY || "grabit-secret-key-change-this";

app.use(cors({ origin: "*" }));
app.use(express.json());

// ── Auth middleware ──────────────────────────────────────────────
function auth(req, res, next) {
  const key = req.headers["x-api-key"] || req.query.key;
  if (key !== API_KEY) return res.status(401).json({ error: "unauthorized" });
  next();
}

// ── Health check (no auth) ───────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ ok: true, service: "GrabIt Server", version: "1.0.0" });
});

// ── Check yt-dlp is installed ────────────────────────────────────
function checkYtDlp() {
  return new Promise(resolve => {
    exec("yt-dlp --version", (err, stdout) => {
      resolve(!err ? stdout.trim() : null);
    });
  });
}

app.get("/health", auth, async (req, res) => {
  const version = await checkYtDlp();
  res.json({ ok: !!version, ytdlp: version || "not installed" });
});

// ── GET /info — video title, thumbnail, duration, formats ────────
app.post("/info", auth, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "url required" });

  const cmd = `yt-dlp --dump-json --no-playlist --no-warnings "${escapeUrl(url)}"`;
  exec(cmd, { timeout: 30000 }, (err, stdout, stderr) => {
    if (err) {
      console.error("yt-dlp error:", stderr);
      return res.status(500).json({ error: "fetch_failed", detail: stderr?.slice(0,200) });
    }
    try {
      const info = JSON.parse(stdout);

      // Build video formats (combined video+audio)
      const videoFormats = [];
      const audioFormats = [];
      const seen = new Set();

      // yt-dlp formats list
      (info.formats || []).forEach(f => {
        // Combined video+audio formats
        if (f.vcodec !== "none" && f.acodec !== "none" && f.ext === "mp4") {
          const q = f.height ? `${f.height}p` : (f.format_note || "unknown");
          if (!seen.has(q)) {
            seen.add(q);
            videoFormats.push({
              id: f.format_id,
              label: qualityLabel(f.height),
              quality: String(f.height || 0),
              ext: f.ext || "mp4",
              fps: f.fps,
              size: fmtBytes(f.filesize || f.filesize_approx),
              isAudio: false
            });
          }
        }
        // Audio only
        if (f.vcodec === "none" && f.acodec !== "none") {
          const abr = f.abr ? Math.round(f.abr) : 0;
          const q   = `${abr}kbps`;
          if (abr > 0 && !seen.has("audio_"+q)) {
            seen.add("audio_"+q);
            audioFormats.push({
              id: f.format_id,
              label: `${f.ext?.toUpperCase() || "M4A"} ${q}`,
              quality: String(abr),
              ext: f.ext || "m4a",
              size: fmtBytes(f.filesize || f.filesize_approx),
              isAudio: true,
              audioFormat: f.ext || "m4a"
            });
          }
        }
      });

      // Always add standard MP3 options at known qualities
      ["320","192","128"].forEach(kbps => {
        audioFormats.unshift({
          id: `mp3_${kbps}`,
          label: `MP3 ${kbps}kbps`,
          quality: kbps,
          ext: "mp3",
          size: "",
          isAudio: true,
          audioFormat: "mp3"
        });
      });

      // If no combined formats found, add standard video options
      if (videoFormats.length === 0) {
        ["2160","1440","1080","720","480","360"].forEach(h => {
          videoFormats.push({
            id: `bv[height<=${h}]+ba/b[height<=${h}]`,
            label: qualityLabel(parseInt(h)),
            quality: h,
            ext: "mp4",
            size: "",
            isAudio: false
          });
        });
      } else {
        // Sort highest quality first
        videoFormats.sort((a,b) => parseInt(b.quality||0) - parseInt(a.quality||0));
      }

      res.json({
        ok: true,
        title:     info.title || "",
        thumbnail: info.thumbnail || (info.thumbnails?.at(-1)?.url) || "",
        channel:   info.uploader || info.channel || "",
        duration:  info.duration || 0,
        videoFormats,
        audioFormats
      });
    } catch(e) {
      res.status(500).json({ error: "parse_failed", detail: e.message });
    }
  });
});

// ── POST /download — stream file directly ────────────────────────
app.post("/download", auth, (req, res) => {
  const { url, formatId, isAudio, audioFormat, quality } = req.body;
  if (!url) return res.status(400).json({ error: "url required" });

  const tmpDir  = os.tmpdir();
  const tmpFile = path.join(tmpDir, `grabit_${Date.now()}`);

  let formatStr;
  if (isAudio) {
    // Audio: convert to requested format
    const fmt = audioFormat || "mp3";
    const q   = quality     || "320";
    formatStr = `bestaudio`;
    // We'll use --extract-audio and --audio-format
  } else {
    // Video: pick closest quality
    const h = quality || "1080";
    formatStr = formatId?.startsWith("bv")
      ? formatId
      : `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`;
  }

  const args = [
    "--no-playlist",
    "--no-warnings",
    "-o", `${tmpFile}.%(ext)s`,
  ];

  if (isAudio) {
    const fmt = audioFormat || "mp3";
    const q   = quality || "320";
    args.push(
      "-f", "bestaudio",
      "--extract-audio",
      "--audio-format", fmt,
      "--audio-quality", q === "320" ? "0" : q === "192" ? "2" : "5"
    );
  } else {
    args.push("-f", formatStr);
  }

  args.push("--", url);

  console.log("yt-dlp args:", args.join(" "));

  const proc = spawn("yt-dlp", args, { timeout: 120000 });
  let stderr = "";
  proc.stderr.on("data", d => { stderr += d.toString(); });

  proc.on("close", code => {
    if (code !== 0) {
      console.error("yt-dlp failed:", stderr);
      return res.status(500).json({ error: "download_failed", detail: stderr.slice(0,300) });
    }
    // Find the downloaded file
    const ext  = isAudio ? (audioFormat || "mp3") : "mp4";
    const file = `${tmpFile}.${ext}`;

    // yt-dlp may choose a slightly different extension — find actual file
    const files = fs.readdirSync(tmpDir).filter(f => f.startsWith(path.basename(tmpFile)));
    if (!files.length) return res.status(500).json({ error: "file_not_found" });

    const actualFile = path.join(tmpDir, files[0]);
    const actualExt  = path.extname(files[0]).slice(1);

    res.setHeader("Content-Type", isAudio ? `audio/${actualExt}` : "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename="grabit.${actualExt}"`);

    const stream = fs.createReadStream(actualFile);
    stream.pipe(res);
    stream.on("end", () => {
      // Clean up temp file
      try { fs.unlinkSync(actualFile); } catch {}
    });
    stream.on("error", err => {
      console.error("Stream error:", err);
      try { fs.unlinkSync(actualFile); } catch {}
    });
  });
});

// ── Helpers ──────────────────────────────────────────────────────
function qualityLabel(h) {
  if (!h) return "Best";
  if (h >= 2160) return "4K (2160p)";
  if (h >= 1440) return "2K (1440p)";
  if (h >= 1080) return "Full HD (1080p)";
  if (h >= 720)  return "HD (720p)";
  if (h >= 480)  return "SD (480p)";
  return `${h}p`;
}

function fmtBytes(b) {
  if (!b) return "";
  if (b < 1048576) return (b/1024).toFixed(0)+" KB";
  return (b/1048576).toFixed(1)+" MB";
}

function escapeUrl(url) {
  return url.replace(/"/g, '\\"');
}

app.listen(PORT, () => {
  console.log(`GrabIt Server running on port ${PORT}`);
  checkYtDlp().then(v => {
    if (v) console.log(`yt-dlp version: ${v}`);
    else   console.warn("WARNING: yt-dlp not found! Run: pip install yt-dlp");
  });
});

// ── GET /download-get — for chrome.downloads.download() ─────────
// Called directly by Chrome's download manager (must be GET)
app.get("/download-get", (req, res) => {
  const { key, url, quality, isAudio, audioFormat } = req.query;
  if (key !== API_KEY) return res.status(401).send("Unauthorized");
  if (!url) return res.status(400).send("url required");

  const h   = quality || "1080";
  const fmt = isAudio === "true"
    ? "bestaudio"
    : `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`;

  const args = ["--no-playlist","--no-warnings","-o","-"];
  if (isAudio === "true") {
    // Can't pipe + extract audio easily — use temp file approach
    return res.status(400).json({ error:"use_post_for_audio" });
  }
  args.push("-f", fmt, "--", url);

  res.setHeader("Content-Type","video/mp4");
  res.setHeader("Content-Disposition",`attachment; filename="grabit_${Date.now()}.mp4"`);

  const proc = spawn("yt-dlp", args);
  proc.stdout.pipe(res);
  proc.stderr.on("data", d => console.error("yt-dlp:", d.toString()));
  proc.on("error", err => { console.error(err); res.end(); });
  req.on("close", () => proc.kill());
});
