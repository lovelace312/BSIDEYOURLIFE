// ============================================================
//  Spotify auth (Authorization Code + PKCE) and "now playing".
//  PKCE lets a plain browser app log in securely with NO server
//  and NO client secret. Tokens are kept in this browser only.
// ============================================================

const Spotify = (() => {
  const AUTH_URL = "https://accounts.spotify.com/authorize";
  const TOKEN_URL = "https://accounts.spotify.com/api/token";
  const STORE_KEY = "bside_spotify_tokens";
  const VERIFIER_KEY = "bside_pkce_verifier";

  // The redirect URI is simply this page's own URL (no query/hash).
  const redirectUri = location.origin + location.pathname;
  // Handy while setting up: this is the EXACT string Spotify must have registered.
  console.log("[B-Side] Redirect URI to register in Spotify:", redirectUri);

  // ---- small helpers ---------------------------------------------------
  const randomString = (len) => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    const bytes = crypto.getRandomValues(new Uint8Array(len));
    return Array.from(bytes, (b) => chars[b % chars.length]).join("");
  };

  const sha256 = async (str) => {
    const data = new TextEncoder().encode(str);
    return crypto.subtle.digest("SHA-256", data);
  };

  const base64url = (buf) =>
    btoa(String.fromCharCode(...new Uint8Array(buf)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const loadTokens = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)); }
    catch { return null; }
  };
  const saveTokens = (t) => {
    // Store an absolute expiry time so we know when to refresh.
    t.expires_at = Date.now() + (t.expires_in - 30) * 1000;
    localStorage.setItem(STORE_KEY, JSON.stringify(t));
  };

  // ---- public: are we logged in? --------------------------------------
  const isConnected = () => !!loadTokens();

  // ---- step 1: send the user to Spotify to approve --------------------
  const login = async () => {
    const clientId = window.BSIDE_CONFIG.SPOTIFY_CLIENT_ID;
    if (!clientId) {
      alert("Add your Spotify Client ID in js/config.js first.");
      return;
    }
    const verifier = randomString(64);
    localStorage.setItem(VERIFIER_KEY, verifier);
    const challenge = base64url(await sha256(verifier));

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      code_challenge_method: "S256",
      code_challenge: challenge,
      scope: window.BSIDE_CONFIG.SPOTIFY_SCOPES,
    });
    location.href = `${AUTH_URL}?${params}`;
  };

  const logout = () => {
    localStorage.removeItem(STORE_KEY);
  };

  // ---- step 2: on return, swap the ?code=... for tokens ---------------
  const handleRedirect = async () => {
    const url = new URL(location.href);
    const code = url.searchParams.get("code");
    if (!code) return false;

    const verifier = localStorage.getItem(VERIFIER_KEY);
    const body = new URLSearchParams({
      client_id: window.BSIDE_CONFIG.SPOTIFY_CLIENT_ID,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    });

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (res.ok) {
      saveTokens(await res.json());
    }
    // Clean the ?code=... out of the address bar.
    history.replaceState({}, "", redirectUri);
    return res.ok;
  };

  // ---- keep a fresh access token --------------------------------------
  const getAccessToken = async () => {
    let tokens = loadTokens();
    if (!tokens) return null;
    if (Date.now() < tokens.expires_at) return tokens.access_token;

    // Refresh it.
    const body = new URLSearchParams({
      client_id: window.BSIDE_CONFIG.SPOTIFY_CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    });
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) { logout(); return null; }
    const fresh = await res.json();
    // Spotify may omit a new refresh_token; keep the old one if so.
    if (!fresh.refresh_token) fresh.refresh_token = tokens.refresh_token;
    saveTokens(fresh);
    return fresh.access_token;
  };

  // ---- what is playing right now? -------------------------------------
  // Returns { title, artist, album, artUrl } or null.
  const getNowPlaying = async () => {
    const token = await getAccessToken();
    if (!token) return null;
    const headers = { Authorization: `Bearer ${token}` };

    // Try the live "currently playing" endpoint first.
    let res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", { headers });
    if (res.status === 200) {
      const data = await res.json();
      if (data && data.item) return trackFrom(data.item);
    }

    // Nothing live? Fall back to the most recently played track.
    res = await fetch("https://api.spotify.com/v1/me/player/recently-played?limit=1", { headers });
    if (res.status === 200) {
      const data = await res.json();
      const item = data.items && data.items[0] && data.items[0].track;
      if (item) return trackFrom(item);
    }
    return null;
  };

  const trackFrom = (item) => ({
    title: item.name,
    artist: (item.artists || []).map((a) => a.name).join(", "),
    album: item.album ? item.album.name : "",
    artUrl: item.album && item.album.images && item.album.images[0]
      ? item.album.images[0].url : "",
  });

  return { isConnected, login, logout, handleRedirect, getNowPlaying, redirectUri };
})();
