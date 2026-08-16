// ============================================================
//  B-Side main app: camera, location, timestamp, and composing
//  the final "now playing" card image.
// ============================================================

const el = (id) => document.getElementById(id);
const preview = el("preview");
const canvas = el("canvas");
const liveCard = el("liveCard");
const status = el("status");

let stream = null;             // the live camera stream
let facing = "environment";    // "environment" = rear camera, "user" = front
let currentTrack = null;       // last fetched Spotify track
let lastPlace = "";            // cached location name for the preview
let lastCoords = null;
let captured = false;

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
    showTrackInCard(readManualSong());
  }
}

el("spotifyBtn").addEventListener("click", () => {
  if (Spotify.isConnected()) {
    Spotify.logout();
    refreshSpotifyUI();
  } else {
    Spotify.login();
  }
});

async function updateNowPlaying() {
  try {
    currentTrack = await Spotify.getNowPlaying();
    showTrackInCard(currentTrack);
    if (!currentTrack) status.textContent = "Spotify connected — play a song to see it here.";
  } catch (e) {
    console.error(e);
  }
}

// Reflect a track in the live card's text.
function showTrackInCard(track) {
  el("npTitle").textContent = track && track.title ? track.title : "No song";
  el("npArtist").textContent = track && track.artist ? track.artist : "—";
  el("npAlbum").textContent = track && track.album ? track.album : "—";
}

// Keep the manual inputs live-updating the card as you type.
["manualTitle", "manualArtist", "manualAlbum"].forEach((id) =>
  el(id).addEventListener("input", () => showTrackInCard(readManualSong()))
);

// ---------- Camera ----------
async function startCamera() {
  stopCamera();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing },
      audio: false,
    });
    preview.srcObject = stream;
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

el("flipBtn").addEventListener("click", () => {
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

// Build the "place · time" footer string.
function footerText(place, when) {
  const stamp = when.toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
  return place ? `${place}  ·  ${stamp}` : stamp;
}

// Fetch location once up front so the preview footer looks complete.
async function primeLocation() {
  lastCoords = await getLocation();
  lastPlace = await placeName(lastCoords);
  el("metaLine").textContent = footerText(lastPlace, new Date());
}

// ---------- Shutter: take the photo ----------
el("captureBtn").addEventListener("click", async () => {
  if (!stream) { el("fileInput").click(); return; }   // no webcam → file picker
  status.textContent = "Capturing…";

  if (Spotify.isConnected()) await updateNowPlaying();
  else currentTrack = readManualSong();

  // Refresh location if we never got it, then compose.
  if (!lastCoords) { lastCoords = await getLocation(); lastPlace = await placeName(lastCoords); }
  await drawCard(preview, currentTrack, lastPlace, new Date());
  finishShot();
});

el("fileInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = async () => {
    if (Spotify.isConnected()) await updateNowPlaying();
    else currentTrack = readManualSong();
    if (!lastCoords) { lastCoords = await getLocation(); lastPlace = await placeName(lastCoords); }
    await drawCard(img, currentTrack, lastPlace, new Date());
    finishShot();
  };
  img.src = URL.createObjectURL(file);
});

function readManualSong() {
  const title = el("manualTitle").value.trim();
  const artist = el("manualArtist").value.trim();
  const album = el("manualAlbum").value.trim();
  if (!title && !artist) return null;
  return { title: title || "Untitled", artist, album, artUrl: "" };
}

function finishShot() {
  captured = true;
  stopCamera();
  liveCard.hidden = true;     // hides the photo, controls, and flip button
  canvas.hidden = false;
  el("manualSong").hidden = true;
  el("afterShot").hidden = false;
  status.textContent = "Nice shot. Save or share it below.";
}

el("retakeBtn").addEventListener("click", () => {
  captured = false;
  liveCard.hidden = false;
  canvas.hidden = true;
  el("afterShot").hidden = true;
  startCamera();
  refreshSpotifyUI();
});

// ============================================================
//  Compose the final card onto the canvas: a square photo on
//  top, then song / artist / album, player controls, and a
//  small location · time footer — like a music-app share card.
// ============================================================
async function drawCard(source, track, place, when) {
  const W = 1080;                       // card width in pixels
  const u = W / 1080;                   // scale unit (in case W changes)
  const margin = 60 * u;                // gap around the framed photo
  const photo = W - margin * 2;         // square photo size
  const photoBottom = margin + photo;   // y where the photo ends
  const H = photoBottom + 700 * u;      // room for text + controls below

  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Card background
  ctx.fillStyle = "#12121c";
  ctx.fillRect(0, 0, W, H);

  // 1) Square, center-cropped photo — framed with rounded corners + shadow.
  drawFramedPhoto(ctx, source, margin, margin, photo, 28 * u);

  ctx.textAlign = "center";
  const cx = W / 2;
  let y = photoBottom + 92 * u;

  // 2) Song title (bold) — wraps to at most two lines.
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${52 * u}px -apple-system, "Segoe UI", Roboto, sans-serif`;
  const titleLH = 58 * u;
  const titleLines = wrapLines(ctx, track ? track.title : "No song", W - 120 * u, 2);
  titleLines.forEach((line, i) => ctx.fillText(line, cx, y + i * titleLH));
  y += (titleLines.length - 1) * titleLH;   // push everything below down if it wrapped

  // 3) Artist.
  y += 58 * u;
  ctx.fillStyle = "#a0a0b0";
  ctx.font = `400 ${34 * u}px -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText(fit(ctx, track && track.artist ? track.artist : "—", W - 120 * u), cx, y);

  // 4) Album.
  y += 40 * u;
  ctx.fillStyle = "#6f6f80";
  ctx.font = `400 ${27 * u}px -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText(fit(ctx, track && track.album ? track.album : "—", W - 120 * u), cx, y);

  // 5) Decorative progress bar.
  y += 56 * u;
  const barW = W - 160 * u, barX = (W - barW) / 2, barH = 8 * u;
  roundRect(ctx, barX, y, barW, barH, barH / 2);
  ctx.fillStyle = "rgba(255,255,255,0.14)"; ctx.fill();
  const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  grad.addColorStop(0, "#1db954"); grad.addColorStop(1, "#7c5cff");
  roundRect(ctx, barX, y, barW * 0.38, barH, barH / 2);
  ctx.fillStyle = grad; ctx.fill();

  // 6) Player controls: prev · play · next.
  y += 78 * u;
  drawSkip(ctx, cx - 150 * u, y, 26 * u, false);
  drawSkip(ctx, cx + 150 * u, y, 26 * u, true);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(cx, y, 40 * u, 0, Math.PI * 2); ctx.fill();
  drawTriangle(ctx, cx + 4 * u, y, 18 * u, "#000");   // play glyph

  // 7) Location · time footer, small.
  y += 96 * u;
  ctx.fillStyle = "#6f6f80";
  ctx.font = `400 ${24 * u}px -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText(footerText(place, when), cx, y);

  // 8) B-Side mark, tucked into the photo's top-left corner.
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `800 ${30 * u}px -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText("B‑SIDE", margin + 26 * u, margin + 50 * u);
}

// --- drawing helpers ---
// Draw a center-cropped square photo with rounded corners and a soft shadow.
function drawFramedPhoto(ctx, src, x, y, size, radius) {
  ctx.save();
  // Soft drop shadow cast by the frame.
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 40 * (size / 960);
  ctx.shadowOffsetY = 18 * (size / 960);
  roundRect(ctx, x, y, size, size, radius);
  ctx.fillStyle = "#000";
  ctx.fill();
  ctx.restore();

  // Clip to the rounded square, then paint the cropped photo inside.
  ctx.save();
  roundRect(ctx, x, y, size, size, radius);
  ctx.clip();
  drawSquare(ctx, src, x, y, size);
  ctx.restore();
}

function drawSquare(ctx, src, x, y, size) {
  const sw = src.videoWidth || src.naturalWidth || size;
  const sh = src.videoHeight || src.naturalHeight || size;
  const s = Math.min(sw, sh);
  ctx.drawImage(src, (sw - s) / 2, (sh - s) / 2, s, s, x, y, size, size);
}

// Trim text with an ellipsis so it never overflows the card.
function fit(ctx, text, maxW) {
  if (!text) return "";
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

// Break text into up to `maxLines` lines that each fit `maxW`.
// The final line is ellipsized if there's still text left over.
function wrapLines(ctx, text, maxW, maxLines) {
  const words = (text || "").split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let cur = words[0];
  for (let i = 1; i < words.length; i++) {
    const test = cur + " " + words[i];
    if (ctx.measureText(test).width <= maxW) {
      cur = test;                                   // word fits on this line
    } else if (lines.length < maxLines - 1) {
      lines.push(cur); cur = words[i];              // start a new line
    } else {
      cur = cur + " " + words.slice(i).join(" ");   // out of lines: cram the rest
      break;
    }
  }
  lines.push(fit(ctx, cur, maxW));                  // ensure the last line fits
  return lines;
}

function drawTriangle(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.6, cy - r);
  ctx.lineTo(cx - r * 0.6, cy + r);
  ctx.lineTo(cx + r, cy);
  ctx.closePath();
  ctx.fill();
}

// A skip-forward / skip-back glyph (two triangles + a bar).
function drawSkip(ctx, cx, cy, r, forward) {
  ctx.save();
  ctx.translate(cx, cy);
  if (!forward) ctx.scale(-1, 1);
  ctx.fillStyle = "#ffffff";
  drawTriangle(ctx, -r * 0.2, 0, r * 0.7, "#ffffff");
  drawTriangle(ctx, r * 0.55, 0, r * 0.7, "#ffffff");
  ctx.fillRect(r * 0.95, -r * 0.7, r * 0.28, r * 1.4);
  ctx.restore();
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
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "B-Side" }); return; }
      catch { /* cancelled → fall through to download */ }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "b-side.jpg";
    a.click();
  }, "image/jpeg", 0.92);
});

// ---------- Startup ----------
(async function init() {
  if (location.search.includes("code=")) {
    await Spotify.handleRedirect();
  }
  await refreshSpotifyUI();
  startCamera();
  primeLocation();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
})();
