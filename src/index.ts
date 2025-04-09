import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Add health check endpoint
app.get('/', (_req: express.Request, res: express.Response) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Configure CORS
const io = new Server(httpServer, {
  cors: {
    origin: [
      process.env.CLIENT_URL || "http://localhost:3000",
      "https://bux-spades-buxdaos-projects.vercel.app"
    ],
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["Content-Type"]
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  connectTimeout: 45000,
  maxHttpBufferSize: 1e8,
  path: '/socket.io/'
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

// Store active connections per user
const userConnections = new Map<string, Set<string>>();

// Error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Prevent crashes on uncaught exceptions
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Prevent crashes on unhandled promise rejections
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Handle closing previous connections
  socket.on('close_previous_connections', ({ userId }) => {
    console.log('Handling close_previous_connections for user:', userId);
    const connections = userConnections.get(userId) || new Set();
    connections.forEach((connId) => {
      if (connId !== socket.id) {
        console.log('Disconnecting previous connection:', connId);
        io.sockets.sockets.get(connId)?.disconnect();
      }
    });
    connections.add(socket.id);
    userConnections.set(userId, connections);
  });

  socket.on('create_game', ({ user }) => {
    try {
      if (!user || !user.id) {
        socket.emit('error', { message: 'Invalid user data provided' });
        return;
      }
      
      const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();

      // Check if the user already has a game
      let userAlreadyInGame = false;
      games.forEach((existingGame) => {
        if (existingGame.players.some(player => player.id === user.id)) {
          userAlreadyInGame = true;
        }
      });

      // If the user is already in a game, don't create a new one
      if (userAlreadyInGame) {
        console.log(`User ${user.name} (${user.id}) already has a game`);
        socket.emit('error', { message: 'You already have a game' });
        return;
      }

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
    // Remove the socket from user connections
    userConnections.forEach((connections, userId) => {
      connections.delete(socket.id);
      if (connections.size === 0) {
        userConnections.delete(userId);
      }
    });
  });

  // Add handler for get_games event
  socket.on('get_games', () => {
    console.log('Client requested games list, socket:', socket.id);
    socket.emit('games_update', Array.from(games.values()));
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
}); 