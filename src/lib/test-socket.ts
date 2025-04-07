import { useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import type { GameState, Card } from '@/types/game';

// Create a factory function for socket creation
function createSocket(clientId: string) {
  const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'https://bux-spades-socket-production.up.railway.app';
  
  return io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    query: { clientId },
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 60000,
    path: '/socket.io/',
    forceNew: true
  });
}

export function useTestSocket(clientId: string) {
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const isConnectedRef = useRef(false);
  const gamesUpdateCallbacksRef = useRef<Set<(games: GameState[]) => void>>(new Set());
  const gameUpdateCallbacksRef = useRef<Set<(game: GameState) => void>>(new Set());

  const setupSocket = useCallback(() => {
    if (socketRef.current?.connected) {
      return socketRef.current;
    }

    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
    }

    const socket = createSocket(clientId);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Test socket connected:', clientId);
      isConnectedRef.current = true;
      socket.emit('get_games');
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected:', clientId);
      isConnectedRef.current = false;
    });

    socket.on('connect_error', (error: Error) => {
      console.log('Socket connect error:', error);
    });

    socket.on('game_update', (updatedGame: GameState) => {
      gameUpdateCallbacksRef.current.forEach(cb => cb(updatedGame));
    });

    socket.on('games_update', (games: GameState[]) => {
      gamesUpdateCallbacksRef.current.forEach(cb => cb(games));
    });

    return socket;
  }, [clientId]);

  useEffect(() => {
    const socket = setupSocket();

    return () => {
      gamesUpdateCallbacksRef.current.clear();
      gameUpdateCallbacksRef.current.clear();
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
      socketRef.current = null;
      isConnectedRef.current = false;
    };
  }, [setupSocket]);

  const ensureConnection = useCallback(async (): Promise<boolean> => {
    if (!socketRef.current || !socketRef.current.connected) {
      setupSocket();
      return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 5000);
        socketRef.current?.once('connect', () => {
          clearTimeout(timeout);
          resolve(true);
        });
      });
    }
    return true;
  }, [setupSocket]);

  return {
    socket: socketRef.current,
    createGame: useCallback(async (userId: string) => {
      if (await ensureConnection()) {
        socketRef.current?.emit("create_game", { userId });
      }
    }, [ensureConnection]),
    joinGame: useCallback(async (gameId: string, userId: string, testPlayer?: { name: string; team: 1 | 2 }) => {
      if (await ensureConnection()) {
        socketRef.current?.emit("join_game", { gameId, userId, testPlayer });
      }
    }, [ensureConnection]),
    startGame: useCallback(async (gameId: string) => {
      if (!await ensureConnection()) {
        throw new Error('Failed to connect');
      }

      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          socketRef.current?.off('start_game_success');
          socketRef.current?.off('error');
          reject(new Error('Start game command timed out'));
        }, 5000);

        const handleSuccess = () => {
          clearTimeout(timeout);
          resolve();
        };

        const handleError = (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        };

        socketRef.current?.once('start_game_success', handleSuccess);
        socketRef.current?.once('error', handleError);
        socketRef.current?.emit("start_game", gameId);
      });
    }, [ensureConnection]),
    onGamesUpdate: useCallback((callback: (games: GameState[]) => void) => {
      gamesUpdateCallbacksRef.current.add(callback);
      if (socketRef.current?.connected) {
        socketRef.current.emit('get_games');
      }
      return () => {
        gamesUpdateCallbacksRef.current.delete(callback);
      };
    }, []),
    onGameUpdate: useCallback((callback: (game: GameState) => void) => {
      gameUpdateCallbacksRef.current.add(callback);
      return () => {
        gameUpdateCallbacksRef.current.delete(callback);
      };
    }, [])
  };
}