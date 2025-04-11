"use client";

import { useEffect, useRef, useState } from 'react';
import io, { Socket } from 'socket.io-client';
import type { GameState, Card } from '@/types/game';

// Create separate socket instances for regular and test connections
let regularSocket: typeof Socket | null = null;
const testSockets: Map<string, typeof Socket> = new Map();
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

export function useSocket(clientId: string = '') {
  const isTestConnection = clientId.startsWith('test_');
  const socketRef = useRef<typeof Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  
  useEffect(() => {
    // For test connections, create a new socket for each client
    if (isTestConnection) {
      // Get cached socket or create new one for this test client
      let testSocket = testSockets.get(clientId);
      
      if (!testSocket) {
        console.log('Creating new test socket for client:', clientId);
        
        testSocket = io(SOCKET_URL, {
          transports: ['websocket', 'polling'],
          reconnectionAttempts: maxReconnectAttempts,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 20000,
          query: { isTestClient: 'true', clientId },
        });
        
        testSockets.set(clientId, testSocket);
      }
      
      socketRef.current = testSocket;
      
      // Handle test socket reconnection
      const onConnect = () => {
        console.log('Test socket connected for client:', clientId);
        setIsConnected(true);
        reconnectAttempts.current = 0;
      };
      
      const onDisconnect = (reason: string) => {
        console.log('Test socket disconnected for client:', clientId, 'reason:', reason);
        setIsConnected(false);
        
        if (
          reason === 'io server disconnect' || 
          reason === 'transport close' || 
          reconnectAttempts.current >= maxReconnectAttempts
        ) {
          console.log(`Test socket attempting reconnect (${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
          reconnectAttempts.current++;
          setTimeout(() => testSocket?.connect(), 1000);
        }
      };
      
      testSocket.on('connect', onConnect);
      testSocket.on('disconnect', onDisconnect);
      
      // Set initial connection state
      setIsConnected(testSocket.connected);
      
      return () => {
        testSocket.off('connect', onConnect);
        testSocket.off('disconnect', onDisconnect);
        // Don't disconnect test sockets on unmount
      };
    } else {
      // For regular connections, use a singleton socket
      if (!regularSocket) {
        console.log('Creating new regular socket connection');
        
        regularSocket = io(SOCKET_URL, {
          transports: ['websocket', 'polling'],
          reconnectionAttempts: maxReconnectAttempts,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 20000,
          autoConnect: true,
        });
      }
      
      socketRef.current = regularSocket;
      
      // Handle regular socket reconnection
      const onConnect = () => {
        console.log('Regular socket connected with ID:', regularSocket?.id);
        setIsConnected(true);
        reconnectAttempts.current = 0;
      };
      
      const onDisconnect = (reason: string) => {
        console.log('Regular socket disconnected:', reason);
        setIsConnected(false);
        
        if (
          reason === 'io server disconnect' || 
          reason === 'transport close' || 
          reconnectAttempts.current >= maxReconnectAttempts
        ) {
          console.log(`Regular socket attempting reconnect (${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
          reconnectAttempts.current++;
          setTimeout(() => regularSocket?.connect(), 1000);
        }
      };
      
      regularSocket.on('connect', onConnect);
      regularSocket.on('disconnect', onDisconnect);
      
      // Set initial connection state
      setIsConnected(regularSocket.connected);
      
      return () => {
        regularSocket?.off('connect', onConnect);
        regularSocket?.off('disconnect', onDisconnect);
        // Don't disconnect regular socket on unmount
      };
    }
  }, [clientId, isTestConnection]);
  
  return { 
    socket: socketRef.current,
    isConnected
  };
}

// Helper function to explicitly join a game room
export function joinGameRoom(socket: typeof Socket | null, gameId: string) {
  if (!socket || !gameId) return;
  console.log(`Explicitly joining game room: ${gameId}`);
  socket.emit('join_room', { gameId });
}

// API Functions using socket
export function getGames(socket: typeof Socket | null, callback: (games: GameState[]) => void) {
  if (!socket) return () => {};
  
  // Create a wrapped callback with extra logging
  const wrappedCallback = (games: GameState[]) => {
    console.log(`Received games_update with ${games.length} games`);
    callback(games);
  };

  // Listen for games update from server
  socket.on('games_update', wrappedCallback);
  
  // Listen for individual game updates and request full game list to ensure consistency
  socket.on('game_update', (updatedGame: GameState) => {
    console.log(`Received game_update for game: ${updatedGame.id}, status: ${updatedGame.status}, currentPlayer: ${updatedGame.currentPlayer}`);
    // Request full game list to ensure everything is in sync
    socket.emit('get_games');
  });
  
  // Initial request
  socket.emit('get_games');
  
  // Request games again when reconnecting
  socket.on('connect', () => {
    console.log('Socket reconnected, requesting games list');
    socket.emit('get_games');
  });
  
  // Return cleanup function
  return () => {
    socket.off('games_update', wrappedCallback);
    socket.off('game_update');
    socket.off('connect', () => {
      socket.emit('get_games');
    });
  };
}

export function authenticateUser(socket: typeof Socket | null, userId: string) {
  if (!socket) return;
  socket.emit('authenticate', { userId });
}

export function createGame(socket: typeof Socket | null, user: { id: string; name?: string | null }) {
  if (!socket) return;
  socket.emit('create_game', { user });
}

interface JoinOptions {
  name?: string;
  team?: 1 | 2;
  browserSessionId?: string;
  position?: number;
  image?: string;
}

export function joinGame(socket: typeof Socket | null, gameId: string, userId: string, options?: JoinOptions) {
  if (!socket) return;
  console.log(`SOCKET JOIN: Game=${gameId}, Player=${userId}, Position=${options?.position}, Team=${options?.team}`);
  socket.emit('join_game', { 
    gameId, 
    userId, 
    testPlayer: options ? {
      name: options.name || userId,
      team: options.team || 1,
      browserSessionId: options.browserSessionId,
      position: options.position,
      image: options.image
    } : undefined,
    position: options?.position
  });
}

export function leaveGame(socket: typeof Socket | null, gameId: string, userId: string) {
  if (!socket) return;
  socket.emit('leave_game', { gameId, userId });
}

export function startGame(socket: typeof Socket | null, gameId: string, userId?: string) {
  if (!socket) return Promise.reject('No socket connection');
  
  console.log(`Attempting to start game: ${gameId} with user: ${userId || 'unknown'}`);
  
  return new Promise<void>((resolve, reject) => {
    if (!socket) {
      reject('No socket connection');
      return;
    }
    
    // Log the current game state if possible
    socket.emit('get_game', { gameId }, (game: GameState | null) => {
      if (game) {
        console.log(`Current game state before starting:`, {
          id: game.id,
          status: game.status,
          playerCount: game.players.length,
          creatorId: game.players[0]?.id,
          requestingUserId: userId
        });
      } else {
        console.log(`Could not get game state for ${gameId}`);
      }
    });
    
    const handleUpdate = (updatedGame: GameState) => {
      if (updatedGame.id === gameId) {
        console.log(`Game ${gameId} updated, status: ${updatedGame.status}`);
        if (updatedGame.status === 'BIDDING') {
          socket.off('game_update', handleUpdate);
          resolve();
        }
      }
    };
    
    const handleError = (error: any) => {
      console.error("Start game error:", error);
      // Check if the error contains detailed information
      if (typeof error === 'object') {
        console.error("Error details:", JSON.stringify(error));
      }
      socket.off('error', handleError);
      socket.off('game_update', handleUpdate);
      reject(error);
    };
    
    socket.on('game_update', handleUpdate);
    socket.on('error', handleError);
    
    console.log(`Sending start_game command for game ${gameId}${userId ? ` with user ${userId}` : ''}`);
    socket.emit('start_game', { gameId, userId });
    
    // Timeout after 5 seconds
    setTimeout(() => {
      socket.off('game_update', handleUpdate);
      socket.off('error', handleError);
      reject('Timeout waiting for game to start');
    }, 5000);
  });
}

export function makeMove(socket: typeof Socket | null, gameId: string, userId: string, move: any) {
  if (!socket) return;
  socket.emit('make_move', { gameId, userId, move });
}

export function makeBid(socket: typeof Socket | null, gameId: string, userId: string, bid: number) {
  if (!socket) return;
  socket.emit('make_bid', { gameId, userId, bid });
}

export function playCard(socket: typeof Socket | null, gameId: string, userId: string, card: Card) {
  if (!socket) return;
  socket.emit('play_card', { gameId, userId, card });
}

export function sendChatMessage(socket: typeof Socket | null, gameId: string, message: any) {
  if (!socket) {
    console.error('Cannot send chat message: socket is null');
    return;
  }
  
  try {
    console.log(`Sending chat message to game ${gameId}:`, message);
    
    // Ensure the message has all required fields
    const chatMessage = {
      gameId,
      ...message
    };
    
    socket.emit('chat_message', chatMessage);
  } catch (error) {
    console.error('Error sending chat message:', error);
  }
}

// Add a new debug function that logs trick winner information received from server
interface TrickWinnerData {
  winningCard?: {
    rank: number | string;
    suit: string;
  };
  winningPlayerId?: string;
  playerName?: string;
  gameId?: string;
}

export function debugTrickWinner(socket: typeof Socket | null, gameId: string) {
  if (!socket) {
    console.error('Cannot setup debug: socket is null');
    return;
  }
  
  // Listen for trick winner events
  socket.on('trick_winner', (data: TrickWinnerData) => {
    console.log('🎯 DEBUG TRICK WINNER:', data);
    
    if (data.winningCard && data.winningPlayerId) {
      // Log correct player name to verify server data
      const playerName = data.playerName || 'Unknown player';
      console.log(`✅ Server indicates trick won by ${playerName} (ID: ${data.winningPlayerId}) with card ${data.winningCard.rank}${data.winningCard.suit}`);
    }
  });
}

export function setupTrickCompletionDelay(
  socket: typeof Socket | null, 
  gameId: string, 
  onTrickComplete: (data: { trickCards: Card[], winningIndex: number }) => void
) {
  if (!socket) return () => {};
  
  // Keep track of the most recent trick
  let lastTrick: Card[] = [];
  let isDelaying = false;
  let trickProcessed = false;
  
  // Direct socket message interceptor
  const handleGameUpdate = (data: any) => {
    // Only process events for our game
    if (data.id !== gameId) return;
    
    // Check if a trick was just completed - we can detect this if:
    // 1. Current trick is empty AND
    // 2. We have not processed this trick yet AND
    // 3. We have a record of the previous trick with 4 cards
    
    if (data.currentTrick && data.currentTrick.length === 0 && !trickProcessed && lastTrick.length === 4) {
      console.log('COMPLETED TRICK DETECTED FROM GAME UPDATE:', lastTrick);
      
      // Calculate winning card
      const determineWinner = (trick: Card[]): number => {
        if (!trick.length) return -1;
        
        const leadSuit = trick[0].suit;
        
        // Check if any spades were played - spades always trump other suits
        const spadesPlayed = trick.filter(card => card.suit === 'S');
        
        if (spadesPlayed.length > 0) {
          // Find highest spade
          const highestSpade = spadesPlayed.reduce((highest, current) => 
            current.rank > highest.rank ? current : highest, spadesPlayed[0]);
          
          // Return index of highest spade
          return trick.findIndex(card => 
            card.suit === 'S' && card.rank === highestSpade.rank);
        }
        
        // If no spades, find highest card of lead suit
        const leadSuitCards = trick.filter(card => card.suit === leadSuit);
        const highestLeadSuitCard = leadSuitCards.reduce((highest, current) => 
          current.rank > highest.rank ? current : highest, leadSuitCards[0]);
        
        // Return index of highest lead suit card
        return trick.findIndex(card => 
          card.suit === leadSuit && card.rank === highestLeadSuitCard.rank);
      };
      
      // Find winning card
      const winningIndex = determineWinner(lastTrick);
      
      if (winningIndex >= 0) {
        console.log(`Delaying trick completion - winner is card ${winningIndex}`);
        
        // Mark this trick as processed
        trickProcessed = true;
        isDelaying = true;
        
        // Call the callback with the trick data
        onTrickComplete({ 
          trickCards: lastTrick, 
          winningIndex 
        });
        
        // After delay, allow next trick to be processed
        setTimeout(() => {
          isDelaying = false;
          console.log('Trick delay finished, ready for next trick');
        }, 3000); // 3 second delay
      }
    }
  };
  
  // Also handle the trick_winner event directly
  const handleTrickWinner = (data: TrickWinnerData) => {
    // Only process events for our game
    if (data.gameId !== gameId) return;
    
    // If we have a completed trick of 4 cards and it's not being processed yet
    if (lastTrick.length === 4 && !isDelaying && !trickProcessed) {
      console.log('COMPLETED TRICK DETECTED FROM TRICK_WINNER EVENT:', lastTrick);
      
      // Find the winning card in our stored trick
      let winningIndex = -1;
      if (data.winningCard) {
        winningIndex = lastTrick.findIndex(
          card => card.rank === data.winningCard?.rank && card.suit === data.winningCard?.suit
        );
      }
      
      // If we couldn't find by direct match, use our own logic
      if (winningIndex === -1) {
        // Use the same determineWinner function as above
        const determineWinner = (trick: Card[]): number => {
          if (!trick.length) return -1;
          
          const leadSuit = trick[0].suit;
          
          // Check if any spades were played - spades always trump other suits
          const spadesPlayed = trick.filter(card => card.suit === 'S');
          
          if (spadesPlayed.length > 0) {
            // Find highest spade
            const highestSpade = spadesPlayed.reduce((highest, current) => 
              current.rank > highest.rank ? current : highest, spadesPlayed[0]);
            
            // Return index of highest spade
            return trick.findIndex(card => 
              card.suit === 'S' && card.rank === highestSpade.rank);
          }
          
          // If no spades, find highest card of lead suit
          const leadSuitCards = trick.filter(card => card.suit === leadSuit);
          const highestLeadSuitCard = leadSuitCards.reduce((highest, current) => 
            current.rank > highest.rank ? current : highest, leadSuitCards[0]);
          
          // Return index of highest lead suit card
          return trick.findIndex(card => 
            card.suit === leadSuit && card.rank === highestLeadSuitCard.rank);
        };
        
        winningIndex = determineWinner(lastTrick);
      }
      
      if (winningIndex >= 0) {
        console.log(`Delaying trick completion from trick_winner - winner is card ${winningIndex}`);
        
        // Mark this trick as processed
        trickProcessed = true;
        isDelaying = true;
        
        // Call the callback with the trick data
        onTrickComplete({ 
          trickCards: lastTrick, 
          winningIndex 
        });
        
        // After delay, allow next trick to be processed
        setTimeout(() => {
          isDelaying = false;
          console.log('Trick delay finished, ready for next trick');
        }, 3000); // 3 second delay
      }
    }
  };
  
  // Listen for play_card events which happen when any player plays a card
  const handlePlayCard = (data: any) => {
    // Only process events for our game
    if (data.gameId !== gameId) return;
    
    // Get the current trick after this card was played (if available in the data)
    const currentTrick = data.gameState?.currentTrick || [];
    
    // Update our record of the current trick
    if (currentTrick.length > 0) {
      lastTrick = [...currentTrick];
      // Reset the processed flag when cards are being added to a new trick
      if (currentTrick.length < 4) {
        trickProcessed = false;
      }
    }
    
    console.log('Card played, current trick length:', lastTrick.length);
    
    // Check if this completed a trick (4 cards)
    if (lastTrick.length === 4 && !isDelaying && !trickProcessed) {
      console.log('COMPLETE TRICK DETECTED FROM PLAY CARD:', lastTrick);
      // We won't process here, but wait for the game_update event
      // This helps us correctly show the animation after the server acknowledges the play
    }
  };
  
  // Listen for the play_card event
  socket.on('play_card', handlePlayCard);
  
  // Listen for game_update to detect when a trick is complete
  socket.on('game_update', handleGameUpdate);
  
  // Listen for trick_winner event
  socket.on('trick_winner', handleTrickWinner);
  
  // Return cleanup function
  return () => {
    socket.off('play_card', handlePlayCard);
    socket.off('game_update', handleGameUpdate);
    socket.off('trick_winner', handleTrickWinner);
  };
} 