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
  suit: 'H' | 'D' | 'C' | 'S';
  rank: number | string;
  playedBy?: {
    id: string;
    name: string;
    position: number;
  };
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
  image?: string;
  position: number;
}

interface Game {
  id: string;
  status: 'WAITING' | 'BIDDING' | 'PLAYING' | 'SCORING' | 'COMPLETE';
  players: Player[];
  currentPlayer: string;
  currentTrick: Card[];
  completedTricks: { cards: Card[]; winner: string }[];
  team1Score: number;
  team2Score: number;
  team1Bags: number;
  team2Bags: number;
  spadesBroken: boolean;
  createdAt: number;
  cardPlayers: string[];
  dealerPosition: number;
  scores: {
    team1: number;
    team2: number;
  };
}

interface TeamScore {
  bid: number;
  tricks: number;
  nilBids: number;
  madeNils: number;
  score: number;
  bags: number;
}

// Store active games
const games = new Map<string, Game>();

// Track user connections and rate limits
const userConnections = new Map<string, Set<string>>();
const lastUserOperations = new Map<string, Map<string, number>>();  // userId -> { operation -> timestamp }

// Rate limiting helper function
function isRateLimited(userId: string, operation: string, limitMs: number): boolean {
  if (!lastUserOperations.has(userId)) {
    lastUserOperations.set(userId, new Map());
  }
  
  const userOps = lastUserOperations.get(userId)!;
  const now = Date.now();
  const lastOpTime = userOps.get(operation) || 0;
  
  if (now - lastOpTime < limitMs) {
    return true;
  }
  
  userOps.set(operation, now);
  return false;
}

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
  
  // Deal 13 cards to each player, preserving position
  return players.map((player, index) => ({
    ...player,
    hand: deck.slice(index * 13, (index + 1) * 13),
    bid: undefined,
    tricks: 0,
    // Preserve the player's explicit position
    position: player.position
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
  let currentUserId: string | null = null;
  console.log('Client connected:', socket.id);

  // Send initial games list to newly connected client
  socket.emit('games_update', Array.from(games.values()));

  socket.on('authenticate', ({ userId }) => {
    if (!userId) return;
    
    // Store the userId for this socket
    currentUserId = userId;
    
    // Create an entry for this user if it doesn't exist
    if (!userConnections.has(userId)) {
      userConnections.set(userId, new Set());
    }
    
    // Add this socket to the user's connections
    userConnections.get(userId)!.add(socket.id);
    
    console.log(`User ${userId} authenticated with socket ${socket.id}`);
  });
  
  // Handle chat messages
  socket.on('chat_message', ({ gameId, message }) => {
    try {
      console.log(`Chat message received: gameId=${gameId}, from=${message.user}, text=${message.text}`);
      
      if (!gameId || !message) {
        socket.emit('error', { message: 'Invalid chat message data' });
        return;
      }
      
      // Rate limit chat messages to prevent spam - one message per 500ms
      if (message.userId && isRateLimited(message.userId, 'chat_message', 500)) {
        console.log(`Rate limiting chat for user: ${message.userId}`);
        return;
      }
      
      // Find the game
      const game = games.get(gameId);
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }
      
      // Make sure socket is in the right room
      if (!socket.rooms.has(gameId)) {
        console.log(`Socket ${socket.id} not in room ${gameId}, joining now`);
        socket.join(gameId);
      }
      
      // Ensure user is in the game or is a spectator
      const isPlayer = game.players.some(p => p.id === message.userId);
      const isSpectator = !isPlayer && message.userId.startsWith('guest_');
      
      if (!isPlayer && !isSpectator) {
        console.log(`Non-player attempting to chat: ${message.userId} in game ${gameId}`);
        // We'll still let them chat, but we log it
      }
      
      console.log(`Broadcasting chat message in game ${gameId} from ${message.user}: ${message.text}`);
      
      // Broadcast the message to everyone in the game
      io.to(gameId).emit('chat_message', message);
      
    } catch (error) {
      console.error('Error handling chat message:', error);
      socket.emit('error', { message: 'Failed to send chat message' });
    }
  });
  
  // Clean up handler for users having issues with old games
  socket.on('close_previous_connections', ({ userId }) => {
    if (!userId) return;
    
    // Rate limit this operation to once per 3 seconds
    if (isRateLimited(userId, 'close_previous_connections', 3000)) {
      console.log(`Rate limiting close_previous_connections for user: ${userId}`);
      return;
    }
    
    console.log(`Handling close_previous_connections for user: ${userId}`);
    
    // Store this socket as the most recent one for this user
    if (!userConnections.has(userId)) {
      userConnections.set(userId, new Set([socket.id]));
    } else {
      // Get all existing socket IDs for this user
      const connections = userConnections.get(userId)!;
      
      // Close all previous connections for this user
      for (const existingSocketId of connections) {
        // Don't close the current socket
        if (existingSocketId !== socket.id && io.sockets.sockets.get(existingSocketId)) {
          console.log(`Closing previous connection ${existingSocketId} for user ${userId}`);
          io.sockets.sockets.get(existingSocketId)?.disconnect(true);
        }
      }
      
      // Reset to just this socket
      connections.clear();
      connections.add(socket.id);
    }
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
        bid: undefined,
        image: user.image,
        position: 0 // Game creator always starts at position 0 (South)
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
        spadesBroken: false,
        completedTricks: [],
        createdAt: Date.now(),
        cardPlayers: [],
        dealerPosition: 0,
        scores: {
          team1: 0,
          team2: 0
        }
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

  socket.on('join_game', async ({ gameId, userId, testPlayer, position }) => {
    try {
      // Basic validation
      if (!gameId || !userId) {
        socket.emit('error', { message: 'Game ID and User ID are required' });
        return;
      }
      
      // Always join the socket room for this game
      socket.join(gameId);
      console.log(`Socket ${socket.id} joined room ${gameId}`);
      
      // Associate this userId with the current socket
      currentUserId = userId;
      if (!userConnections.has(userId)) {
        userConnections.set(userId, new Set());
      }
      userConnections.get(userId)!.add(socket.id);
      
      const game = games.get(gameId);
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }
      
      if (game.status !== 'WAITING') {
        socket.emit('error', { message: 'Game has already started' });
        return;
      }

      // Check if player is already in the game
      if (game.players.some(p => p.id === userId)) {
        console.log(`Player ${userId} is already in the game`);
        socket.emit('game_update', game);
        return;
      }
      
      if (game.players.length >= 4 && position === undefined) {
        socket.emit('error', { message: 'Game is full' });
        return;
      }

      // Create player object
      let player: Player;
      if (testPlayer) {
        // Explicitly set team based on position
        // Team 1: positions 0 (South) and 2 (North)
        // Team 2: positions 1 (West) and 3 (East)
        const team = position !== undefined 
          ? (position % 2 === 0 ? 1 : 2) 
          : testPlayer.team;
        
        player = {
          id: userId,
          name: testPlayer.name,
          hand: [],
          tricks: 0,
          team: team,
          browserSessionId: testPlayer.browserSessionId || socket.id,
          image: testPlayer.image || undefined,
          position: position || 0
        };
        
        console.log(`Created test player ${testPlayer.name} with team ${team} for position ${position}`);
      } else {
        // Explicitly set team based on position
        // Team 1: positions 0 (South) and 2 (North) 
        // Team 2: positions 1 (West) and 3 (East)
        const team = position !== undefined 
          ? (position % 2 === 0 ? 1 : 2) 
          : (game.players.length % 2) + 1 as 1 | 2;
        
        player = {
          id: userId,
          name: userId.startsWith('guest_') ? `Guest ${userId.split('_')[1].substring(0, 4)}` : userId,
          hand: [],
          tricks: 0,
          team: team,
          browserSessionId: socket.id,
          position: position || 0
        };
        
        console.log(`Created regular player with team ${team} for position ${position}`);
      }

      // HANDLE POSITION PLACEMENT
      if (position !== undefined) {
        console.log(`============EXPLICIT POSITION JOIN REQUEST============`);
        console.log(`Player ${player.name} requesting EXACT position ${position}`);
        
        // Validate position
        if (position < 0 || position > 3) {
          socket.emit('error', { message: 'Invalid position (must be 0-3)' });
          return;
        }
        
        // Check if position is already taken by checking the position property
        if (game.players.some(p => p.position === position)) {
          console.log(`Position ${position} already taken by another player!`);
          socket.emit('error', { message: `Position ${position} is already taken` });
          return;
        }
        
        // Set the position explicitly on the player object
        player.position = position;
        
        // No more array index manipulation - just add the player with correct position
        game.players.push(player);
        
        // Debug log each player's position and team
        console.log(`FINAL PLAYER ARRAY AFTER POSITIONING:`);
        game.players.forEach(p => {
          console.log(`Player ${p.name} at explicit position ${p.position} (Team ${p.team})`);
        });
        console.log(`================================================`);
      } else {
        // No position specified, determine next available position
        const usedPositions = new Set(game.players.map(p => p.position));
        let nextPosition = 0;
        while (usedPositions.has(nextPosition)) {
          nextPosition++;
        }
        player.position = nextPosition;
        game.players.push(player);
        console.log(`Player ${player.name} assigned to next available position ${nextPosition}`);
      }
      
      // Update the game
      games.set(gameId, game);
      io.emit('games_update', Array.from(games.values()));
      io.to(gameId).emit('game_update', game);
      
      // Send a targeted update to this client
      socket.emit('game_update', game);
    } catch (error) {
      console.error('Error joining game:', error);
      socket.emit('error', { message: 'Failed to join game' });
    }
  });

  socket.on('start_game', ({ gameId, userId }) => {
    console.log('\n=== START GAME EVENT ===');
    console.log(`1. Received start_game event for game: ${gameId} from user: ${userId}`);
    
    const game = games.get(gameId);
    if (!game || game.players.length !== 4) {
      console.log(`Game not found or doesn't have 4 players. Players: ${game?.players.length || 0}`);
      socket.emit('error', { message: 'Invalid game state' });
      return;
    }

    // Verify the request is coming from the game creator (first player)
    if (game.players[0].id !== userId && !socket.handshake.query.isTestClient) {
      console.log(`Unauthorized start_game attempt. Creator: ${game.players[0].id}, Requester: ${userId}`);
      socket.emit('error', { message: 'Only the game creator can start the game' });
      return;
    }

    console.log(`Game ${gameId} starting, authorized by creator ${game.players[0].id}`);

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
    
    // After bidding, the player to the left of the dealer bids first
    const dealer = game.players.find(p => p.isDealer);
    if (!dealer) {
      console.error('No dealer found!');
      return;
    }
    
    // Find the next player after the dealer
    const dealerPosition = dealer.position;
    const firstPosition = (dealerPosition + 1) % 4;
    const firstPlayer = game.players.find(p => p.position === firstPosition);
    
    console.log(`Dealer ${dealer.name} at position ${dealerPosition}`);
    console.log(`First player should be at position ${firstPosition}`);
    
    if (!firstPlayer) {
      console.error(`Could not find player at position ${firstPosition}`);
      return;
    }
    
    game.currentPlayer = firstPlayer.id;
    console.log(`First player to lead is ${firstPlayer.name} (${firstPlayer.id}) at position ${firstPosition}`);
    
    // Update game state in memory
    games.set(gameId, game);
    console.log('2. Updated game state with dealer and cards');
    
    // Broadcast the game update to all sockets
    io.to(gameId).emit('game_update', game);
    io.emit('games_update', Array.from(games.values()));
    console.log('3. Broadcasted updates');
  });

  socket.on('make_bid', ({ gameId, userId, bid }) => {
    console.log('\n=== MAKE BID EVENT ===');
    console.log(`Received make_bid event for game: ${gameId}, user: ${userId}, bid: ${bid}`);
    console.log(`Socket ID: ${socket.id}, Connected: ${socket.connected}`);
    
    // Validate inputs
    if (!gameId || !userId || bid === undefined || bid === null) {
      console.log('Invalid bid data received');
      socket.emit('error', { message: 'Invalid bid data' });
      return;
    }

    const game = games.get(gameId);
    if (!game) {
      console.log(`Game ${gameId} not found`);
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    // Make sure game is in bidding state
    if (game.status !== 'BIDDING') {
      console.log(`Game ${gameId} is not in bidding state, current state: ${game.status}`);
      socket.emit('error', { message: 'Game is not in bidding state' });
      return;
    }

    // Make sure it's this player's turn
    if (game.currentPlayer !== userId) {
      console.log(`Not this player's turn. Current player: ${game.currentPlayer}, Bidder: ${userId}`);
      socket.emit('error', { message: 'Not your turn to bid' });
      return;
    }

    // Find the player
    const playerIndex = game.players.findIndex(p => p.id === userId);
    if (playerIndex === -1) {
      console.log(`Player ${userId} not found in game`);
      socket.emit('error', { message: 'Player not found in game' });
      return;
    }

    // Update the player's bid
    game.players[playerIndex].bid = bid;
    console.log(`Player ${game.players[playerIndex].name} bid ${bid}`);

    // Determine the next player
    const currentPlayer = game.players.find(p => p.id === userId);
    if (!currentPlayer) {
      console.error('Could not find current player');
      return;
    }
    
    // Just add 1 and mod 4 to get next position
    const nextPosition = (currentPlayer.position + 1) % 4;
    const nextPlayer = game.players.find(p => p.position === nextPosition);
    
    if (!nextPlayer) {
      console.log(`Could not find next player at position ${nextPosition}`);
      socket.emit('error', { message: 'Error finding next player' });
      return;
    }

    game.currentPlayer = nextPlayer.id;
    console.log(`Next player is ${nextPlayer.name} (${nextPlayer.id}) at position ${nextPosition}`);

    // Check if all players have bid
    const allPlayersBid = game.players.every(p => p.bid !== undefined);
    if (allPlayersBid) {
      console.log('All players have bid, transitioning to PLAYING state');
      game.status = 'PLAYING';
      
      // Debug log all players and their positions
      console.log('Current players and positions:');
      game.players.forEach(p => {
        console.log(`${p.name} at position ${p.position}${p.isDealer ? ' (DEALER)' : ''}`);
      });
      
      // After bidding, the player to the left of the dealer bids first
      const dealer = game.players.find(p => p.isDealer);
      if (!dealer) {
        console.error('No dealer found!');
        return;
      }
      
      // Find the next player after the dealer
      const dealerPosition = dealer.position;
      const firstPosition = (dealerPosition + 1) % 4;
      const firstPlayer = game.players.find(p => p.position === firstPosition);
      
      console.log(`Dealer ${dealer.name} at position ${dealerPosition}`);
      console.log(`First player should be at position ${firstPosition}`);
      
      if (!firstPlayer) {
        console.error(`Could not find player at position ${firstPosition}`);
        return;
      }
      
      game.currentPlayer = firstPlayer.id;
      console.log(`First player to lead is ${firstPlayer.name} (${firstPlayer.id}) at position ${firstPosition}`);
    }

    // Update game state in memory
    games.set(gameId, game);
    
    // First, emit to the current room as before
    io.to(gameId).emit('game_update', game);
    
    // Then broadcast to all connected clients about the games list update
    // This ensures all clients get the updated game state even if not in the room
    io.emit('games_update', Array.from(games.values()));
    
    // Emit direct updates to each player in the game to ensure they get it
    game.players.forEach(player => {
      if (player.browserSessionId) {
        const playerSocket = io.sockets.sockets.get(player.browserSessionId);
        if (playerSocket) {
          console.log(`Sending direct game_update to player ${player.name} (${player.id})`);
          playerSocket.emit('game_update', game);
        }
      }
    });
    
    console.log(`Updated game state after bid. Game status: ${game.status}, Current player: ${game.currentPlayer}`);
  });

  // Update the play_card handler
  socket.on('play_card', async ({ gameId, userId, card }) => {
    try {
      const game = games.get(gameId);
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      // Validate game state
      if (game.status !== 'PLAYING') {
        socket.emit('error', { message: 'Game is not in playing state' });
        return;
      }

      // Validate turn
      if (game.currentPlayer !== userId) {
        socket.emit('error', { message: 'Not your turn' });
        return;
      }

      // Find the current player
      const currentPlayer = game.players.find(p => p.id === userId);
      if (!currentPlayer) {
        socket.emit('error', { message: 'Player not found' });
        return;
      }

      // Validate card is in player's hand
      const cardIndex = currentPlayer.hand.findIndex(c => 
        c.suit === card.suit && c.rank === card.rank
      );
      if (cardIndex === -1) {
        socket.emit('error', { message: 'Card not in hand' });
        return;
      }

      // Remove card from player's hand
      currentPlayer.hand.splice(cardIndex, 1);

      // Add card to current trick with player info
      const playedCard = {
        ...card,
        playedBy: {
          id: userId,
          name: currentPlayer.name,
          position: currentPlayer.position
        }
      };
      game.currentTrick.push(playedCard);

      // Update spades broken status
      if (card.suit === 'S') {
        game.spadesBroken = true;
      }

      // Check if trick is complete
      if (game.currentTrick.length === 4) {
        // Determine winning card and player
        let winningCard = game.currentTrick[0];
        let winningPlayer = game.currentTrick[0].playedBy;
        const leadSuit = game.currentTrick[0].suit;

        for (let i = 1; i < game.currentTrick.length; i++) {
          const currentCard = game.currentTrick[i];
          if (currentCard.suit === leadSuit && currentCard.rank > winningCard.rank) {
            winningCard = currentCard;
            winningPlayer = currentCard.playedBy;
          } else if (currentCard.suit === 'S' && winningCard.suit !== 'S') {
            winningCard = currentCard;
            winningPlayer = currentCard.playedBy;
          }
        }

        // Add null check for winningPlayer
        if (!winningPlayer) {
          console.error('Could not determine winning player');
          return;
        }

        // Find and increment the winner's tricks
        const winner = game.players.find(p => p.id === winningPlayer!.id);
        if (winner) {
          winner.tricks = (winner.tricks || 0) + 1;
        }

        // Store the completed trick
        game.completedTricks.push({
          cards: [...game.currentTrick],
          winner: winningPlayer!.id
        });

        // Clear the current trick
        game.currentTrick = [];

        // Set next player to the trick winner
        game.currentPlayer = winningPlayer!.id;

        // Check if hand is complete
        if (game.players.every(p => p.hand.length === 0)) {
          // Calculate scores and start new hand
          const scores = calculateHandScore(game.players);
          game.scores = {
            team1: (game.scores?.team1 || 0) + scores.team1.score,
            team2: (game.scores?.team2 || 0) + scores.team2.score
          };
          
          // Reset for new hand
          game.status = 'BIDDING';
          game.currentPlayer = game.players[game.dealerPosition].id;
          game.spadesBroken = false;
          game.players.forEach(p => {
            p.hand = [];
            p.tricks = 0;
            p.bid = undefined;
          });
          
          // Deal new hands
          game.players = dealCards(game.players);
        }
      } else {
        // Move to next player clockwise
        const currentPlayerIndex = game.players.findIndex(p => p.id === userId);
        const nextPlayerIndex = (currentPlayerIndex + 1) % 4;
        game.currentPlayer = game.players[nextPlayerIndex].id;
      }

      // Broadcast updated game state
      io.to(gameId).emit('game_update', game);
      io.emit('games_update', Array.from(games.values()));

    } catch (error) {
      console.error('Error handling play_card:', error);
      socket.emit('error', { message: 'Internal server error' });
    }
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
    if (currentUserId) {
      const connections = userConnections.get(currentUserId);
      if (connections) {
        connections.delete(socket.id);
        if (connections.size === 0) {
          userConnections.delete(currentUserId);
        }
      }
    }
  });

  // Add handler for get_games event with rate limiting
  const RATE_LIMIT_MS = 1000; // 1 second between requests
  
  socket.on('get_games', () => {
    // Use the user ID for rate limiting if available, otherwise use socket ID
    const rateLimitKey = currentUserId || socket.id;
    
    if (isRateLimited(rateLimitKey, 'get_games', RATE_LIMIT_MS)) {
      console.log(`Rate limiting get_games for socket: ${socket.id}`);
      return;
    }
    
    console.log('Client requested games list, socket:', socket.id);
    socket.emit('games_update', Array.from(games.values()));
  });

  // Add explicit join_room event for chat and spectators
  socket.on('join_room', ({ gameId }) => {
    if (!gameId) {
      socket.emit('error', { message: 'Game ID is required' });
      return;
    }
    
    console.log(`Socket ${socket.id} explicitly joining room ${gameId}`);
    socket.join(gameId);
    
    // Send the current game state to the socket that just joined
    const game = games.get(gameId);
    if (game) {
      socket.emit('game_update', game);
    } else {
      socket.emit('error', { message: 'Game not found' });
    }
  });

  // Add handler for get_game event
  socket.on('get_game', ({ gameId }, callback) => {
    console.log(`Socket ${socket.id} requesting game data for ${gameId}`);
    
    if (!gameId) {
      socket.emit('error', { message: 'Game ID is required' });
      if (callback) callback(null);
      return;
    }
    
    const game = games.get(gameId);
    if (game) {
      console.log(`Game ${gameId} not found`);
    }
  });
});

function calculateHandScore(players: Player[]): { team1: TeamScore, team2: TeamScore } {
  // Initialize team scores
  const team1: TeamScore = { bid: 0, tricks: 0, nilBids: 0, madeNils: 0, score: 0, bags: 0 };
  const team2: TeamScore = { bid: 0, tricks: 0, nilBids: 0, madeNils: 0, score: 0, bags: 0 };

  // Calculate team totals
  players.forEach(player => {
    const team = player.team === 1 ? team1 : team2;
    team.tricks += player.tricks || 0;
    
    if (player.bid === 0) {
      team.nilBids++;
      if (player.tricks === 0) {
        team.madeNils++;
      }
    } else if (player.bid !== undefined) {
      team.bid += player.bid;
    }
  });

  // Calculate scores for each team
  [team1, team2].forEach(team => {
    // Score nil bids
    team.score += team.madeNils * 100;     // +100 for each made nil
    team.score -= (team.nilBids - team.madeNils) * 100;  // -100 for each failed nil

    // Score regular bid
    if (team.bid > 0) {
      if (team.tricks >= team.bid) {
        // Made bid
        team.score += team.bid * 10;  // 10 points per bid book
        team.bags = team.tricks - team.bid;  // Extra books are bags
        team.score += team.bags;  // 1 point per bag
      } else {
        // Set (failed to make bid)
        team.score -= team.bid * 10;  // -10 points per bid book
      }
    }
  });

  return { team1, team2 };
}

httpServer.listen(process.env.PORT || 3001, () => {
  console.log(`Server is running on port ${process.env.PORT || 3001}`);
});