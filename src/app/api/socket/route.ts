import { Server as NetServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { NextApiResponse } from "next";
import type { GameState, Card } from "@/types/game";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const games = new Map<string, GameState>();

let io: SocketIOServer | null = null;

if (typeof window === "undefined" && !io) {
  io = new SocketIOServer({
    cors: {
      origin: "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("Client connected");

    socket.on("create_game", async ({ userId }) => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true },
        });

        if (!user) return;

        const gameId = Math.random().toString(36).substring(7);
        const game: GameState = {
          id: gameId,
          status: "WAITING",
          players: [{
            id: user.id,
            name: user.name || "Unknown",
            hand: [],
            tricks: 0,
            team: 1,
            position: 0
          }],
          currentPlayer: user.id,
          currentTrick: [],
          currentTrickCardPlayers: [],
          completedTricks: [],
          team1Score: 0,
          team2Score: 0,
          team1Bags: 0,
          team2Bags: 0,
          leadPosition: 0,
          dealerPosition: 3
        };

        games.set(gameId, game);
        io?.emit("games_update", Array.from(games.values()));
      } catch (error) {
        console.error("Error creating game:", error);
      }
    });

    socket.on("join_game", async ({ gameId, userId }) => {
      try {
        const game = games.get(gameId);
        if (!game || game.players.length >= 4) return;

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true },
        });

        if (!user) return;

        const position = game.players.length;
        const team = (position % 2 + 1) as 1 | 2;
        game.players.push({
          id: user.id,
          name: user.name || "Unknown",
          hand: [],
          tricks: 0,
          team,
          position
        });

        if (game.players.length === 4) {
          game.status = "BIDDING";
          game.players[3].isDealer = true;
          game.dealerPosition = 3;
          game.leadPosition = 0;
        }

        games.set(gameId, game);
        io?.emit("games_update", Array.from(games.values()));
        io?.to(gameId).emit("game_update", game);
      } catch (error) {
        console.error("Error joining game:", error);
      }
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected");
    });
  });

  io.listen(3001);
  console.log("Socket.io server started on port 3001");
}

export async function GET(req: Request) {
  return new Response("Socket server running", {
    headers: {
      "Access-Control-Allow-Origin": "http://localhost:3000",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
    },
  });
}

export async function OPTIONS(req: Request) {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "http://localhost:3000",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
    },
  });
} 