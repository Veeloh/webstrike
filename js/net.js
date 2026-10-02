// Transport layer (browser only).
//  - hostP2P / joinP2P : WebRTC via PeerJS (works from GitHub Pages, host's browser is the server)
//  - joinWS            : WebSocket to the dedicated Node server (server/server.js)
export class Net {
  constructor() {
    this.conns = new Map(); this.kind = null;
    this.onMsg = () => {}; this.onJoin = () => {}; this.onLeave = () => {};
    this.onOpen = () => {}; this.onErr = () => {}; this.onClose = () => {};
  }
  hostP2P(code) {
    this.kind = 'p2p-host';
    const peer = this.peer = new Peer('wstrike-' + code);
    peer.on('open', () => this.onOpen());
    peer.on('error', e => this.onErr(e.type || String(e)));
    peer.on('connection', c => {
      c.on('open', () => { this.conns.set(c.peer, c); this.onJoin(c.peer); });
      c.on('data', d => this.onMsg(c.peer, d));
      c.on('close', () => { this.conns.delete(c.peer); this.onLeave(c.peer); });
      c.on('error', () => {});
    });
  }
  joinP2P(code) {
    this.kind = 'p2p';
    const peer = this.peer = new Peer();
    peer.on('error', e => this.onErr(e.type || String(e)));
    peer.on('open', () => {
      const c = this.host = peer.connect('wstrike-' + code, { serialization: 'json' });
      c.on('open', () => this.onOpen());
      c.on('data', d => this.onMsg(null, d));
      c.on('close', () => this.onClose());
      c.on('error', () => this.onClose());
    });
  }
  joinWS(url) {
    this.kind = 'ws';
    const ws = this.ws = new WebSocket(url);
    ws.onopen = () => this.onOpen();
    ws.onmessage = e => { try { this.onMsg(null, JSON.parse(e.data)); } catch (_) {} };
    ws.onclose = () => this.onClose();
    ws.onerror = () => this.onErr('ws');
  }
  sendHost(m) {
    if (this.kind === 'ws') { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
    else if (this.host && this.host.open) this.host.send(m);
  }
  sendTo(id, m) { const c = this.conns.get(id); if (c && c.open) c.send(m); }
  broadcast(m, except) { for (const [id, c] of this.conns) if (id !== except && c.open) c.send(m); }
}
