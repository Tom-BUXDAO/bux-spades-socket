import { Server } from 'socket.io';
import { Server as NetServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { NextApiResponse } from "next";
import type { GameState, Player } from "@/types/game";
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

    socket.on("create_game", (data: { userId: string }) => {
      try {
        const { userId } = data;
        if (!userId) {
          socket.emit('error', { message: 'User ID is required' });
          return;
        }

        // Generate a unique game ID
        const gameId = Math.random().toString(36).substring(7);
        const player: Player = {
          id: userId,
          name: `Player ${userId.substring(0, 4)}`,
          hand: [],
          tricks: 0,
          team: 1 as 1 | 2,
          position: 0
        };
        const newGame: GameState = {
          id: gameId,
          status: "WAITING",
          players: [player],
          currentPlayer: "",
          currentTrick: [],
          tricks: [],
          completedTricks: [],
          hands: {},
          bids: {},
          scores: { team1: 0, team2: 0 },
          dealerPosition: 0,
          northSouthTricks: 0,
          eastWestTricks: 0,
          currentTrickCardPlayers: [],
          cardPlayers: {},
          createdAt: new Date().toISOString()
        };

        // Store the game in memory
        games.set(gameId, newGame);

        // Join the game room
        socket.join(gameId);

        // Emit the game state to the creator
        socket.emit('game_created', newGame);

        // Broadcast the updated game list to all clients
        if (io) {
          io.emit('game_list_updated', Array.from(games.values()));
        }
      } catch (error) {
        console.error('Error creating game:', error);
        socket.emit('error', { message: 'Failed to create game' });
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
          game.dealerPosition = 3;
        }

        games.set(gameId, game);
        if (io) {
          io.emit("game_list_updated", Array.from(games.values()));
          io.to(gameId).emit("game_updated", game);
        }
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