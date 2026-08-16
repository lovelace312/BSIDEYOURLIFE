// ============================================================
//  B-Side main app: camera, location, timestamp, and composing
//  the final "memory card" image.
// ============================================================

// Grab the elements we need.
const el = (id) => document.getElementById(id);
const preview = el("preview");
const canvas = el("canvas");
const nowPlayingBox = el("nowPlaying");
const status = el("status");

let stream = null;             // the live camera stream
let facing = "environment";    // "environment" = rear camera, "user" = front
let currentTrack = null;       // last fetched Spotify track
let captured = false;          // are we showing a photo (vs live preview)?

// ---------- Spotify button ----------
async function refreshSpotifyUI() {
  const btn = el("spotifyBtn");
  if (Spotify.isConnected()) {
    btn.textContent = "Spotify ✓";
    btn.classList.add("connected");
    el("manualSong").hidden = true;
    await updateNowPlaying();
  } else {
    btn.textContent = "Connect Spotify";
    btn.classList.remove("connected");
    el("manualSong").hidden = false;     // let the user type a song instead
  }
}

el("spotifyBtn").addEventListener("click", () => {
  if (Spotify.isConnected()) {
    Spotify.logout();
    nowPlayingBox.hidden = true;
    refreshSpotifyUI();
  } else {
    Spotify.login();
  }
});

async function updateNowPlaying() {
  try {
    const track = await Spotify.getNowPlaying();
    currentTrack = track;
    if (track) {
      el("npTitle").textContent = track.title;
      el("npArtist").textContent = track.artist;
      el("npArt").src = track.artUrl || "";
      nowPlayingBox.hidden = false;
    } else {
      nowPlayingBox.hidden = true;
      status.textContent = "Spotify connected, but nothing is playing right now.";
    }
  } catch (e) {
    console.error(e);
  }
}

// ---------- Camera ----------
async function startCamera() {
  stopCamera();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing },
      audio: false,
    });
    preview.srcObject = stream;
    preview.hidden = false;
    canvas.hidden = true;
  } catch (e) {
    console.error(e);
    status.textContent = "Camera unavailable — tap the shutter to pick a photo instead.";
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
}

el("switchBtn").addEventListener("click", () => {
  facing = facing === "environment" ? "user" : "environment";
  if (!captured) startCamera();
});

// ---------- Location ----------
function getLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}

// Turn coordinates into a friendly place name using the free
// OpenStreetMap Nominatim service.
async function placeName(coords) {
  if (!coords) return "";
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lon}&zoom=12`;
    const res = await fetch(url, { headers: { "Accept-Language": "en" } });
    const data = await res.json();
    const a = data.address || {};
    const city = a.city || a.town || a.village || a.suburb || a.county || "";
    const region = a.state || a.country || "";
    return [city, region].filter(Boolean).join(", ");
  } catch {
    return `${coords.lat.toFixed(3)}, ${coords.lon.toFixed(3)}`;
  }
}

// ---------- Shutter: take the photo ----------
el("shutterBtn").addEventListener("click", async () => {
  // If the live camera never started, fall back to the file picker.
  if (!stream) {
    el("fileInput").click();
    return;
  }
  status.textContent = "Capturing…";

  // Refresh the song at the exact moment of capture.
  if (Spotify.isConnected()) await updateNowPlaying();
  else currentTrack = readManualSong();

  // Gather location + time in parallel with nothing blocking the shot.
  const coords = await getLocation();
  const place = await placeName(coords);
  const when = new Date();

  drawCard(preview, currentTrack, place, when);
  finishShot();
});

el("fileInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = async () => {
    if (Spotify.isConnected()) await updateNowPlaying();
    else currentTrack = readManualSong();
    const coords = await getLocation();
    const place = await placeName(coords);
    drawCard(img, currentTrack, place, new Date());
    finishShot();
  };
  img.src = URL.createObjectURL(file);
});

function readManualSong() {
  const title = el("manualTitle").value.trim();
  const artist = el("manualArtist").value.trim();
  if (!title && !artist) return null;
  return { title: title || "Untitled", artist, album: "", artUrl: "" };
}

function finishShot() {
  captured = true;
  stopCamera();
  preview.hidden = true;
  canvas.hidden = false;
  nowPlayingBox.hidden = true;
  el("shutterBtn").hidden = true;
  el("switchBtn").hidden = true;
  el("retakeBtn").hidden = false;
  el("afterShot").hidden = false;
  status.textContent = "Nice shot. Save or share it below.";
}

el("retakeBtn").addEventListener("click", () => {
  captured = false;
  el("shutterBtn").hidden = false;
  el("switchBtn").hidden = false;
  el("retakeBtn").hidden = true;
  el("afterShot").hidden = true;
  startCamera();
  refreshSpotifyUI();
});

// ---------- Compose the final card onto the canvas ----------
async function drawCard(source, track, place, when) {
  // Match the canvas to the photo's real pixels (portrait-friendly).
  const sw = source.videoWidth || source.naturalWidth || 1080;
  const sh = source.videoHeight || source.naturalHeight || 1440;
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");

  // 1) The photo itself.
  ctx.drawImage(source, 0, 0, sw, sh);

  // 2) A gradient scrim at the bottom so text stays readable.
  const scrimH = sh * 0.34;
  const grad = ctx.createLinearGradient(0, sh - scrimH, 0, sh);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.82)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, sh - scrimH, sw, scrimH);

  const pad = Math.round(sw * 0.055);
  const unit = sw / 1080; // scale text to any resolution
  let y = sh - pad;

  // 3) Timestamp + place (bottom-most line).
  const stamp = when.toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
  const footer = place ? `${stamp}  ·  ${place}` : stamp;
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = `${Math.round(30 * unit)}px -apple-system, "Segoe UI", sans-serif`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(footer, pad, y);
  y -= Math.round(52 * unit);

  // 4) Song artist.
  if (track && track.artist) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = `${Math.round(34 * unit)}px -apple-system, "Segoe UI", sans-serif`;
    ctx.fillText(track.artist, pad + Math.round(96 * unit), y);
    y -= Math.round(44 * unit);
  }

  // 5) Song title (bold).
  const title = track ? track.title : "No song";
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${Math.round(46 * unit)}px -apple-system, "Segoe UI", sans-serif`;
  ctx.fillText(title, pad + Math.round(96 * unit), y);

  // 6) Album art thumbnail to the left of the song text.
  if (track && track.artUrl) {
    try {
      const art = await loadImage(track.artUrl);
      const size = Math.round(80 * unit);
      const ax = pad;
      const ay = y - Math.round(56 * unit);
      roundRect(ctx, ax, ay, size, size, Math.round(12 * unit));
      ctx.save();
      ctx.clip();
      ctx.drawImage(art, ax, ay, size, size);
      ctx.restore();
    } catch { /* album art is optional */ }
  }

  // 7) Little B-Side mark, top-left.
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = `800 ${Math.round(30 * unit)}px -apple-system, "Segoe UI", sans-serif`;
  ctx.fillText("B‑SIDE", pad, pad + Math.round(28 * unit));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // needed so we can export the canvas
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- Save / Share the finished card ----------
el("saveBtn").addEventListener("click", async () => {
  canvas.toBlob(async (blob) => {
    const file = new File([blob], "b-side.jpg", { type: "image/jpeg" });

    // On iPhone, Web Share lets you save straight to Photos or send it.
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "B-Side" });
        return;
      } catch { /* user cancelled; fall through to download */ }
    }
    // Desktop fallback: download the image.
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "b-side.jpg";
    a.click();
  }, "image/jpeg", 0.92);
});

// ---------- Startup ----------
(async function init() {
  // If we're returning from the Spotify login, finish that first.
  if (location.search.includes("code=")) {
    await Spotify.handleRedirect();
  }
  await refreshSpotifyUI();
  startCamera();

  // Register the service worker so the app is installable / works offline.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
})();
