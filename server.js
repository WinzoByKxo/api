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

const ytdl = require("@distube/ytdl-core");

// ═══════════════════════════════════════════════════════════════
//  GET /stream?id=  —  Extract audio URL using ytdl-core (JSON)
//  Returns direct audio URL + metadata. For debugging / mobile.
// ═══════════════════════════════════════════════════════════════
app.get("/stream", async (req, res) => {
  const videoId = req.query.id;
  console.log(`\n🎵 [STREAM] Extracting info for: ${videoId}`);

  if (!videoId) {
    return res.status(400).json({ status: "error", error: "Missing ?id= parameter" });
  }

  const url = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    console.log("   [EXTRACT] Running ytdl.getInfo ...");
    const info = await ytdl.getInfo(url);
    const details = info.videoDetails;

    console.log(`   [VIDEO] Title: ${details.title}`);
    console.log(`   [VIDEO] Channel: ${details.author.name}`);
    console.log(`   [VIDEO] Duration: ${details.lengthSeconds}s`);

    const audioFormats = ytdl.filterFormats(info.formats, "audioonly");
    console.log(`   [FORMATS] Total: ${info.formats?.length || 0} | Audio-only: ${audioFormats.length}`);

    if (!audioFormats.length) {
      console.log("❌ [STREAM] No audio formats with valid URLs");
      return res.status(404).json({ status: "error", error: "No playable audio formats found" });
    }

    // Sort by highest audio bitrate
    audioFormats.sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
    const best = audioFormats[0];

    console.log(`✅ [STREAM] Selected: ${best.itag} (${best.container}, ${best.audioCodec}, ${best.audioBitrate}kbps)`);

    res.json({
      status: "ok",
      title: details.title,
      artist: details.author.name,
      thumbnail: details.thumbnails.length ? details.thumbnails[0].url : '',
      duration: details.lengthSeconds,
      audioUrl: best.url,
      format: {
        id: best.itag,
        ext: best.container,
        bitrate: best.audioBitrate,
        codec: best.audioCodec,
      },
    });
  } catch (err) {
    console.error(`❌ [STREAM] FAILED: ${err.message}`);
    res.status(500).json({ status: "error", error: "Audio extraction failed", detail: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
//  GET /audio/:id  —  PROXY audio stream via ytdl-core
//  Most reliable! Pipes audio output directly to client.
// ═══════════════════════════════════════════════════════════════
app.get("/audio/:id", async (req, res) => {
  const videoId = req.params.id;
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  console.log(`\n🔊 [AUDIO] Proxy stream request: ${videoId}`);
  console.log(`   [AUDIO] URL: ${url}`);
  console.log(`   [AUDIO] Spawning ytdl-core stream...`);

  try {
    const stream = ytdl(url, {
      filter: "audioonly",
      quality: "highestaudio",
      highWaterMark: 1 << 25, // 32MB buffer
    });

    let streamStarted = false;
    let bytesStreamed = 0;

    stream.on("response", (response) => {
      streamStarted = true;
      res.setHeader("Content-Type", response.headers["content-type"] || "audio/webm");
      res.setHeader("Transfer-Encoding", "chunked");
      console.log(`   ✅ [AUDIO] Stream STARTED — sending audio data...`);
    });

    stream.on("data", (chunk) => {
      bytesStreamed += chunk.length;
    });

    stream.on("end", () => {
      const sizeMB = (bytesStreamed / (1024 * 1024)).toFixed(2);
      console.log(`   ✅ [AUDIO] Stream COMPLETED — ${sizeMB} MB sent`);
    });

    stream.on("error", (err) => {
      console.error(`   ❌ [AUDIO] STREAM ERROR: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).json({ status: "error", error: "Audio stream failed", detail: err.message });
      } else {
        res.end();
      }
    });

    req.on("close", () => {
      stream.destroy();
      console.log(`   🔇 [AUDIO] Client disconnected — destroyed stream`);
    });

    stream.pipe(res);
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
