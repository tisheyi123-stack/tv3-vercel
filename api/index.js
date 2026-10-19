export const config = {
  runtime: 'edge',
};

const TELEWEBION_ENTRY = "https://ncdn.telewebion.ir/tv3/live/playlist.m3u8";

const COMMON_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Referer": "https://telewebion.com/",
  "Origin": "https://telewebion.com"
};

export default async function handler(request) {
  const url = new URL(request.url);

  if (url.pathname === "/live.m3u8") {
    return handleMasterManifest(request, url);
  }
  if (url.pathname === "/playlist.m3u8") {
    return handleSubPlaylist(request, url);
  }
  if (url.pathname === "/chunk") {
    return handleChunkProxy(request, url);
  }

  // HTML Player page
  return new Response(renderPlayerHtml(), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

async function handleMasterManifest(request, workerUrl) {
  try {
    const resp = await fetch(TELEWEBION_ENTRY, {
      headers: COMMON_HEADERS,
      redirect: "follow",
    });

    if (!resp.ok) {
      return new Response("Failed upstream: " + resp.status, { status: 502 });
    }

    const finalUrl = resp.url;
    const baseUrl = finalUrl.substring(0, finalUrl.lastIndexOf("/") + 1);
    const text = await resp.text();

    const lines = text.split("\n");
    const rewritten = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      if (trimmed.includes("EXT-X-VERSION")) return "#EXT-X-VERSION:6";
      if (trimmed.startsWith("#")) return line;
      
      const absoluteUrl = trimmed.startsWith("http") ? trimmed : new URL(trimmed, baseUrl).href;
      return `${workerUrl.origin}/playlist.m3u8?url=${encodeURIComponent(absoluteUrl)}`;
    }).filter(Boolean).join("\n");

    return new Response(rewritten, {
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return new Response("Master error: " + err.message, { status: 502 });
  }
}

async function handleSubPlaylist(request, workerUrl) {
  try {
    const targetUrl = workerUrl.searchParams.get("url");
    if (!targetUrl) return new Response("Missing url param", { status: 400 });

    const resp = await fetch(targetUrl, {
      headers: COMMON_HEADERS,
      redirect: "follow",
    });

    if (!resp.ok) {
      return new Response("Sub-playlist fetch failed", { status: 502 });
    }

    const finalUrl = resp.url;
    const baseUrl = finalUrl.substring(0, finalUrl.lastIndexOf("/") + 1);
    const text = await resp.text();

    const lines = text.split("\n");
    const rewritten = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      if (trimmed.includes("EXT-X-VERSION")) return "#EXT-X-VERSION:6";
      if (trimmed.startsWith("#")) return line;

      const chunkAbsolute = trimmed.startsWith("http") ? trimmed : new URL(trimmed, baseUrl).href;
      return `${workerUrl.origin}/chunk?url=${encodeURIComponent(chunkAbsolute)}`;
    }).filter(Boolean).join("\n");

    return new Response(rewritten, {
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return new Response("Subplaylist error: " + err.message, { status: 502 });
  }
}

async function handleChunkProxy(request, workerUrl) {
  try {
    const chunkUrl = workerUrl.searchParams.get("url");
    if (!chunkUrl) return new Response("Missing chunk url", { status: 400 });

    const resp = await fetch(chunkUrl, {
      headers: COMMON_HEADERS,
      redirect: "follow",
    });

    const headers = new Headers(resp.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cache-Control", "public, max-age=120");

    return new Response(resp.body, {
      status: resp.status,
      headers: headers,
    });
  } catch (err) {
    return new Response("Chunk proxy error: " + err.message, { status: 502 });
  }
}

function renderPlayerHtml() {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>پخش زنده شبکه سه سیما (IRIB TV3 HD)</title>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.7/dist/hls.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700;900&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Vazirmatn', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    body {
      background: radial-gradient(circle at top, #240808 0%, #110303 50%, #050101 100%);
      color: #ffffff;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .container {
      width: 100%;
      max-width: 960px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .header {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding: 12px 20px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(12px);
    }
    .channel-title {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 1.3rem;
      font-weight: 800;
      color: #fff;
    }
    .live-badge {
      background: #e50914;
      color: #fff;
      font-size: 0.8rem;
      font-weight: 900;
      padding: 5px 12px;
      border-radius: 20px;
      box-shadow: 0 0 14px rgba(229, 9, 20, 0.8);
      animation: pulse 1.8s infinite;
    }
    @keyframes pulse {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.7; transform: scale(0.96); }
      100% { opacity: 1; transform: scale(1); }
    }
    .player-wrapper {
      position: relative;
      width: 100%;
      padding-top: 56.25%; /* 16:9 Aspect Ratio */
      background: #000;
      border-radius: 24px;
      overflow: hidden;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.9), 0 0 40px rgba(229, 9, 20, 0.25);
      border: 2px solid rgba(255, 255, 255, 0.12);
    }
    video {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .persepolis-banner {
      margin-top: 28px;
      font-size: 2.7rem;
      font-weight: 900;
      color: #ff2a2a;
      text-align: center;
      letter-spacing: 1px;
      text-shadow: 0 0 25px rgba(255, 42, 42, 0.9), 0 0 50px rgba(220, 38, 38, 0.6);
      background: linear-gradient(180deg, #ffffff 0%, #ff4d4d 45%, #d90429 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      padding: 16px 36px;
      border-radius: 20px;
      background-color: rgba(217, 4, 41, 0.1);
      border: 2px solid rgba(217, 4, 41, 0.35);
      box-shadow: 0 10px 40px rgba(217, 4, 41, 0.25);
      animation: glow 2s ease-in-out infinite alternate;
      user-select: none;
    }
    @keyframes glow {
      from { filter: drop-shadow(0 0 12px rgba(255, 42, 42, 0.5)); transform: scale(1); }
      to { filter: drop-shadow(0 0 28px rgba(255, 42, 42, 0.95)); transform: scale(1.02); }
    }
    .footer-desc {
      margin-top: 14px;
      font-size: 1rem;
      color: #aaa;
      text-align: center;
    }
    @media (max-width: 650px) {
      .persepolis-banner {
        font-size: 1.8rem;
        padding: 12px 20px;
      }
      .channel-title {
        font-size: 1rem;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="channel-title">
        <span class="live-badge">پخش زنده</span>
        <span>شبکه سه سیما (IRIB TV3 HD)</span>
      </div>
      <div style="font-size: 0.9rem; color: #888;">Vercel Edge Network</div>
    </div>

    <div class="player-wrapper">
      <video id="videoPlayer" controls playsinline poster="https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/IRIB_TV3_LOGO.svg/1200px-IRIB_TV3_LOGO.svg.png"></video>
    </div>

    <div class="persepolis-banner">
      پرسپولیس سرور استقلاله
    </div>

    <div class="footer-desc">
      پخش زنده پایدار و بدون فیلترشکن از لبه‌های ابری Vercel Edge
    </div>
  </div>

  <script>
    const video = document.getElementById('videoPlayer');
    const streamSource = '/live.m3u8';

    video.muted = false;
    video.volume = 1.0;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 60
      });
      hls.loadSource(streamSource);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, function (event, data) {
        if (data.fatal) {
          switch(data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamSource;
    }
  </script>
</body>
</html>`;
}
