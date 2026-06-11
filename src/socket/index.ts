// src/socket/index.ts
import { Server as HTTPServer } from "http";
import { Socket, Server as SocketIOServer } from "socket.io";

/* ────────── singleton ────────── */
export let io: SocketIOServer | undefined;

/* রুম কী: quote room / user room */
export const quoteRoom = (sym: string) => `q:${sym.toUpperCase()}`;
export const userRoom = (uid: string | number) => `u:${uid}`;

/* ────────── attach socket.io to HTTP server ────────── */
export const attach = (server: HTTPServer): SocketIOServer => {
  io = new SocketIOServer(server, {
    cors: { origin: "*", credentials: true },
    transports: ["websocket"], // স্থিতিশীল
  });

  io.on("connection", (socket: Socket) => {
    console.log(`🟢 Socket connected: ${socket.id}`);

    /* ── (A) user room ── */
    socket.on("join-room", (userId: string) => {
      const room = userRoom(String(userId));
      socket.join(room);
      console.log(`📦 ${socket.id} joined room: ${room}`);
    });

    /* ── (B) quote subscribe/unsubscribe ── */
    socket.on("subscribe", (payload: { symbol?: string; channel?: string }) => {
      const sym = (payload?.symbol || payload?.channel || "")
        .toUpperCase()
        .trim();
      if (!sym) return;
      const room = quoteRoom(sym);
      socket.join(room);
      socket.emit("subscribed", { room, symbol: sym });
      console.log(`📡 ${socket.id} subscribed ${room}`);
    });

    socket.on(
      "unsubscribe",
      (payload: { symbol?: string; channel?: string }) => {
        const sym = (payload?.symbol || payload?.channel || "")
          .toUpperCase()
          .trim();
        if (!sym) return;
        const room = quoteRoom(sym);
        socket.leave(room);
        socket.emit("unsubscribed", { room, symbol: sym });
        console.log(`📴 ${socket.id} unsubscribed ${room}`);
      }
    );

    /* ── health ping ── */
    socket.on("ping:client", () => socket.emit("pong:server", Date.now()));

    socket.on("disconnect", () => {
      console.log(`🔴 Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

/* ────────── helper: নিরাপদে io.emit/to(...) ────────── */

type QuotePayload = {
  symbol: string;
  bid: number;
  ask: number;
  ts: number;
};

export function emitQuote(sym: string, payload: QuotePayload) {
  if (!io) return;
  const upper = sym.toUpperCase();
  const ev = `quote:${upper}`;
  const room = quoteRoom(upper);

  // Debug চাইলে এটাও রাখতে পারো:
  // console.log("[emitQuote] out", ev, payload);

  io.emit(ev, payload); // event-based
  io.to(room).emit("quote", payload); // room-based
}

export function emitToUser(userId: string | number, event: string, data: any) {
  if (!io) return;
  io.to(userRoom(userId)).emit(event, data);
}
