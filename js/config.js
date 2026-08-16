// ============================================================
//  B-Side configuration
//  1. Go to https://developer.spotify.com/dashboard  (free, no paid account)
//  2. Create an app. Any name/description is fine.
//  3. In the app's Settings, copy the "Client ID" and paste it below.
//  4. Under "Redirect URIs", add the EXACT URL where this app runs.
//     - Local testing on this PC:   http://127.0.0.1:5500
//     - Deployed (e.g. GitHub Pages): https://YOURNAME.github.io/bside/
//     You can add more than one. They must match character-for-character.
// ============================================================

window.BSIDE_CONFIG = {
  // Paste your Spotify Client ID between the quotes:
  SPOTIFY_CLIENT_ID: "27f0c7a556594be0bfa484b9c3644496",

  // Spotify permissions we ask for (read-only, just to see what's playing):
  SPOTIFY_SCOPES: "user-read-currently-playing user-read-playback-state user-read-recently-played",
};
