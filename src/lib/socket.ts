import { useEffect, useRef } from 'react';
import io, { Socket } from 'socket.io-client';
import type { GameState, Card } from '@/types/game';

// Create separate socket instances for regular and test connections
let regularSocket: typeof Socket | null = null;
const testSockets: Map<string, typeof Socket> = new Map();
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

export function useSocket(clientId: string = '') {
  const isTestConnection = clientId.startsWith('test_');
  const socketRef = useRef<typeof Socket | null>(null);

  useEffect(() => {
    if (isTestConnection) {
      // For test connections, create a new socket for each client
      if (!testSockets.has(clientId)) {
        const testSocket = io(SOCKET_URL, {
          transports: ['websocket'],
          query: { clientId },
          forceNew: true // Force a new connection for each test client
        });

        testSocket.on('connect', () => {
          console.log('Test socket connected with ID:', clientId);
        });

        testSocket.on('error', (error: any) => {
          console.error('Test socket error:', error);
        });

        testSockets.set(clientId, testSocket);
      }
      socketRef.current = testSockets.get(clientId) || null;
    } else {
      // For regular connections, use the singleton socket
      if (!regularSocket) {
        regularSocket = io(SOCKET_URL, {
          transports: ['websocket'],
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 45000
        });

        regularSocket.on('connect', () => {
          console.log('Regular socket connected');
        });

        regularSocket.on('error', (error: any) => {
          console.error('Regular socket error:', error);
        });
      }
      socketRef.current = regularSocket;
    }

    return () => {
      if (isTestConnection) {
        // Clean up test socket when component unmounts
        const testSocket = testSockets.get(clientId);
        if (testSocket) {
          testSocket.disconnect();
          testSockets.delete(clientId);
        }
      }
    };
  }, [clientId, isTestConnection]);

  const createGame = (userId: string) => {
    socketRef.current?.emit("create_game", { userId });
  };

  const joinGame = (gameId: string, userId: string, testPlayer?: { name: string; team: 1 | 2 }) => {
    socketRef.current?.emit("join_game", { gameId, userId, testPlayer });
  };

  const playCard = (gameId: string, userId: string, card: Card) => {
    socketRef.current?.emit("play_card", { gameId, userId, card });
  };

  const makeBid = (gameId: string, userId: string, bid: number) => {
    socketRef.current?.emit("make_bid", { gameId, userId, bid });
  };

  const onGamesUpdate = (callback: (games: GameState[]) => void) => {
    socketRef.current?.on("games_update", callback);
    socketRef.current?.emit("get_games");
    return () => {
      socketRef.current?.off("games_update", callback);
    };
  };

  const onGameUpdate = (callback: (game: GameState) => void) => {
    socketRef.current?.on("game_update", callback);
    return () => {
      socketRef.current?.off("game_update", callback);
    };
  };

  return {
    socket: socketRef.current,
    createGame,
    joinGame,
    playCard,
    makeBid,
    onGamesUpdate,
    onGameUpdate,
  };
} 