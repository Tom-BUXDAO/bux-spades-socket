"use client";

import { useState, useEffect, useRef } from 'react';
import { useSocket } from '@/lib/socket';
import type { Socket } from 'socket.io-client';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import Image from 'next/image';
import { Player } from '@/types/game';

interface ChatProps {
  socket: Socket | null;
  gameId: string;
  userId: string;
  userName: string;
  players: Player[];
}

interface ChatMessage {
  userId: string;
  userName: string;
  message: string;
  timestamp: number;
  isGameMessage?: boolean;
}

// Fallback avatars 
const GUEST_AVATAR = "/guest-avatar.png";
const BOT_AVATAR = "/guest-avatar.png";

export default function Chat({ socket, gameId, userId, userName, players }: ChatProps) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Add responsive sizing state
  const [screenSize, setScreenSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800
  });

  // Listen for screen size changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleResize = () => {
      setScreenSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Calculate scale factor for responsive sizing
  const getScaleFactor = () => {
    // Base scale on the screen width compared to a reference size
    const referenceWidth = 1200; // Reference width for desktop
    let scale = Math.min(1, screenSize.width / referenceWidth);
    
    // Minimum scale to ensure things aren't too small
    return Math.max(0.65, scale);
  };
  
  const scaleFactor = getScaleFactor();
  
  // Font sizes based on scale
  const fontSize = Math.max(12, Math.floor(14 * scaleFactor));
  const headerFontSize = Math.max(14, Math.floor(18 * scaleFactor));

  // Only use regular socket if not in test mode
  const regularSocket = !socket ? useSocket(gameId) : null;

  // Get the actual socket to use
  const activeSocket = socket || regularSocket?.socket;
  
  // Track connection status
  useEffect(() => {
    if (!activeSocket) return;
    
    const onConnect = () => {
      console.log('Chat socket connected to game:', gameId);
      setIsConnected(true);
      setError(null);
      
      // Explicitly join the game room when connected
      activeSocket.emit('join_game', {
        gameId,
        userId,
        // We're just joining to listen, not as a player
        watchOnly: true
      });
    };
    
    const onDisconnect = () => {
      console.log('Chat socket disconnected from game:', gameId);
      setIsConnected(false);
    };
    
    const onError = (err: any) => {
      console.error('Chat socket error:', err);
      setError(err.message || 'Connection error');
    };
    
    activeSocket.on('connect', onConnect);
    activeSocket.on('disconnect', onDisconnect);
    activeSocket.on('connect_error', onError);
    activeSocket.on('error', onError);
    
    // Set initial connection state
    setIsConnected(activeSocket.connected);
    
    if (activeSocket.connected) {
      // Explicitly join the game room if already connected
      activeSocket.emit('join_game', {
        gameId,
        userId,
        watchOnly: true
      });
    }

    return () => {
      activeSocket.off('connect', onConnect);
      activeSocket.off('disconnect', onDisconnect);
      activeSocket.off('connect_error', onError);
      activeSocket.off('error', onError);
    };
  }, [activeSocket, gameId, userId]);

  // Get player avatar
  const getPlayerAvatar = (playerId: string): string => {
    const player = players.find(p => p.id === playerId);
    
    // If player has their own image property, use that first
    if (player?.image) {
      return player.image;
    }
    
    // If Discord user ID format (numeric string), try to use Discord CDN
    if (playerId && /^\d+$/.test(playerId)) {
      // Use the player ID to fetch from Discord's CDN if it's a Discord ID
      return `https://cdn.discordapp.com/avatars/${playerId}/avatar.png`;
    }
    
    // If player id starts with "guest_", use the guest avatar
    if (playerId && playerId.startsWith('guest_')) {
      return GUEST_AVATAR;
    }
    
    // Fallback to generic bot/test avatar
    return BOT_AVATAR;
  };

  useEffect(() => {
    if (!activeSocket) return;
    
    const handleMessage = (message: ChatMessage) => {
      console.log('Received chat message:', message);
      setMessages(prev => {
        // Deduplicate messages by id
        if (prev.some(m => m.id === message.id)) {
          return prev;
        }
        return [...prev, message];
      });
    };

    activeSocket.on('chat_message', handleMessage);

    return () => {
      activeSocket.off('chat_message', handleMessage);
    };
  }, [activeSocket]);

  useEffect(() => {
    // Scroll to bottom whenever messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !activeSocket || !isConnected) return;

    try {
      // Generate a unique ID for this message
      const messageId = `${Date.now()}-${userId}-${Math.random().toString(36).substr(2, 9)}`;
  
      const message = {
        id: messageId,
        user: userName,
        userId: userId,
        text: inputValue.trim(),
        timestamp: Date.now()
      };
  
      console.log('Sending chat message:', message);
  
      activeSocket.emit('chat_message', { gameId, message }, (ack: any) => {
        if (ack && ack.error) {
          console.error('Error sending message:', ack.error);
          setError(`Failed to send: ${ack.error}`);
        } else {
          setError(null);
        }
      });
      
      // Add the message locally for immediate feedback
      setMessages(prev => [...prev, message]);
      
      setInputValue('');
      setShowEmojiPicker(false);
    } catch (error) {
      console.error('Error sending chat message:', error);
      setError('Failed to send message');
    }
  };

  const onEmojiSelect = (emoji: any) => {
    setInputValue(prev => prev + emoji.native);
  };
  
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleRetry = () => {
    // Try to reconnect the socket manually
    if (activeSocket) {
      activeSocket.connect();
    }
    setError(null);
  };

  const getMessageClass = (msg: ChatMessage) => {
    if (msg.isGameMessage) {
      return 'bg-gray-700 text-gray-300';
    }
    return msg.userId === userId ? 'bg-blue-700 text-white' : 'bg-gray-700 text-white';
  };

  const playerColors: Record<string, string> = {};
  players.forEach(player => {
    playerColors[player.id] = player.team === 1 ? 'text-red-400' : 'text-blue-400';
  });

  return (
    <div className="flex flex-col h-full bg-gray-800 rounded-lg overflow-hidden">
      {/* Chat header */}
      <div className="bg-gray-900 p-2">
        <h3 className="text-white font-bold" style={{ fontSize: `${headerFontSize}px` }}>Game Chat</h3>
      </div>
      
      {/* Game status notifications */}
      {userId === gameId || (
        <div className="bg-red-900 text-white p-2 text-center" style={{ fontSize: `${fontSize}px` }}>
          {game?.currentPlayer === userId ? "Your turn to play" : "Not your turn to play"}
        </div>
      )}

      {/* Messages container */}
      <div className="flex-1 overflow-y-auto p-3" style={{ maxHeight: `calc(100% - ${Math.floor(90 * scaleFactor)}px)` }}>
        {messages.length === 0 ? (
          <div className="text-gray-400 text-center" style={{ fontSize: `${fontSize}px` }}>
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`my-1 p-2 rounded-lg max-w-[85%] ${
                msg.userId === userId ? 'ml-auto' : 'mr-auto'
              } ${getMessageClass(msg)}`}
              style={{ fontSize: `${fontSize}px` }}
            >
              {msg.userId !== userId && (
                <div className={`font-bold ${playerColors[msg.userId] || 'text-gray-300'}`}>
                  {msg.userName}
                </div>
              )}
              <div>{msg.message}</div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message input */}
      <form onSubmit={handleSubmit} className="p-2 bg-gray-900 flex">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Type a message..."
          className="bg-gray-700 text-white rounded-l px-3 py-1 flex-1 outline-none"
          style={{ fontSize: `${fontSize}px` }}
        />
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 rounded-r hover:bg-blue-700"
          style={{ fontSize: `${fontSize}px` }}
        >
          Send
        </button>
      </form>
    </div>
  );
} 