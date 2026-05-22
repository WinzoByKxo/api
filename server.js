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

// ─── HELPER: run yt-dlp and collect stdout as string ────────
function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    const proc = spawn("yt-dlp", args);

    proc.stdout.on("data", (chunk) => (stdout += chunk));
    proc.stderr.on("data", (chunk) => (stderr += chunk));

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
      }
      resolve(stdout);
    });

    proc.on("error", (err) => {
      reject(new Error(`yt-dlp not found: ${err.message}. Install: pip install yt-dlp`));
    });
  });
}

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

// ═══════════════════════════════════════════════════════════════
//  GET /stream?id=  —  Extract audio URL using yt-dlp (JSON)
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
    // Step 1: Get full JSON dump from yt-dlp
    console.log("   [EXTRACT] Running yt-dlp --dump-single-json ...");
    const rawJson = await runYtDlp([
      "--dump-single-json",
      "--no-warnings",
      "--no-check-certificates",
      "--no-playlist",
      url,
    ]);

    const info = JSON.parse(rawJson);
    console.log(`   [VIDEO] Title: ${info.title}`);
    console.log(`   [VIDEO] Channel: ${info.uploader || info.channel}`);
    console.log(`   [VIDEO] Duration: ${info.duration}s`);

    // Step 2: Filter audio-only formats (acodec present, no video)
    const audioFormats = (info.formats || []).filter(
      (f) => f.acodec && f.acodec !== "none" && (!f.vcodec || f.vcodec === "none")
    );

    console.log(`   [FORMATS] Total: ${info.formats?.length || 0} | Audio-only: ${audioFormats.length}`);
    audioFormats.forEach((f) => {
      console.log(
        `     [FORMAT] id=${f.format_id} | ext=${f.ext} | codec=${f.acodec} | ${f.abr || "?"}kbps | url=${f.url ? "YES" : "NO"}`
      );
    });

    // Step 3: Pick best audio format (highest bitrate, must have URL)
    const validFormats = audioFormats.filter((f) => f.url);
    if (!validFormats.length) {
      console.log("❌ [STREAM] No audio formats with valid URLs");
      return res.status(404).json({ status: "error", error: "No playable audio formats found" });
    }

    validFormats.sort((a, b) => (b.abr || 0) - (a.abr || 0));
    const best = validFormats[0];

    console.log(`✅ [STREAM] Selected: ${best.format_id} (${best.ext}, ${best.acodec}, ${best.abr}kbps)`);
    console.log(`   [URL] Length: ${best.url.length} chars`);

    res.json({
      status: "ok",
      title: info.title,
      artist: info.uploader || info.channel,
      thumbnail: info.thumbnail,
      duration: info.duration,
      audioUrl: best.url,
      format: {
        id: best.format_id,
        ext: best.ext,
        bitrate: best.abr,
        codec: best.acodec,
      },
    });
  } catch (err) {
    console.error(`❌ [STREAM] FAILED: ${err.message}`);
    res.status(500).json({ status: "error", error: "Audio extraction failed", detail: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
//  GET /audio/:id  —  PROXY audio stream via yt-dlp
//  Most reliable! Pipes yt-dlp audio output directly to client.
//  No CORS issues. No expired URLs. No broken extractors.
// ═══════════════════════════════════════════════════════════════
app.get("/audio/:id", (req, res) => {
  const videoId = req.params.id;
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  console.log(`\n🔊 [AUDIO] Proxy stream request: ${videoId}`);
  console.log(`   [AUDIO] URL: ${url}`);
  console.log(`   [AUDIO] Spawning yt-dlp...`);

  const proc = spawn("yt-dlp", [
    "-f", "bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio",
    "-o", "-",           // output to stdout
    "--no-warnings",
    "--no-check-certificates",
    "--no-playlist",
    "--no-part",         // don't use .part files
    "--no-cache-dir",
    url,
  ]);

  let streamStarted = false;
  let stderrBuffer = "";
  let bytesStreamed = 0;

  proc.stdout.on("data", (chunk) => {
    if (!streamStarted) {
      streamStarted = true;
      res.setHeader("Content-Type", "audio/webm");
      res.setHeader("Transfer-Encoding", "chunked");
      console.log(`   ✅ [AUDIO] Stream STARTED — sending audio data...`);
    }
    bytesStreamed += chunk.length;
    res.write(chunk);
  });

  proc.stderr.on("data", (data) => {
    const line = data.toString().trim();
    if (line) {
      stderrBuffer += line + "\n";
      // Log download progress lines (they contain %)
      if (line.includes("%") || line.includes("Downloading")) {
        console.log(`   [YT-DLP] ${line}`);
      }
    }
  });

  proc.on("close", (code) => {
    if (streamStarted) {
      res.end();
      const sizeMB = (bytesStreamed / (1024 * 1024)).toFixed(2);
      console.log(`   ✅ [AUDIO] Stream COMPLETED — ${sizeMB} MB sent (exit code ${code})`);
    } else {
      console.error(`   ❌ [AUDIO] FAILED (exit code ${code})`);
      if (stderrBuffer) console.error(`   [STDERR] ${stderrBuffer.trim()}`);
      if (!res.headersSent) {
        res.status(500).json({
          status: "error",
          error: "Audio extraction failed",
          detail: stderrBuffer.trim().split("\n").pop() || `yt-dlp exit code ${code}`,
        });
      }
    }
  });

  proc.on("error", (err) => {
    console.error(`   ❌ [AUDIO] SPAWN ERROR: ${err.message}`);
    if (!res.headersSent) {
      res.status(500).json({
        status: "error",
        error: "yt-dlp not found on system",
        detail: "Install it: pip install yt-dlp",
      });
    }
  });

  // Clean up if client disconnects
  req.on("close", () => {
    if (!proc.killed) {
      proc.kill("SIGTERM");
      console.log(`   🔇 [AUDIO] Client disconnected — killed yt-dlp process`);
    }
  });
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
