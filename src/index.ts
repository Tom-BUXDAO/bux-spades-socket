import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Add health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Configure CORS
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

interface Player {
  id: string;
  name: string;
  hand: string[];
  tricks: number;
  team: number;
  bid?: number;
  browserSessionId?: string;
}

interface Game {
  id: string;
  status: string;
  players: Player[];
  currentPlayer: string;
  currentTrick: string[];
  team1Score: number;
  team2Score: number;
  team1Bags: number;
  team2Bags: number;
  completedTricks: string[][];
  createdAt: number;
}

// Store active games
const games = new Map<string, Game>();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('create_game', ({ gameId, user }) => {
    try {
      const game: Game = {
        id: gameId,
        status: "WAITING",
        players: [{
          id: user.id,
          name: user.name || "Unknown Player",
          hand: [],
          tricks: 0,
          team: 1,
          bid: undefined,
        }],
        currentPlayer: user.id,
        currentTrick: [],
        team1Score: 0,
        team2Score: 0,
        team1Bags: 0,
        team2Bags: 0,
        completedTricks: [],
        createdAt: Date.now()
      };

      games.set(gameId, game);
      socket.join(gameId);
      
      socket.emit('game_created', { gameId, game });
      io.emit('games_update', Array.from(games.values()));
      
      console.log(`Game ${gameId} created by user ${user.name} (${user.id})`);
    } catch (error) {
      console.error('Error creating game:', error);
      socket.emit('error', { message: 'Failed to create game' });
    }
  });

  socket.on('join_game', ({ gameId, userId, testPlayer }) => {
    try {
      const game = games.get(gameId);
      if (!game || game.players.length >= 4) {
        socket.emit('error', { message: 'Game not found or full' });
        return;
      }

      if (game.players.some((player: Player) => player.id === userId)) {
        console.log('Player already in game:', userId);
        socket.emit('error', { message: 'You are already in this game' });
        return;
      }

      const player: Player = {
        id: userId,
        name: testPlayer?.name || 'Unknown',
        hand: [],
        tricks: 0,
        team: testPlayer?.team || (game.players.length % 2 + 1),
        bid: undefined,
        browserSessionId: testPlayer?.browserSessionId
      };

      game.players.push(player);
      socket.join(gameId);

      if (game.players.length === 4) {
        game.status = "BIDDING";
        game.currentPlayer = game.players[0].id;
      }

      games.set(gameId, game);
      io.emit('games_update', Array.from(games.values()));
      io.to(gameId).emit('game_update', game);
    } catch (error) {
      console.error('Error joining game:', error);
      socket.emit('error', { message: 'Failed to join game' });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
}); 