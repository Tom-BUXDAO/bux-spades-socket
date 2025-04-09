import { useState, useEffect, useRef } from 'react';
import { useSocket } from '@/lib/socket';
import type { Socket } from 'socket.io-client';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import Image from 'next/image';

interface ChatProps {
  socket: typeof Socket | null;
  gameId: string;
  userId: string;
  userName: string;
  players: Array<{
    id: string;
    name: string;
    image?: string;
  }>;
}

interface ChatMessage {
  id: string;
  user: string;
  userId: string;
  text: string;
  timestamp: number;
}

// Fallback avatars 
const GUEST_AVATAR = "/guest-avatar.png";
const BOT_AVATAR = "/guest-avatar.png";

export default function Chat({ socket, gameId, userId, userName, players }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
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

  return (
    <div className="flex flex-col h-full bg-gray-800 rounded-lg">
      <div className="p-4 bg-gray-700 flex justify-between items-center">
        <h3 className="text-lg font-semibold text-white">
          Game Chat {!isConnected && <span className="text-red-400 text-sm ml-2">(Disconnected)</span>}
        </h3>
        
        {!isConnected && (
          <button 
            onClick={handleRetry}
            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded"
          >
            Reconnect
          </button>
        )}
      </div>
      
      {error && (
        <div className="bg-red-800 text-white px-4 py-2 text-sm">
          {error}
        </div>
      )}
      
      <div className="flex-1 p-4 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 py-4">
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`mb-3 flex items-start ${msg.userId === userId ? 'justify-end' : ''}`}>
              {msg.userId !== userId && (
                <div className="w-8 h-8 mr-2 rounded-full overflow-hidden flex-shrink-0">
                  <Image 
                    src={getPlayerAvatar(msg.userId)} 
                    alt={msg.user} 
                    width={32} 
                    height={32}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              
              <div className={`max-w-[80%] ${msg.userId === userId ? 'bg-blue-600 text-white' : 'bg-gray-700 text-white'} rounded-lg px-3 py-2`}>
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-sm">{msg.userId === userId ? 'You' : msg.user}</span>
                  <span className="text-xs opacity-75 ml-2">{formatTime(msg.timestamp)}</span>
                </div>
                <p>{msg.text}</p>
              </div>
              
              {msg.userId === userId && (
                <div className="w-8 h-8 ml-2 rounded-full overflow-hidden flex-shrink-0">
                  <Image 
                    src={getPlayerAvatar(msg.userId)} 
                    alt={msg.user} 
                    width={32} 
                    height={32}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <form onSubmit={handleSubmit} className="p-4 bg-gray-700">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={isConnected ? "Type a message..." : "Reconnecting..."}
              className="w-full px-3 py-2 rounded bg-gray-600 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={!isConnected}
            />
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xl hover:text-gray-300"
              disabled={!isConnected}
            >
              😊
            </button>
            {showEmojiPicker && (
              <div className="absolute bottom-full right-0 mb-2 max-h-[320px] z-50 overflow-auto">
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
            className={`px-4 py-2 rounded transition ${
              isConnected 
                ? 'bg-blue-600 text-white hover:bg-blue-700' 
                : 'bg-gray-500 text-gray-300 cursor-not-allowed'
            }`}
            disabled={!isConnected}
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
} 