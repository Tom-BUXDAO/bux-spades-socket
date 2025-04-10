"use client";

import { useState, useEffect, useRef } from 'react';
import { useSocket, sendChatMessage } from '@/lib/socket';
import type { Socket } from 'socket.io-client';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import Image from 'next/image';
import { Player } from '@/types/game';

interface ChatProps {
  socket: typeof Socket | null;
  gameId: string;
  userId: string;
  userName: string;
  players: Player[];
}

interface ChatMessage {
  id?: string;
  userId: string;
  userName: string;
  message: string;
  text?: string; // For compatibility with existing code
  user?: string; // For compatibility with existing code
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
  
  // Mobile-specific font sizes (smaller than regular sizes)
  const isMobile = screenSize.width < 640;
  const mobileFontSize = isMobile ? 11 : fontSize;
  const mobileHeaderFontSize = isMobile ? 13 : headerFontSize;

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

  // Get a player's avatar - updated to match GameTable.tsx logic
  const getPlayerAvatar = (playerId: string): string => {
    // Find the player in the players array
    const player = players.find(p => p.id === playerId);
    
    // Type guard for image property
    if (player && 'image' in player && player.image) {
      return player.image as string;
    }
    
    // Discord user ID (numeric string)
    if (playerId && /^\d+$/.test(playerId)) {
      // For Discord users without an avatar hash or with invalid avatar, use the default Discord avatar
      return `https://cdn.discordapp.com/embed/avatars/${parseInt(playerId) % 5}.png`;
    }
    
    // Guest user, use default avatar
    if (playerId && playerId.startsWith('guest_')) {
      return GUEST_AVATAR;
    }
    
    // Fallback to bot avatar
    return BOT_AVATAR;
  };

  useEffect(() => {
    if (!activeSocket) return;
    
    const handleMessage = (data: any) => {
      console.log('Received raw chat message data:', data);
      
      // Handle different message formats
      let chatMessage: ChatMessage;
      
      if (data.message && typeof data.message === 'object') {
        // Case where the server wraps the message object
        chatMessage = data.message;
      } else if (data.userId || data.user) {
        // Direct message object
        chatMessage = data;
      } else {
        console.error('Unrecognized chat message format:', data);
        return;
      }
      
      // Ensure message has an ID and timestamp
      if (!chatMessage.id) {
        chatMessage.id = `${Date.now()}-${chatMessage.userId || 'server'}-${Math.random().toString(36).substr(2, 9)}`;
      }
      
      if (!chatMessage.timestamp) {
        chatMessage.timestamp = Date.now();
      }
      
      console.log('Processed chat message:', chatMessage);
      
      setMessages(prev => {
        // Deduplicate messages by id if id exists
        if (chatMessage.id && prev.some(m => m.id === chatMessage.id)) {
          return prev;
        }
        return [...prev, chatMessage];
      });
    };

    // Listen for direct chat messages
    activeSocket.on('chat_message', handleMessage);
    
    // Some servers might use this event name instead
    activeSocket.on('chat', handleMessage);

    return () => {
      activeSocket.off('chat_message', handleMessage);
      activeSocket.off('chat', handleMessage);
    };
  }, [activeSocket]);

  useEffect(() => {
    // Scroll to bottom whenever messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !activeSocket) return;

    try {
      // Generate a unique ID for this message
      const messageId = `${Date.now()}-${userId}-${Math.random().toString(36).substr(2, 9)}`;

      const chatMessage = {
        id: messageId,
        userName: userName,
        userId: userId,
        message: inputValue.trim(),
        timestamp: Date.now()
      };

      console.log('Sending chat message:', chatMessage, 'to game:', gameId);
      
      // Try both methods of sending the message
      activeSocket.emit('chat_message', {
        gameId,
        message: chatMessage
      });
      
      // Add the message to our local state immediately (optimistic UI)
      setMessages(prev => [...prev, chatMessage as ChatMessage]);

      // Clear the input field
      setInputValue('');
      setShowEmojiPicker(false);
    } catch (err) {
      console.error('Failed to send chat message:', err);
      setError('Failed to send message. Please try again.');
    }
  };

  const onEmojiSelect = (emoji: any) => {
    setInputValue(prev => prev + emoji.native);
  };

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleRetry = () => {
    if (regularSocket?.socket) {
      regularSocket.socket.connect();
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
    <div className="flex flex-col h-full bg-gray-800 rounded-lg overflow-hidden border border-gray-600 shadow-lg">
      {/* Chat header */}
      <div className="bg-gray-900 p-2 border-b border-gray-600">
        <h3 className="text-white font-bold" style={{ fontSize: `${mobileHeaderFontSize}px` }}>Game Chat</h3>
      </div>
      
      {/* Messages container */}
      <div className="flex-1 overflow-y-auto p-3 bg-gray-850" style={{ maxHeight: `calc(100% - ${Math.floor(90 * scaleFactor)}px)`, backgroundColor: '#1a202c' }}>
        {messages.length === 0 ? (
          <div className="text-gray-400 text-center" style={{ fontSize: `${mobileFontSize}px` }}>
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={msg.id || index}
              className={`mb-3 flex items-start ${msg.userId === userId ? 'justify-end' : ''}`}
            >
              {msg.userId !== userId && (
                <div className={`w-${isMobile ? '6' : '8'} h-${isMobile ? '6' : '8'} mr-2 rounded-full overflow-hidden flex-shrink-0`}>
                  <Image 
                    src={getPlayerAvatar(msg.userId)} 
                    alt={msg.userName || msg.user || ''} 
                    width={isMobile ? 24 : 32} 
                    height={isMobile ? 24 : 32}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              
              <div className={`max-w-[80%] ${msg.userId === userId ? 'bg-blue-600 text-white' : 'bg-gray-700 text-white'} rounded-lg px-${isMobile ? '2' : '3'} py-${isMobile ? '1' : '2'}`}>
                <div className="flex justify-between items-center mb-1">
                  {msg.userId !== userId && (
                    <span className="font-medium text-xs opacity-80" style={{ fontSize: isMobile ? '9px' : '' }}>{msg.userName || msg.user}</span>
                  )}
                  <span className="text-xs opacity-75 ml-auto" style={{ fontSize: isMobile ? '9px' : '' }}>{formatTime(msg.timestamp)}</span>
                </div>
                <p style={{ fontSize: `${mobileFontSize}px` }}>{msg.message || msg.text}</p>
              </div>
              
              {msg.userId === userId && (
                <div className={`w-${isMobile ? '6' : '8'} h-${isMobile ? '6' : '8'} ml-2 rounded-full overflow-hidden flex-shrink-0`}>
                  <Image 
                    src={getPlayerAvatar(msg.userId)} 
                    alt={msg.userName || msg.user || ''} 
                    width={isMobile ? 24 : 32} 
                    height={isMobile ? 24 : 32}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message input */}
      <form onSubmit={handleSubmit} className="p-2 bg-gray-900 flex border-t border-gray-600">
        <div className="relative flex-1">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type a message..."
            className="bg-gray-700 text-white rounded-l w-full px-3 py-2 outline-none border-0"
            style={{ fontSize: `${fontSize}px` }}
          />
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xl text-yellow-300 hover:text-yellow-200"
          >
            😊
          </button>
          {showEmojiPicker && (
            <div className="absolute bottom-full right-0 mb-2 z-10">
              <Picker 
                data={data} 
                onEmojiSelect={onEmojiSelect}
                theme="dark"
                previewPosition="none"
                skinTonePosition="none"
              />
            </div>
          )}
        </div>
        <button
          type="submit"
          className="bg-blue-600 text-white rounded-r hover:bg-blue-700 flex items-center justify-center w-10"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
          </svg>
        </button>
      </form>
    </div>
  );
} 