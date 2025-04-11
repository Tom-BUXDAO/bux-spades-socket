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
  
  // Keep track of trick cards and state
  let lastCompleteTrick: Card[] = [];
  let previousTrickCards: Card[] = [];
  
  // When a card is played, store it for potential use later
  const handlePlayCard = (data: any) => {
    // Only process events for our game
    if (data.gameId !== gameId) return;
    
    // Get the current trick after this card was played
    const currentTrick = data.gameState?.currentTrick || [];
    
    if (currentTrick.length > 0) {
      // If this is the 4th card of a trick, save it as a completed trick
      if (currentTrick.length === 4) {
        lastCompleteTrick = [...currentTrick];
        console.log('Saved complete trick:', 
                   lastCompleteTrick.map(c => `${c.rank}${c.suit}`).join(', '));
      }
      
      // Always track the most recent trick
      previousTrickCards = [...currentTrick];
    }
  };
  
  // Handle the trick_winner event from the server
  const handleTrickWinner = (data: TrickWinnerData) => {
    // Only process for our game
    if (data.gameId !== gameId) return;
    
    console.log('TRICK WINNER EVENT RECEIVED:', data);
    
    // Create a trick array to show (either the last complete trick or current partial trick)
    let trickToShow: Card[] = [];
    
    // Try using the last complete trick we saved
    if (lastCompleteTrick.length === 4) {
      trickToShow = [...lastCompleteTrick];
      console.log('Using previously saved complete trick:', 
                 trickToShow.map(c => `${c.rank}${c.suit}`).join(', '));
    }
    // Otherwise fall back to the previous trick cards
    else if (previousTrickCards.length > 0) {
      trickToShow = [...previousTrickCards];
      console.log('Using previous trick cards:', 
                 trickToShow.map(c => `${c.rank}${c.suit}`).join(', '));
    }
    // Last resort: create a mock trick with just the winning card
    else if (data.winningCard) {
      console.log('Creating mock trick with winning card');
      trickToShow = [{
        suit: data.winningCard.suit as Card['suit'],
        rank: Number(data.winningCard.rank) as Card['rank']
      }];
    }
    else {
      console.error('Cannot show trick animation - no trick data available');
      return;
    }
    
    // Find which card in our trick matches the winning card
    let winningIndex = -1;
    
    if (data.winningCard) {
      winningIndex = trickToShow.findIndex(
        card => card.rank === data.winningCard?.rank && card.suit === data.winningCard?.suit
      );
      
      if (winningIndex >= 0) {
        console.log(`Found winning card at index ${winningIndex}:`, 
                   `${data.winningCard.rank}${data.winningCard.suit}`);
      }
      else if (trickToShow.length > 0) {
        // If we couldn't find the winning card but have trick cards, use the first one
        winningIndex = 0;
        console.log('Could not find exact winning card, using first card as winner');
      }
    }
    
    // If we have a valid trick and winning index, show the animation
    if (trickToShow.length > 0 && winningIndex >= 0) {
      console.log(`Trick completed - showing winner card ${winningIndex}`);
      
      // Call the callback with the trick data to update UI
      onTrickComplete({ 
        trickCards: trickToShow,
        winningIndex 
      });
      
      // Clear tracking of this trick after animation time
      setTimeout(() => {
        if (JSON.stringify(lastCompleteTrick) === JSON.stringify(trickToShow)) {
          lastCompleteTrick = [];
        }
      }, 3500);
    }
  };
  
  // Listen for events
  socket.on('play_card', handlePlayCard);
  socket.on('trick_winner', handleTrickWinner);
  
  // Also listen for game_update to keep track of tricks
  socket.on('game_update', (data: GameState) => {
    if (data.id !== gameId) return;
    
    // If we have current trick data with cards, save it
    if (data.currentTrick && data.currentTrick.length > 0) {
      previousTrickCards = [...data.currentTrick];
      if (data.currentTrick.length === 4) {
        lastCompleteTrick = [...data.currentTrick];
      }
    }
  });
  
  // Return cleanup function
  return () => {
    socket.off('play_card', handlePlayCard);
    socket.off('trick_winner', handleTrickWinner);
    socket.off('game_update');
  };
} 