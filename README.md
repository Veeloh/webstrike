# WEBSTRIKE

A browser-based tactical 5v5 bomb-defusal shooter (Terrorists vs Counter-Terrorists), inspired by the classic round-based formula. Fully original code, map and art. Built with Three.js, no build step.

## Modes

| Mode | Where it runs | Needs a server? |
|---|---|---|
| **Play vs Bots** | Entirely in your browser | No |
| **Host / Join (P2P)** | The host's browser runs the match, friends connect over WebRTC with a room code | No (uses the free public PeerJS signalling service) |
| **Dedicated server** | A Node process on your PC runs the match; everyone connects over WebSocket | Yes (your PC) |

GitHub Pages only serves static files, so it can't run game logic itself. That's why the online options are P2P (one player hosts) or a small Node server you run on your own PC.

## Put it on GitHub Pages

1. Create a GitHub repo and upload everything in this folder (keep the `js/` and `server/` folders).
2. Repo **Settings → Pages → Deploy from a branch → `main` / root**.
3. Open `https://<you>.github.io/<repo>/`.

Bot games work immediately. For friends: one person clicks **Host**, shares the 5-letter room code (or the link `…/?room=CODE`), and others click **Join**.

P2P notes: the host's browser is the "server", so the host's connection quality matters. Most home networks work; very strict NATs/mobile hotspots can fail because no TURN relay is configured.

## Run a dedicated server on your PC

```bash
npm install
npm start            # PORT=8080 TEAM_SIZE=5 BOTS=1 are optional env vars
```

The console prints your LAN address. Friends on the same network open `http://<your-LAN-IP>:8080` (the page is served by the same process) and click **Join server**; the URL field is pre-filled.

To play over the internet, either forward port 8080 on your router, or use a tunnel such as `cloudflared tunnel --url http://localhost:8080` and share the `https://…` address (the page will pre-fill a `wss://` URL).

If you open the **GitHub Pages** site and want to use your PC server, the server URL must be `wss://…` (browsers block plain `ws://` from an `https` page), so use a tunnel for that case. Or just have friends open the page from your PC's address instead.

## Controls

`WASD` move · `Mouse` aim · `LMB` fire · `RMB` scope (sniper) · `Space` jump · `Shift` walk · `C` crouch · `R` reload · `1/2/3` primary / secondary / knife · `B` buy menu · `Tab` scoreboard · hold `E` to plant (Terrorists, on site A/B) or defuse (Counter-Terrorists, next to the bomb).

## Rules

- First to 8 round wins takes the match, then it restarts.
- 9 s buy time, 105 s rounds, 40 s bomb timer, 3.2 s plant, 5 s defuse with kit / 10 s without.
- Economy: start $800, kill +$300, round win +$3250 (+$3500 for a bomb detonation), loss +$1900, cap $16000. Dead players lose their gear.
- Weapons: knife, pistol, heavy pistol, SMG, shotgun, assault rifle, sniper. Armor and CT defuse kit.
- Empty slots are filled with bots, which buy weapons, take routes to the sites, plant, defuse and fight.

## Project layout

```
index.html, style.css     menu + HUD
js/game.js                client: Three.js rendering, input, local player, HUD, menus
js/host.js                authoritative simulation: rounds, economy, bomb, damage, bot AI
js/data.js                map, weapons, collision and ray helpers (shared)
js/net.js                 PeerJS (P2P) and WebSocket transports
js/audio.js               synthesized sound effects
js/state.js               shared state object
server/server.js          dedicated server (static files + WebSocket + host.js)
server/smoke-test.mjs     headless bot-client used to test the server
```

How networking works: whoever runs `host.js` (the host's browser, or the Node server) owns health, money, rounds and bots. Clients move themselves, report their shots and hits, and receive 20 Hz snapshots. Hit detection is client-side (host validates weapon/teams), which is fine for friends but not cheat-proof.
