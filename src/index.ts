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

interface Card {
  suit: 'S' | 'H' | 'D' | 'C';
  rank: number;
}

interface Player {
  id: string;
  name: string;
  hand: Card[];
  tricks: number;
  team: number;
  bid?: number;
  browserSessionId?: string;
  isDealer?: boolean;
}

interface Game {
  id: string;
  status: string;
  players: Player[];
  currentPlayer: string;
  currentTrick: Card[];
  team1Score: number;
  team2Score: number;
  team1Bags: number;
  team2Bags: number;
  completedTricks: Card[][];
  createdAt: number;
}

// Store active games
const games = new Map<string, Game>();

// Store active connections per user
const userConnections = new Map<string, Set<string>>();

// Helper function to create a deck of cards
function createDeck(): Card[] {
  const suits = ['S', 'H', 'D', 'C'] as const;
  const ranks = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;
  const deck: Card[] = [];
  
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank });
    }
  }
  
  return deck;
}

// Helper function to shuffle an array
function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array]; // Create a copy to avoid modifying the original
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

// Helper function to deal cards
function dealCards(players: Player[]): Player[] {
  const deck = shuffleArray(createDeck());
  
  // Deal 13 cards to each player
  return players.map((player, index) => ({
    ...player,
    hand: deck.slice(index * 13, (index + 1) * 13),
    bid: undefined,
    tricks: 0,
  }));
}

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
    
    // Also remove user from any games they might be in
    for (const [gameId, game] of games.entries()) {
      if (game.players.some(p => p.id === userId)) {
        const playerIndex = game.players.findIndex(p => p.id === userId);
        
        // If game creator or last player, remove the game
        if (playerIndex === 0 || game.players.length === 1) {
          console.log("Removing game:", gameId);
          games.delete(gameId);
          io.to(gameId).emit("game_removed", { gameId });
        } else {
          // Otherwise just remove the player
          game.players.splice(playerIndex, 1);
          games.set(gameId, game);
          io.to(gameId).emit("game_update", game);
        }
      }
    }
    
    // Broadcast updated games list
    io.emit('games_update', Array.from(games.values()));
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
      let existingGameId = "";
      let foundGame: Game | undefined;
      
      games.forEach((game) => {
        if (game.players.some(player => player.id === user.id)) {
          userAlreadyInGame = true;
          existingGameId = game.id;
          foundGame = game;
        }
      });

      // If the user is already in a game, don't create a new one
      if (userAlreadyInGame && foundGame) {
        console.log(`User ${user.name} (${user.id}) already has a game: ${existingGameId}`);
        socket.join(existingGameId);
        socket.emit('game_created', { gameId: existingGameId, game: foundGame });
        return;
      }

      // Create a new player object with complete information
      const player: Player = {
        id: user.id,
        name: user.name || "Unknown Player",
        hand: [],
        tricks: 0,
        team: 1,
        bid: undefined
      };
      
      // Create new game with the player
      const game: Game = {
        id: gameId,
        status: "WAITING",
        players: [player],
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
      
      // Notify the client about the created game
      socket.emit('game_created', { gameId, game });
      
      // Update all clients with the new game list
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
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      if (game.players.length >= 4) {
        socket.emit('error', { message: 'Game is full' });
        return;
      }

      // Check if player is already in this game
      const existingPlayerIndex = game.players.findIndex((player: Player) => player.id === userId);
      
      if (existingPlayerIndex >= 0) {
        console.log('Player already in game, updating their info:', userId);
        
        // If player is already in this game, update their info
        game.players[existingPlayerIndex] = {
          ...game.players[existingPlayerIndex],
          name: testPlayer?.name || game.players[existingPlayerIndex].name || 'Unknown',
          team: testPlayer?.team || game.players[existingPlayerIndex].team,
          browserSessionId: testPlayer?.browserSessionId || game.players[existingPlayerIndex].browserSessionId
        };
      } else {
        // Add new player to the game
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
      }
      
      socket.join(gameId);

      // DON'T automatically change to bidding here, let start_game handle it
      
      games.set(gameId, game);
      io.emit('games_update', Array.from(games.values()));
      io.to(gameId).emit('game_update', game);
      
      // Also send a targeted update to ensure this client gets it
      socket.emit('game_update', game);
    } catch (error) {
      console.error('Error joining game:', error);
      socket.emit('error', { message: 'Failed to join game' });
    }
  });

  socket.on('start_game', (gameId) => {
    console.log('\n=== START GAME EVENT ===');
    console.log('1. Received start_game event for game:', gameId);
    
    const game = games.get(gameId);
    if (!game || game.players.length !== 4) {
      socket.emit('error', { message: 'Invalid game state' });
      return;
    }

    // Verify the request is coming from the game creator (first player)
    if (game.players[0].id !== socket.id && !socket.handshake.query.isTestClient) {
      console.log('Unauthorized start_game attempt, not from creator');
      socket.emit('error', { message: 'Only the game creator can start the game' });
      return;
    }

    // Deal cards and update game state
    const playersWithCards = dealCards(game.players);
    
    // Randomly choose first dealer
    const firstDealerIndex = Math.floor(Math.random() * 4);
    
    // Update the game with the new state
    game.status = "BIDDING";
    game.players = playersWithCards.map((p, i) => ({
      ...p,
      isDealer: i === firstDealerIndex
    }));
    
    // First player is to the left of the dealer
    game.currentPlayer = game.players[(firstDealerIndex + 1) % 4].id;
    
    // Update game state in memory
    games.set(gameId, game);
    console.log('2. Updated game state with dealer and cards');
    
    // Broadcast the game update to all sockets
    io.to(gameId).emit('game_update', game);
    io.emit('games_update', Array.from(games.values()));
    console.log('3. Broadcasted updates');
  });

  socket.on('leave_game', ({ gameId, userId }) => {
    console.log("Player leaving game:", userId, "from game:", gameId);
    
    const game = games.get(gameId);
    if (!game) return;

    // Remove the player from the game
    const playerIndex = game.players.findIndex(p => p.id === userId);
    if (playerIndex !== -1) {
      // If game creator leaves, remove the whole game
      if (playerIndex === 0 || game.players.length === 1) {
        console.log("Game creator or last player left, removing game:", gameId);
        games.delete(gameId);
        io.to(gameId).emit("game_removed", { gameId });
        socket.leave(gameId);
      } else {
        // Otherwise just remove the player
        game.players.splice(playerIndex, 1);
        games.set(gameId, game);
        io.to(gameId).emit("game_update", game);
      }
      
      // Broadcast updated games list
      io.emit("games_update", Array.from(games.values()));
    }

    socket.leave(gameId);
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

  // Add handler for get_games event with rate limiting
  const clientRequestTimes = new Map<string, number>();
  const RATE_LIMIT_MS = 1000; // 1 second between requests
  
  socket.on('get_games', () => {
    const now = Date.now();
    const lastRequestTime = clientRequestTimes.get(socket.id) || 0;
    
    // Check if this request is within the rate limit
    if (now - lastRequestTime < RATE_LIMIT_MS) {
      console.log(`Rate limiting get_games for socket: ${socket.id}`);
      return;
    }
    
    // Update the last request time
    clientRequestTimes.set(socket.id, now);
    
    console.log('Client requested games list, socket:', socket.id);
    socket.emit('games_update', Array.from(games.values()));
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
}); 