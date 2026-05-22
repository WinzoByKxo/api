// ═══════════════════════════════════════════════════════════════
//  NITROZEN BACKEND v3  —  yt-dlp powered audio extraction
//  Single file. No broken npm extractors. Pure reliability.
// ═══════════════════════════════════════════════════════════════

const express = require("express");
const cors = require("cors");
const ytSearch = require("yt-search");
const { spawn } = require("child_process");

const app = express();
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
const os = require("os");

app.use(cors());

// ─── REQUEST LOGGER ─────────────────────────────────────────
app.use((req, res, next) => {
  console.log(`\n📡 [${new Date().toLocaleTimeString()}] ${req.method} ${req.originalUrl}`);
  next();
});



// ═══════════════════════════════════════════════════════════════
//  GET /  —  Health check
// ═══════════════════════════════════════════════════════════════
app.get("/", (_req, res) => {
  console.log("✅ HEALTH CHECK — client connected");
  res.json({ status: "ok", message: "Nitrozen Backend v3 🎵" });
});

// ═══════════════════════════════════════════════════════════════
//  GET /search?q=  —  Search YouTube via yt-search
// ═══════════════════════════════════════════════════════════════
app.get("/search", async (req, res) => {
  const query = req.query.q;
  console.log(`\n🔍 [SEARCH] query: "${query}"`);

  if (!query) {
    console.log("❌ [SEARCH] Missing ?q= parameter");
    return res.status(400).json({ status: "error", error: "Missing ?q= parameter" });
  }

  try {
    const { videos } = await ytSearch(query);
    const results = videos.slice(0, 5).map((v) => ({
      id: v.videoId,
      title: v.title,
      artist: v.author.name,
      thumbnail: v.thumbnail,
      duration: v.timestamp,
      durationSeconds: v.seconds,
    }));

    console.log(`✅ [SEARCH] Found ${results.length} results:`);
    results.forEach((s, i) => console.log(`   ${i + 1}. ${s.title} [${s.duration}]`));

    res.json({ status: "ok", results });
  } catch (err) {
    console.error(`❌ [SEARCH] FAILED: ${err.message}`);
    res.status(500).json({ status: "error", error: "Search failed", detail: err.message });
  }
});

const https = require("https");
const ytdl = require("@distube/ytdl-core");

// List of public Piped instances to avoid 429
const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.in.projectsegfau.lt",
  "https://api.piped.projectsegfau.lt"
];

async function getPipedAudioUrl(videoId) {
  for (const api of PIPED_INSTANCES) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${api}/streams/${videoId}`, { signal: controller.signal });
      clearTimeout(timeout);
      
      if (!res.ok) continue;
      const data = await res.json();
      
      if (data && data.audioStreams && data.audioStreams.length > 0) {
        // Sort by bitrate descending
        const streams = data.audioStreams.sort((a, b) => b.bitrate - a.bitrate);
        return {
          url: streams[0].url,
          title: data.title,
          artist: data.uploader,
          thumbnail: data.thumbnailUrl,
          duration: data.duration,
          api: api
        };
      }
    } catch (e) {
      console.log(`   [PIPED] Failed ${api}: ${e.message}`);
    }
  }
  throw new Error("All Piped instances failed");
}

// ═══════════════════════════════════════════════════════════════
//  GET /stream?id=  —  Extract audio URL
// ═══════════════════════════════════════════════════════════════
app.get("/stream", async (req, res) => {
  const videoId = req.query.id;
  console.log(`\n🎵 [STREAM] Extracting info for: ${videoId}`);

  if (!videoId) {
    return res.status(400).json({ status: "error", error: "Missing ?id= parameter" });
  }

  try {
    const pipedData = await getPipedAudioUrl(videoId);
    console.log(`✅ [STREAM] Selected from ${pipedData.api}`);

    res.json({
      status: "ok",
      title: pipedData.title,
      artist: pipedData.artist,
      thumbnail: pipedData.thumbnail,
      duration: pipedData.duration,
      audioUrl: pipedData.url,
      format: {
        id: "piped",
        ext: "m4a/webm",
        bitrate: 128,
        codec: "auto",
      },
    });
  } catch (err) {
    console.error(`❌ [STREAM] FAILED: ${err.message}`);
    res.status(500).json({ status: "error", error: "Audio extraction failed", detail: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
//  GET /audio/:id  —  PROXY audio stream
// ═══════════════════════════════════════════════════════════════
app.get("/audio/:id", async (req, res) => {
  const videoId = req.params.id;
  console.log(`\n🔊 [AUDIO] Proxy stream request: ${videoId}`);

  try {
    const pipedData = await getPipedAudioUrl(videoId);
    console.log(`   [AUDIO] Streaming from: ${pipedData.api}`);
    
    https.get(pipedData.url, (streamRes) => {
      res.setHeader("Content-Type", streamRes.headers["content-type"] || "audio/webm");
      if (streamRes.headers["content-length"]) {
        res.setHeader("Content-Length", streamRes.headers["content-length"]);
      }
      
      console.log(`   ✅ [AUDIO] Stream STARTED`);
      let bytesStreamed = 0;
      
      streamRes.on("data", (chunk) => {
        bytesStreamed += chunk.length;
      });
      
      streamRes.on("end", () => {
        const sizeMB = (bytesStreamed / (1024 * 1024)).toFixed(2);
        console.log(`   ✅ [AUDIO] Stream COMPLETED — ${sizeMB} MB sent`);
      });
      
      streamRes.pipe(res);
      
      req.on("close", () => {
        streamRes.destroy();
        console.log(`   🔇 [AUDIO] Client disconnected`);
      });
    }).on("error", (err) => {
      console.error(`   ❌ [AUDIO] HTTPS GET ERROR: ${err.message}`);
      if (!res.headersSent) res.status(500).json({ error: "Stream error" });
    });
    
  } catch (err) {
    console.error(`   ❌ [AUDIO] SETUP ERROR: ${err.message}`);
    if (!res.headersSent) {
      res.status(500).json({ status: "error", error: "Failed to setup audio stream", detail: err.message });
    }
  }
});

// ═══════════════════════════════════════════════════════════════
//  START SERVER
// ═══════════════════════════════════════════════════════════════
app.listen(PORT, "0.0.0.0", () => {
  const publicUrl = process.env.PUBLIC_URL || "http://us.krishna.kajuhost.qzz.io:19132";

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Nitrozen Mobile API");
  console.log("  Server Online");
  console.log(`  Public URL:`);
  console.log(`  ${publicUrl}`);
  console.log(`  Port: ${PORT}`);
  console.log("  ─────────────────────────────────────────────────");
  console.log("  Endpoints:");
  console.log("       GET /            -> Health check");
  console.log("       GET /search?q=   -> Search YouTube");
  console.log("       GET /stream?id=  -> Audio URL (JSON info)");
  console.log("       GET /audio/:id   -> Proxy audio stream *");
  console.log("═══════════════════════════════════════════════════\n");

  // Check yt-dlp
  const check = spawn("yt-dlp", ["--version"]);
  check.stdout.on("data", (d) => {
    console.log(`  [OK] yt-dlp installed: v${d.toString().trim()}`);
  });
  check.on("error", () => {
    console.error("  [ERROR] yt-dlp NOT FOUND!");
    console.error("  Please install it to use this backend:");
    console.error("  Linux/Pterodactyl/Ubuntu:");
    console.error("    pip install yt-dlp");
    console.error("    or: pip3 install yt-dlp");
  });

  // Check ffmpeg (optional)
  const ff = spawn("ffmpeg", ["-version"]);
  ff.stdout.once("data", () => console.log("  [OK] ffmpeg installed"));
  ff.on("error", () => console.log("  [WARN] ffmpeg not found (optional - some formats may be unavailable)"));

  setTimeout(() => {
    console.log("═══════════════════════════════════════════════════\n");
    console.log("[INFO] Ready! Waiting for requests...\n");
  }, 1500);
});
