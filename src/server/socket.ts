import { Server } from "socket.io";
import { createServer } from "http";
import type { GameState, Card } from "@/types/game";
import { prisma } from "@/lib/prisma";

const httpServer = createServer();

const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
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

const games = new Map<string, GameState>();

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
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Helper function to deal cards
function dealCards(players: GameState['players']): GameState['players'] {
  const deck = shuffleArray(createDeck());
  
  // Deal 13 cards to each player
  return players.map((player, index) => ({
    ...player,
    hand: deck.slice(index * 13, (index + 1) * 13),
    bid: undefined,
    tricks: 0,
  }));
}

io.on("connection", (socket) => {
  console.log("Client connected");
  let currentGameId: string | null = null;

  // Send initial games list to newly connected client
  socket.emit("games_update", Array.from(games.values()));

  socket.on("get_games", () => {
    socket.emit("games_update", Array.from(games.values()));
  });

  socket.on("create_game", async ({ userId }) => {
    try {
      // Validate userId
      if (!userId) {
        socket.emit("error", { message: "User ID is required" });
        return;
      }

      // For test players, skip database check and user validation
      const isTestPlayer = userId.startsWith('test_');
      let user;

      if (!isTestPlayer) {
        // Check if user is already in a game
        for (const [_, existingGame] of games) {
          if (existingGame.players.some(p => p.id === userId)) {
            socket.emit("error", { message: "You are already in a game" });
            return;
          }
        }

        user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true },
        });

        if (!user) {
          socket.emit("error", { message: "User not found" });
          return;
        }
      } else {
        // For test players, create a mock user
        const [_, playerName] = userId.split('test_');
        user = {
          id: userId,
          name: playerName.split('_')[0], // Extract name from test ID
        };
      }

      // Generate or use test game ID
      const gameId = isTestPlayer ? "TEST_GAME" : Math.random().toString(36).substring(2, 8).toUpperCase();
      
      // Don't create a new test game if it already exists
      if (isTestPlayer && games.has(gameId)) {
        return;
      }

      const game: GameState = {
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
      };

      // Clean up abandoned games (skip test game)
      if (!isTestPlayer) {
        for (const [id, g] of games) {
          const gameCreatedAt = g.createdAt || Date.now();
          if (g.status === "WAITING" && g.players.length === 1 && Date.now() - gameCreatedAt > 30 * 60 * 1000) {
            games.delete(id);
          }
        }
      }

      // Add creation timestamp
      game.createdAt = Date.now();
      
      games.set(gameId, game);
      socket.join(gameId);
      currentGameId = gameId;
      
      // Emit success event to creator
      socket.emit("game_created", { gameId, game });
      
      // Broadcast updated games list
      io.emit("games_update", Array.from(games.values()));
      
      console.log(`Game ${gameId} created by ${isTestPlayer ? 'test player' : 'user'} ${user.name} (${user.id})`);
    } catch (error) {
      console.error("Error creating game:", error);
      socket.emit("error", { message: "Failed to create game" });
    }
  });

  socket.on("join_game", async ({ gameId, userId, testPlayer }) => {
    try {
      const game = games.get(gameId);
      if (!game || game.players.length >= 4) {
        socket.emit("error", { message: "Game not found or full" });
        return;
      }

      // Check if this player ID is already in the game
      if (game.players.some(p => p.id === userId)) {
        console.log("Player already in game:", userId);
        socket.emit("error", { message: "You are already in this game" });
        return;
      }

      let player;
      if (testPlayer) {
        // For test players, use the provided data and include browser session ID
        player = {
          id: userId,
          name: testPlayer.name,
          hand: [],
          tricks: 0,
          team: testPlayer.team,
          bid: undefined,
          browserSessionId: testPlayer.browserSessionId // Include browser session ID
        };
        console.log("Test player joining:", player);
      } else {
        // For real users, fetch from database
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true },
        });

        if (!user) {
          socket.emit("error", { message: "User not found" });
          return;
        }

        const team = testPlayer?.team || (game.players.length % 2 + 1) as 1 | 2;
        player = {
          id: user.id,
          name: user.name || "Unknown",
          hand: [],
          tricks: 0,
          team,
          bid: undefined
        };
      }

      game.players.push(player);
      socket.join(gameId);

      // Log the current state
      console.log("Player joined:", player.name, "Team:", player.team, "ID:", player.id, "Browser:", player.browserSessionId || "N/A");
      console.log("Current players:", game.players.map(p => ({ 
        name: p.name, 
        team: p.team, 
        id: p.id,
        browserSessionId: p.browserSessionId || "N/A"
      })));

      if (game.players.length === 4) {
        game.status = "BIDDING";
        game.players = dealCards(game.players);
        game.currentPlayer = game.players[0].id; // First player starts bidding
      }

      games.set(gameId, game);
      io.emit("games_update", Array.from(games.values()));
      io.to(gameId).emit("game_update", game);
    } catch (error) {
      console.error("Error joining game:", error);
      socket.emit("error", { message: "Failed to join game" });
    }
  });

  socket.on("make_bid", ({ gameId, userId, bid }) => {
    try {
      const game = games.get(gameId);
      if (!game || game.status !== "BIDDING") return;

      // Find the player
      const playerIndex = game.players.findIndex(p => p.id === userId);
      if (playerIndex === -1 || game.currentPlayer !== userId) return;

      // Record the bid
      game.players[playerIndex].bid = bid;

      // Move to next player
      const nextPlayerIndex = (playerIndex + 1) % 4;
      game.currentPlayer = game.players[nextPlayerIndex].id;

      // Check if all players have bid
      if (game.players.every(p => p.bid !== undefined)) {
        game.status = "PLAYING";
        game.currentPlayer = game.players[0].id; // First player leads
      }

      games.set(gameId, game);
      io.to(gameId).emit("game_update", game);
    } catch (error) {
      console.error("Error making bid:", error);
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
    
    // Handle player disconnection
    if (currentGameId) {
      const game = games.get(currentGameId);
      if (game) {
        // Remove the player from the game
        const playerIndex = game.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          game.players.splice(playerIndex, 1);
          
          // If game is empty, remove it
          if (game.players.length === 0) {
            games.delete(currentGameId);
          } else {
            // Update game state
            games.set(currentGameId, game);
          }
          
          // Broadcast updates
          io.emit("games_update", Array.from(games.values()));
          if (game.players.length > 0) {
            io.to(currentGameId).emit("game_update", game);
          }
        }
      }
    }
  });
});

const PORT = 3001;
httpServer.listen(PORT, () => {
  console.log(`Socket.io server running on port ${PORT}`);
}); 