import { Server } from 'socket.io';
import { createServer } from 'http';
import { GameState, Card, Suit } from '../types/game';

const server = createServer();

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: false
  },
  // Disable all the problematic settings
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 30000,
  transports: ['websocket', 'polling'], // Allow fallback to polling
  allowUpgrades: true,
  cookie: false,
  path: '/socket.io/'
});

// Valid test players
const VALID_PLAYERS = ['Tom', 'Dani', 'Alice', 'Bob'];

// Store test games in memory
const testGames = new Map<string, GameState>();

// Store active connections with heartbeat
const activeConnections = new Map<string, Date>();

// Add heartbeat mechanism
setInterval(() => {
  io.sockets.emit('ping');
}, 10000);

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

// Helper function to shuffle array
function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
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

// Add this function at the top with other helper functions
function resetGame(game: GameState): GameState {
  return {
    ...game,
    status: "WAITING",
    players: game.players.map(p => ({
      ...p,
      hand: [],
      tricks: 0,
      bid: undefined
    })),
    currentTrick: [],
    team1Score: 0,
    team2Score: 0,
    team1Bags: 0,
    team2Bags: 0
  };
}

// Add these helper functions after the existing ones
function getLeadSuit(trick: Card[]): Suit | null {
  return trick[0]?.suit || null;
}

function hasSpadeBeenPlayed(game: GameState): boolean {
  return game.completedTricks?.some(trick => 
    trick.some(card => card.suit === 'S')
  ) || false;
}

function canLeadSpades(game: GameState, hand: Card[]): boolean {
  return hasSpadeBeenPlayed(game) || hand.every(card => card.suit === 'S');
}

function getPlayableCards(game: GameState, hand: Card[], isLeadingTrick: boolean): Card[] {
  if (!hand.length) return [];

  if (isLeadingTrick) {
    if (!canLeadSpades(game, hand)) {
      const nonSpades = hand.filter(card => card.suit !== 'S');
      return nonSpades.length > 0 ? nonSpades : hand;
    }
    return hand;
  }

  const leadSuit = getLeadSuit(game.currentTrick);
  if (!leadSuit) return [];

  const suitCards = hand.filter(card => card.suit === leadSuit);
  return suitCards.length > 0 ? suitCards : hand;
}

function determineWinningCard(trick: Card[]): number {
  if (!trick.length) return -1;

  const leadSuit = trick[0].suit;
  let highestSpade: Card | null = null;
  let highestLeadSuit: Card | null = null;

  trick.forEach((card, index) => {
    if (card.suit === 'S') {
      if (!highestSpade || card.rank > highestSpade.rank) {
        highestSpade = card;
      }
    } else if (card.suit === leadSuit) {
      if (!highestLeadSuit || card.rank > highestLeadSuit.rank) {
        highestLeadSuit = card;
      }
    }
  });

  if (highestSpade) {
    return trick.findIndex(card => 
      card.suit === highestSpade!.suit && card.rank === highestSpade!.rank
    );
  }

  return trick.findIndex(card => 
    card.suit === highestLeadSuit!.suit && card.rank === highestLeadSuit!.rank
  );
}

io.on('connection', (socket) => {
  const clientId = socket.handshake.query.clientId as string;
  const playerName = clientId?.replace('test_', '');

  if (!clientId?.startsWith('test_') || !VALID_PLAYERS.map(p => p.toLowerCase()).includes(playerName.toLowerCase())) {
    console.log('Invalid test player:', playerName);
    socket.disconnect();
    return;
  }

  console.log('Test client connected:', clientId);
  activeConnections.set(clientId, new Date());

  // Handle reconnection
  socket.on('reconnect', () => {
    console.log('Client reconnected:', clientId);
    activeConnections.set(clientId, new Date());
    // Send current game state immediately on reconnect
    const games = Array.from(testGames.values());
    socket.emit('games_update', games);
  });

  // Handle pong response
  socket.on('pong', () => {
    activeConnections.set(clientId, new Date());
  });

  // Send initial games list
  const games = Array.from(testGames.values());
  console.log('Sending initial games list:', games);
  socket.emit('games_update', games);

  socket.on('get_games', () => {
    console.log('Received get_games request from:', clientId);
    const games = Array.from(testGames.values());
    console.log('Sending games list:', games);
    socket.emit('games_update', games);
  });

  socket.on('create_game', ({ userId }) => {
    console.log('Creating game for user:', userId);
    const gameId = "TEST_GAME";
    const game: GameState = {
      id: gameId,
      status: "WAITING",
      players: [{
        id: userId,
        name: userId.replace('test_', ''),
        hand: [],
        tricks: 0,
        team: 1,
        bid: undefined,
      }],
      currentPlayer: userId,
      currentTrick: [],
      completedTricks: [],
      team1Score: 0,
      team2Score: 0,
      team1Bags: 0,
      team2Bags: 0,
    };

    testGames.set(gameId, game);
    socket.join(gameId);
    console.log('Game created, sending update:', game);
    io.emit('games_update', Array.from(testGames.values()));
  });

  socket.on('join_game', ({ gameId, userId, testPlayer }) => {
    console.log('Join game request:', { gameId, userId, testPlayer });
    const game = testGames.get(gameId);
    if (!game) {
      console.log('Game not found:', gameId);
      return;
    }

    console.log('Current players:', game.players);
    // Only add player if not already in game and game isn't full
    if (!game.players.some(p => p.id === userId) && game.players.length < 4) {
      console.log('Adding player to game:', testPlayer?.name || userId);
      
      // Get the player name
      const playerName = testPlayer?.name || userId.replace('test_', '');
      
      // Define the clockwise order
      const clockwiseOrder = ['Tom', 'Dani', 'Alice', 'Bob'];
      
      // Create the new player object
      const newPlayer = {
        id: userId,
        name: playerName,
        hand: [],
        tricks: 0,
        team: testPlayer?.team || ((clockwiseOrder.indexOf(playerName) % 2) + 1) as 1 | 2,
        bid: undefined,
      };

      // Find all players' positions in the clockwise order
      const positions = game.players.map(p => clockwiseOrder.indexOf(p.name));
      const newPosition = clockwiseOrder.indexOf(playerName);
      
      // Insert the new player in the correct position to maintain clockwise order
      const insertIndex = positions.findIndex(pos => pos > newPosition);
      if (insertIndex === -1) {
        game.players.push(newPlayer);
      } else {
        game.players.splice(insertIndex, 0, newPlayer);
      }

      socket.join(gameId);
      console.log('Updated players:', game.players);
      io.emit('games_update', Array.from(testGames.values()));
    } else {
      console.log('Player already in game or game is full:', {
        alreadyInGame: game.players.some(p => p.id === userId),
        playerCount: game.players.length
      });
    }
  });

  socket.on('start_game', (gameId) => {
    console.log('\n=== START GAME EVENT ===');
    console.log('1. Received start_game event for game:', gameId);
    
    const game = testGames.get(gameId);
    if (!game || game.players.length !== 4) {
      socket.emit('error', { message: 'Invalid game state' });
      return;
    }

    // Deal cards and update game state
    const playersWithCards = dealCards(game.players);
    
    // Randomly choose first dealer
    const firstDealerIndex = Math.floor(Math.random() * 4);
    
    const gameWithCards: GameState = {
      ...game,
      status: "BIDDING" as const,
      players: playersWithCards.map((p, i) => ({
        ...p,
        isDealer: i === firstDealerIndex
      })),
      // First player is to the left of the dealer
      currentPlayer: playersWithCards[(firstDealerIndex + 1) % 4].id
    };
    
    // Update game state in memory
    testGames.set(gameId, gameWithCards);
    console.log('2. Updated game state:', JSON.stringify(gameWithCards, null, 2));
    
    // First broadcast the game update to all sockets
    io.emit('game_update', gameWithCards);
    io.emit('games_update', Array.from(testGames.values()));
    console.log('3. Broadcasted updates');
  });

  socket.on('chat_message', ({ gameId, message }) => {
    console.log('Received chat message:', message);
    io.emit('chat_message', message);
  });

  socket.on('make_bid', ({ gameId, userId, bid }) => {
    console.log('\n=== MAKE BID EVENT ===');
    console.log('1. Received bid:', { gameId, userId, bid });
    
    const game = testGames.get(gameId);
    if (!game || game.status !== "BIDDING") {
      console.log('2. Invalid game state for bidding');
      return;
    }

    // Find the player and their index
    const playerIndex = game.players.findIndex(p => p.id === userId);
    if (playerIndex === -1 || game.currentPlayer !== userId) {
      console.log('3. Not player\'s turn to bid');
      return;
    }

    // Record the bid
    console.log('4. Recording bid for player:', game.players[playerIndex].name);
    game.players[playerIndex].bid = bid;

    // Move to next player (clockwise)
    const nextPlayerIndex = (playerIndex + 1) % 4;
    game.currentPlayer = game.players[nextPlayerIndex].id;
    console.log('5. Next player to bid:', game.players[nextPlayerIndex].name);

    // Check if all players have bid
    if (game.players.every(p => p.bid !== undefined)) {
      console.log('6. All players have bid, transitioning to PLAYING state');
      game.status = "PLAYING";
      
      // Find dealer and set first player to their left
      const dealerIndex = game.players.findIndex(p => p.isDealer);
      game.currentPlayer = game.players[(dealerIndex + 1) % 4].id;
      console.log('7. First player to act:', game.players[(dealerIndex + 1) % 4].name);
    }

    // Update game state
    testGames.set(gameId, game);
    console.log('8. Updated game state:', JSON.stringify(game, null, 2));

    // Broadcast updates
    io.to(gameId).emit('game_update', game);
    io.emit('games_update', Array.from(testGames.values()));
    console.log('=== END MAKE BID EVENT ===\n');
  });

  socket.on('play_card', ({ gameId, userId, card }) => {
    console.log('\n=== PLAY CARD EVENT ===');
    console.log('1. Received play card:', { gameId, userId, card });
    
    const game = testGames.get(gameId);
    if (!game || game.status !== "PLAYING") {
      console.log('2. Invalid game state for playing');
      return;
    }

    // Find the player
    const playerIndex = game.players.findIndex(p => p.id === userId);
    if (playerIndex === -1 || game.currentPlayer !== userId) {
      console.log('3. Not player\'s turn to play');
      return;
    }

    const player = game.players[playerIndex];
    const isLeadingTrick = game.currentTrick.length === 0;

    // Validate the play
    const playableCards = getPlayableCards(game, player.hand, isLeadingTrick);
    if (!playableCards.some(c => c.suit === card.suit && c.rank === card.rank)) {
      console.log('4. Invalid card play');
      return;
    }

    // Remove card from player's hand
    player.hand = player.hand.filter(c => !(c.suit === card.suit && c.rank === card.rank));
    
    // Add card to current trick
    game.currentTrick.push(card);
    console.log('5. Added card to trick:', game.currentTrick);

    // If trick is complete
    if (game.currentTrick.length === 4) {
      const winningIndex = determineWinningCard(game.currentTrick);
      const winningPlayer = game.players[(playerIndex - (game.currentTrick.length - 1) + winningIndex + 4) % 4];
      
      console.log('6. Trick complete, winner:', winningPlayer.name);
      
      // Award trick to winning player
      winningPlayer.tricks += 1;
      
      // Add trick to completed tricks
      if (!game.completedTricks) {
        game.completedTricks = [];
      }
      game.completedTricks.push(game.currentTrick);
      
      // Clear current trick
      game.currentTrick = [];
      
      // Next player is the winner of the trick
      game.currentPlayer = winningPlayer.id;

      // Check if hand is complete
      if (game.players.every(p => p.hand.length === 0)) {
        console.log('7. Hand complete, calculating scores');
        game.status = "FINISHED";
        // TODO: Calculate scores
      }
    } else {
      // Move to next player
      const nextPlayerIndex = (playerIndex + 1) % 4;
      game.currentPlayer = game.players[nextPlayerIndex].id;
    }

    // Update game state
    testGames.set(gameId, game);
    console.log('8. Updated game state');

    // Broadcast updates
    io.to(gameId).emit('game_update', game);
    io.emit('games_update', Array.from(testGames.values()));
    console.log('=== END PLAY CARD EVENT ===\n');
  });

  socket.on('update_scores', ({ gameId, team1Score, team2Score, startNewHand }) => {
    console.log('\n=== UPDATE SCORES EVENT ===');
    console.log('1. Received update scores:', { gameId, team1Score, team2Score, startNewHand });
    
    const game = testGames.get(gameId);
    if (!game) {
      console.log('2. Game not found');
      return;
    }

    // Set scores directly rather than adding to potentially incorrect values
    game.team1Score = team1Score;
    game.team2Score = team2Score;
    console.log('3. Updated scores:', { team1: game.team1Score, team2: game.team2Score });

    if (startNewHand) {
      // Find current dealer and move to next dealer
      const dealerIndex = game.players.findIndex(p => p.isDealer);
      console.log(`Current dealer: ${game.players[dealerIndex].name} at index ${dealerIndex}`);
      const nextDealerIndex = (dealerIndex + 1) % 4;
      console.log(`Next dealer: ${game.players[nextDealerIndex].name} at index ${nextDealerIndex}`);
      
      // Reset game state for new hand
      game.status = "BIDDING";
      game.currentTrick = [];
      game.completedTricks = [];
      
      // Reset player state and update dealer
      game.players = game.players.map((player, i) => {
        const isNewDealer = i === nextDealerIndex;
        console.log(`Player ${player.name} isDealer: ${isNewDealer}`);
        return {
          ...player,
          hand: [],
          tricks: 0,
          bid: undefined,
          isDealer: isNewDealer
        };
      });
      
      // First player is to the left of the dealer
      game.currentPlayer = game.players[(nextDealerIndex + 1) % 4].id;
      console.log(`First player to act: ${game.players[(nextDealerIndex + 1) % 4].name}`);
      
      // Deal new cards while preserving dealer status
      const playersWithCards = dealCards(game.players);
      game.players = game.players.map((player, i) => ({
        ...playersWithCards[i],
        isDealer: player.isDealer
      }));
      
      console.log('4. Started new hand, dealt cards, moved dealer button');
    }

    // Update game state
    testGames.set(gameId, game);
    console.log('5. Updated game state');

    // Broadcast updates
    io.to(gameId).emit('game_update', game);
    io.emit('games_update', Array.from(testGames.values()));
    console.log('=== END UPDATE SCORES EVENT ===\n');
  });

  socket.on('disconnect', () => {
    console.log('Test client disconnected:', clientId);
    activeConnections.delete(clientId);
  });
});

// Clean up inactive connections periodically
setInterval(() => {
  const now = new Date();
  for (const [clientId, lastActive] of activeConnections.entries()) {
    if (now.getTime() - lastActive.getTime() > 60000) { // 1 minute timeout
      console.log('Removing inactive connection:', clientId);
      activeConnections.delete(clientId);
    }
  }
}, 30000); // Check every 30 seconds

const PORT = 3002;
server.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
}); 