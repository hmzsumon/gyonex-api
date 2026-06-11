// types/global.d.ts
// ── declare global io for Socket.IO ───────────────────────────
import type { Server as SocketIOServer } from "socket.io";

declare global {
  // Access via globalThis.io
  // eslint-disable-next-line no-var
  var io: SocketIOServer | undefined;
}

// Access via global.io (Node's global)
declare namespace NodeJS {
  interface Global {
    io?: SocketIOServer;
  }
}

export {};
