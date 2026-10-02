// Shared mutable state used by both the client (browser) and host logic (browser or Node).
export const G = {
  players: new Map(),   // id -> player
  myId: null,           // local player id (null on dedicated server)
  isHost: false,        // true when this process runs the simulation
  net: null,            // transport (host side: broadcast/sendTo)
  handle: null,         // client message handler (null on dedicated server)
  send: null,           // client -> host sender
  rs: { phase: 'freeze', tm: 0, round: 1, sT: 0, sCT: 0, bomb: { s: 'none', x: 0, z: 0, t: 0 }, hold: null, over: false },
};
