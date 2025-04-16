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
  bid?: number;
  tricksTaken: number;
  position: number;
  team?: number;
  browserSessionId?: string;
  image?: string;
  isDealer?: boolean;
  tricks: number;
}

interface Game {
  id: string;
  status: 'WAITING' | 'BIDDING' | 'PLAYING' | 'COMPLETE';
  players: Player[];
  currentPlayer: number;
  currentTrick: PlayedCard[];
  completedTricks: CompletedTrick[];
  scores: {
    team1: number;
    team2: number;
  };
  team1Bags: number;
  team2Bags: number;
  rules: {
    minPoints: number;
    maxPoints: number;
  };
  winningTeam?: 'team1' | 'team2' | null;
  leadCard: Card | null;
  dealerPosition: number;
  spadesBroken: boolean;
  createdAt: number;
  cardPlayers: string[];
}

interface PlayedCard {
  card: Card;
  playerId: string;
  playerName: string;
}

interface CompletedTrick {
  cards: PlayedCard[];
  winningPlayerId: string;
  winningPlayerName: string;
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
    tricksTaken: 0,
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

  socket.on('create_game', ({ user, rules, gameRules }) => {
    try {
        if (!user || !user.id) {
            socket.emit('error', { message: 'Invalid user data provided' });
            return;
        }

        // Check if user is already in ANY game
        let existingGame: Game | undefined;
        games.forEach((game) => {
            if (game.players.some(player => player.id === user.id)) {
                existingGame = game;
            }
        });

        // If found an existing game, just rejoin it
        if (existingGame) {
            console.log(`User ${user.name} (${user.id}) rejoining existing game: ${existingGame.id}`);
            socket.join(existingGame.id);
            socket.emit('game_created', { gameId: existingGame.id, game: existingGame });
            return;
        }

        const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();

        // Create a new player object with complete information
        const creator: Player = {
            id: user.id,  // Use user.id instead of socket.id
            name: user.name,
            hand: [],
            bid: undefined,
            tricks: 0,
            tricksTaken: 0,
            position: 0,
            team: undefined,
            browserSessionId: socket.id,
            image: user.image,
            isDealer: false
        };
        
        // Create new game with the player
        const game: Game = {
            id: gameId,
            status: "WAITING",
            players: [creator],
            currentPlayer: creator.position,
            currentTrick: [],
            completedTricks: [],
            scores: {
                team1: 0,
                team2: 0
            },
            team1Bags: 0,
            team2Bags: 0,
            spadesBroken: false,
            rules: (rules || gameRules) ? { ...rules, ...gameRules } : {
                minPoints: -250,
                maxPoints: 500
            },
            winningTeam: null,
            leadCard: null,
            dealerPosition: 0,
            createdAt: Date.now(),
            cardPlayers: []
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
        
        const game = games.get(gameId);
        if (!game) {
            socket.emit('error', { message: 'Game not found' });
            return;
        }
        
        if (game.status !== 'WAITING') {
            socket.emit('error', { message: 'Game has already started' });
            return;
        }

        // Check if player is already in ANY game
        let playerInOtherGame = false;
        games.forEach((otherGame) => {
            if (otherGame.id !== gameId && otherGame.players.some(p => p.id === userId)) {
                playerInOtherGame = true;
            }
        });

        if (playerInOtherGame) {
            socket.emit('error', { message: 'You are already in another game' });
            return;
        }

        // Check if player is already in THIS game
        const existingPlayer = game.players.find(p => p.id === userId);
        if (existingPlayer) {
            // Update the player's socket ID
            existingPlayer.browserSessionId = socket.id;
            games.set(gameId, game);
            socket.emit('game_update', game);
            return;
        }
        
        if (game.players.length >= 4) {
            socket.emit('error', { message: 'Game is full' });
            return;
        }

        // If position is not specified, find first available position that maintains team balance
        let assignedPosition = position;
        if (assignedPosition === undefined) {
            const takenPositions = game.players.map(p => p.position);
            // Try positions in order (0,1,2,3) but ensure team balance
            for (let i = 0; i < 4; i++) {
                if (!takenPositions.includes(i)) {
                    const wouldBeTeam = i % 2 === 0 ? 1 : 2;
                    const teamCount = game.players.filter(p => p.team === wouldBeTeam).length;
                    if (teamCount < 2) {
                        assignedPosition = i;
                        break;
                    }
                }
            }
            // If we couldn't find a balanced position, take first available
            if (assignedPosition === undefined) {
                for (let i = 0; i < 4; i++) {
                    if (!takenPositions.includes(i)) {
                        assignedPosition = i;
                        break;
                    }
                }
            }
        }

        // Validate the position
        if (assignedPosition === undefined || assignedPosition < 0 || assignedPosition > 3) {
            socket.emit('error', { message: 'Invalid position' });
            return;
        }

        // Check if position is already taken
        if (game.players.some(p => p.position === assignedPosition)) {
            socket.emit('error', { message: 'Position already taken' });
            return;
        }

        // Team is strictly based on position:
        // North/South (positions 0,2) are Team 1
        // East/West (positions 1,3) are Team 2
        const team = assignedPosition % 2 === 0 ? 1 : 2;

        // Create player object
        const player: Player = {
            id: userId,
            name: testPlayer ? testPlayer.name : userId,
            hand: [],
            tricks: 0,
            team: team,
            browserSessionId: socket.id,
            image: testPlayer?.image,
            position: assignedPosition,
            tricksTaken: 0,
            isDealer: false
        };

        // Add player to game
        game.players.push(player);
        games.set(gameId, game);

        // Notify all clients about the game update
        io.to(gameId).emit('game_update', game);
        io.emit('games_update', Array.from(games.values()));

        console.log(`Player ${player.name} joined game ${gameId} at position ${assignedPosition} on team ${team}`);
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
    
    game.currentPlayer = firstPlayer.position;
    console.log(`First player to lead is ${firstPlayer.name} (${firstPlayer.position}) at position ${firstPosition}`);
    
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

    game.currentPlayer = nextPlayer.position;
    console.log(`Next player is ${nextPlayer.name} (${nextPlayer.position}) at position ${nextPosition}`);

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
      
      game.currentPlayer = firstPlayer.position;
      console.log(`First player to lead is ${firstPlayer.name} (${firstPlayer.position}) at position ${firstPosition}`);
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
  socket.on('play_card', ({ gameId, cardIndex }) => {
    const game = games.get(gameId);
    if (!game) return;

    // Get the current player's position
    const currentPlayerPosition = game.currentPlayer;
    const currentPlayer = game.players.find(p => p.position === currentPlayerPosition);
    if (!currentPlayer) return;

    // Verify it's actually this player's turn
    if (currentPlayer.id !== socket.id) {
        socket.emit('error', { message: 'Not your turn' });
        return;
    }

    // Get the card from the player's hand
    const card = currentPlayer.hand[cardIndex];
    if (!card) {
        socket.emit('error', { message: 'Invalid card' });
        return;
    }

    // Add card to current trick
    const playedCard: PlayedCard = {
        card,
        playerId: socket.id,
        playerName: currentPlayer.name
    };
    game.currentTrick.push(playedCard);

    // Remove card from player's hand
    currentPlayer.hand.splice(cardIndex, 1);

    // If this is the first card in the trick, set it as the lead card
    if (game.currentTrick.length === 1) {
        game.leadCard = card;
    }

    // Emit updated game state
    io.to(gameId).emit('game_update', {
        currentPlayer: game.currentPlayer,
        currentTrick: game.currentTrick,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            position: p.position,
            hand: p.hand,
            bid: p.bid,
            tricksTaken: p.tricksTaken
        }))
    });

    // If all players have played, determine the winner
    if (game.currentTrick.length === 4) {
        const winningCard = determineWinningCard(game.currentTrick, game.leadCard);
        const winningPlayer = game.players.find(p => p.id === winningCard.playerId);
        if (!winningPlayer) return;

        // Update tricks taken
        winningPlayer.tricksTaken++;
        winningPlayer.tricks++;

        // Add completed trick
        game.completedTricks.push({
            cards: game.currentTrick,
            winningPlayerId: winningPlayer.id,
            winningPlayerName: winningPlayer.name
        });

        // Clear current trick
        game.currentTrick = [];
        game.leadCard = null;

        // Check if hand is complete
        if (game.completedTricks.length === 13) {
            // Calculate hand scores
            const handScores = calculateHandScore(game.players);
            
            // Update team scores
            game.scores.team1 += handScores.team1.score;
            game.scores.team2 += handScores.team2.score;

            // Check if game is over using game's min/max points
            if (game.scores.team1 <= game.rules.minPoints || game.scores.team1 >= game.rules.maxPoints ||
                game.scores.team2 <= game.rules.minPoints || game.scores.team2 >= game.rules.maxPoints) {
                
                // Determine winner
                let winningTeam: 1 | 2;
                if (game.scores.team1 >= game.rules.maxPoints || game.scores.team2 <= game.rules.minPoints) {
                    winningTeam = 1;
                } else {
                    winningTeam = 2;
                }

                // Set game as complete
                game.status = 'COMPLETE';
                game.winningTeam = winningTeam === 1 ? 'team1' : 'team2';
                
                // Send final events
                io.to(gameId).emit('hand_summary', {
                    handScores,
                    totalScores: {
                        team1: game.scores.team1,
                        team2: game.scores.team2
                    },
                    totalBags: {
                        team1: game.team1Bags,
                        team2: game.team2Bags
                    },
                    isGameOver: true,
                    winningTeam
                });

                // Send game over event
                io.to(gameId).emit('game_over', {
                    winningTeam,
                    finalScores: {
                        team1: game.scores.team1,
                        team2: game.scores.team2
                    }
                });

                // Save and exit
                games.set(gameId, game);
                return;
            }

            // Send hand summary
            io.to(gameId).emit('hand_summary', {
                handScores,
                totalScores: {
                    team1: game.scores.team1,
                    team2: game.scores.team2
                },
                totalBags: {
                    team1: game.team1Bags,
                    team2: game.team2Bags
                },
                isGameOver: false
            });

            // Wait before starting new hand
            setTimeout(() => {
                const currentGame = games.get(gameId);
                if (!currentGame || currentGame.status !== 'PLAYING') return;

                // Reset for new hand
                currentGame.players.forEach(p => { 
                    p.tricksTaken = 0; 
                    p.tricks = 0;
                    p.bid = undefined; 
                    p.isDealer = false;
                });
                currentGame.completedTricks = [];
                currentGame.leadCard = null;
                currentGame.dealerPosition = (currentGame.dealerPosition + 1) % currentGame.players.length;
                currentGame.players = dealCards(currentGame.players);
                currentGame.currentPlayer = currentGame.players[(currentGame.dealerPosition + 1) % currentGame.players.length].position;
                currentGame.status = 'BIDDING';
                currentGame.spadesBroken = false;
                currentGame.cardPlayers = [];

                // Set new dealer
                const newDealer = currentGame.players.find(p => p.position === currentGame.dealerPosition);
                if (newDealer) {
                    newDealer.isDealer = true;
                }

                // Update game state
                games.set(gameId, currentGame);
                io.to(gameId).emit('game_update', currentGame);
                io.emit('games_update', Array.from(games.values()));
            }, 5000);
        } else {
            // Set next player as current player
            game.currentPlayer = winningPlayer.position;
            
            // Emit updated game state
            io.to(gameId).emit('game_update', {
                currentPlayer: game.currentPlayer,
                currentTrick: game.currentTrick,
                completedTricks: game.completedTricks,
                players: game.players.map(p => ({
                    id: p.id,
                    name: p.name,
                    position: p.position,
                    hand: p.hand,
                    bid: p.bid,
                    tricksTaken: p.tricksTaken,
                    tricks: p.tricks,
                    isDealer: p.isDealer
                }))
            });
        }
    } else {
        // Move to next player
        const currentPlayerIndex = game.players.findIndex(p => p.position === currentPlayerPosition);
        const nextPlayerIndex = (currentPlayerIndex + 1) % 4;
        game.currentPlayer = game.players[nextPlayerIndex].position;

        // Emit updated game state
        io.to(gameId).emit('game_update', {
            currentPlayer: game.currentPlayer,
            currentTrick: game.currentTrick,
            players: game.players.map(p => ({
                id: p.id,
                name: p.name,
                position: p.position,
                hand: p.hand,
                bid: p.bid,
                tricksTaken: p.tricksTaken,
                tricks: p.tricks,
                isDealer: p.isDealer
            }))
        });
    }

    // Save game state
    games.set(gameId, game);
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
  const team1Score: TeamScore = { bid: 0, tricks: 0, nilBids: 0, madeNils: 0, score: 0, bags: 0 };
  const team2Score: TeamScore = { bid: 0, tricks: 0, nilBids: 0, madeNils: 0, score: 0, bags: 0 };

  // --- Pass 1: Accumulate totals and handle Nil bids ---
  players.forEach(player => {
    const teamScore = player.team === 1 ? team1Score : team2Score;
    teamScore.tricks += player.tricks; // Accumulate ALL tricks for the team

    if (player.bid !== undefined) {
      if (player.bid === 0) { // Nil Bid
        teamScore.nilBids++;
        if (player.tricks === 0) {
          teamScore.madeNils++;
          teamScore.score += 100; // Made Nil
        } else {
          teamScore.score -= 100; // Failed Nil Penalty
          // Per user rule: Failed Nil tricks count as bags for the team
          teamScore.bags += player.tricks;
        }
      } else { // Regular (Contract) Bid
        teamScore.bid += player.bid; // Accumulate the contract bid
      }
    }
  });

  // --- Pass 2: Score the contracts using total team tricks ---

  // Team 1 Contract Score
  if (team1Score.bid > 0) { // Only score if there was a contract bid
    if (team1Score.tricks >= team1Score.bid) { // Compare TOTAL team tricks to contract bid
      // Made contract
      team1Score.score += team1Score.bid * 10;
      const overbooks = team1Score.tricks - team1Score.bid;
      if (overbooks > 0) {
        // Add bags from contract overbooks (in addition to any failed nil bags)
        team1Score.bags += overbooks;
        team1Score.score += overbooks; // Add points for overbooks
      }
    } else {
      // Failed contract (Set)
      team1Score.score -= team1Score.bid * 10;
      // No additional bags when set (only bags from failed nil, if any)
    }
  }

  // Team 2 Contract Score
  if (team2Score.bid > 0) { // Only score if there was a contract bid
     if (team2Score.tricks >= team2Score.bid) { // Compare TOTAL team tricks to contract bid
      // Made contract
      team2Score.score += team2Score.bid * 10;
      const overbooks = team2Score.tricks - team2Score.bid;
      if (overbooks > 0) {
         // Add bags from contract overbooks (in addition to any failed nil bags)
        team2Score.bags += overbooks;
        team2Score.score += overbooks; // Add points for overbooks
      }
    } else {
      // Failed contract (Set)
      team2Score.score -= team2Score.bid * 10;
       // No additional bags when set (only bags from failed nil, if any)
    }
  }

  // Final bags = (bags from failed nils) + (bags from contract overbooks)
  return { team1: team1Score, team2: team2Score };
}

function determineWinningCard(trick: PlayedCard[], leadCard: Card | null): PlayedCard {
    if (!trick.length) throw new Error('Empty trick');
    
    let winningCard = trick[0];

    for (let i = 1; i < trick.length; i++) {
        const currentCard = trick[i];
        
        // If current card is a spade and winning card is not, spade wins
        if (currentCard.card.suit === 'S' && winningCard.card.suit !== 'S') {
            winningCard = currentCard;
        }
        // If both cards are spades, higher rank wins
        else if (currentCard.card.suit === 'S' && winningCard.card.suit === 'S' && currentCard.card.rank > winningCard.card.rank) {
            winningCard = currentCard;
        }
        // If current card matches lead suit and winning card is not a spade, higher card wins
        else if (currentCard.card.suit === leadCard?.suit && winningCard.card.suit !== 'S' && currentCard.card.rank > winningCard.card.rank) {
            winningCard = currentCard;
        }
    }

    return winningCard;
}

httpServer.listen(process.env.PORT || 3001, () => {
  console.log(`Server is running on port ${process.env.PORT || 3001}`);
});