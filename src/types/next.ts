import type { Server as HTTPServer } from "http";
import type { Socket as NetSocket } from "net";
import type { Server as SocketServer } from "socket.io";

export interface ServerWithIO extends HTTPServer {
  io?: SocketServer;
}

export interface SocketWithIO extends NetSocket {
  server: ServerWithIO;
}

export interface NextApiResponseWithSocket extends Response {
  socket: SocketWithIO;
} 