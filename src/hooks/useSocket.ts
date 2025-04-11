import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

// Define the socket server URL - adjust as needed
const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'http://localhost:3001';

/**
 * Hook to manage a Socket.IO connection
 * @param namespace - Optional namespace to connect to
 * @returns Socket instance and connection status
 */
export function useSocket(namespace = '') {
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Skip socket creation in SSR context
    if (typeof window === 'undefined') return;

    // Create the socket connection
    const socketUrl = `${SOCKET_SERVER_URL}${namespace ? `/${namespace}` : ''}`;
    
    try {
      socketRef.current = io(socketUrl, {
        transports: ['websocket'],
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });
      
      // Set up event listeners
      socketRef.current.on('connect', () => {
        console.log('Socket connected');
        setIsConnected(true);
        setError(null);
      });
      
      socketRef.current.on('disconnect', () => {
        console.log('Socket disconnected');
        setIsConnected(false);
      });
      
      socketRef.current.on('connect_error', (err: Error) => {
        console.error('Socket connection error:', err);
        setError('Failed to connect to server');
        setIsConnected(false);
      });
      
      socketRef.current.on('error', (err: { message?: string }) => {
        console.error('Socket error:', err);
        setError(err.message || 'Unknown socket error');
      });
    } catch (err: unknown) {
      console.error('Failed to create socket connection:', err);
      setError('Failed to create socket connection');
    }
    
    // Cleanup function to disconnect the socket when the component unmounts
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [namespace]);

  return {
    socket: socketRef.current,
    isConnected,
    error,
  };
}

export default useSocket; 