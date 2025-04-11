import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './index';

export interface GameState {
  id: string;
  status: 'WAITING' | 'BIDDING' | 'PLAYING' | 'COMPLETE';
  players: Player[];
  currentPlayer?: string;
  scores?: { team1: number, team2: number };
  currentTrick?: any[];
  round?: number;
  tricks?: any[];
  // Add other game state properties as needed
}

export interface Player {
  id: string;
  name: string;
  team: number;
  hand?: any[];
  bid?: number;
  tricks?: number;
  isConnected?: boolean;
  // Add other player properties as needed
}

/**
 * Hook to manage game state with Socket.IO
 * @param gameId - ID of the game to connect to
 * @param userId - Current user's ID
 * @returns game state and methods to interact with the game
 */
export function useGameState(
  gameId: string,
  userId: string
) {
  const { socket } = useSocket(gameId); // Use our custom socket hook
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  
  // Join game
  const joinGame = useCallback(() => {
    if (!socket) return;
    
    setIsLoading(true);
    socket.emit('join_game', { gameId, userId });
  }, [socket, gameId, userId]);
  
  // Leave game
  const leaveGame = useCallback(() => {
    if (!socket) return;
    
    socket.emit('leave_game', { gameId, userId });
  }, [socket, gameId, userId]);
  
  // Make a bid
  const makeBid = useCallback((bid: number) => {
    if (!socket) return;
    
    socket.emit('make_bid', { gameId, userId, bid });
  }, [socket, gameId, userId]);
  
  // Play a card
  const playCard = useCallback((cardIndex: number) => {
    if (!socket) return;
    
    socket.emit('play_card', { gameId, userId, cardIndex });
  }, [socket, gameId, userId]);
  
  // Listen for game updates
  useEffect(() => {
    if (!socket) return;
    
    const onGameUpdate = (data: GameState) => {
      setGameState(data);
      setIsLoading(false);
    };
    
    const onGameError = (err: { message: string }) => {
      setError(err.message);
      setIsLoading(false);
    };
    
    // Join the game when socket is ready
    if (socket.connected) {
      joinGame();
    }
    
    // Setup event listeners
    socket.on('connect', joinGame);
    socket.on('game_update', onGameUpdate);
    socket.on('error', onGameError);
    
    // Cleanup
    return () => {
      socket.off('connect', joinGame);
      socket.off('game_update', onGameUpdate);
      socket.off('error', onGameError);
    };
  }, [socket, gameId, userId, joinGame]);
  
  return {
    gameState,
    error,
    isLoading,
    joinGame,
    leaveGame,
    makeBid,
    playCard
  };
}

export default useGameState; 