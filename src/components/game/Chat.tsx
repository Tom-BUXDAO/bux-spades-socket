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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Only use regular socket if not in test mode
  const regularSocket = !socket ? useSocket("") : null;

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
    const handleMessage = (message: ChatMessage) => {
      setMessages(prev => [...prev, message]);
    };

    if (socket) {
      socket.on('chat_message', handleMessage);
    } else if (regularSocket?.socket) {
      regularSocket.socket.on('chat_message', handleMessage);
    }

    return () => {
      if (socket) {
        socket.off('chat_message', handleMessage);
      } else if (regularSocket?.socket) {
        regularSocket.socket.off('chat_message', handleMessage);
      }
    };
  }, [socket, regularSocket]);

  useEffect(() => {
    // Scroll to bottom whenever messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const message = {
      id: `${Date.now()}-${userId}`,
      user: userName,
      userId: userId,
      text: inputValue.trim(),
      timestamp: Date.now()
    };

    if (socket) {
      socket.emit('chat_message', { gameId, message });
    } else if (regularSocket?.socket) {
      regularSocket.socket.emit('chat_message', { gameId, message });
    }

    // Add the message locally for immediate feedback
    setMessages(prev => [...prev, message]);
    
    setInputValue('');
    setShowEmojiPicker(false);
  };

  const onEmojiSelect = (emoji: any) => {
    setInputValue(prev => prev + emoji.native);
  };
  
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full bg-gray-800 rounded-lg">
      <div className="p-4 bg-gray-700">
        <h3 className="text-lg font-semibold text-white">Game Chat</h3>
      </div>
      
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
              placeholder="Type a message..."
              className="w-full px-3 py-2 rounded bg-gray-600 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xl hover:text-gray-300"
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
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
} 