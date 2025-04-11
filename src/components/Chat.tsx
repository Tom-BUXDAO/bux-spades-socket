"use client";

import { useState, useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import type { Player } from '@/types/game';

interface ChatProps {
  socket: typeof Socket | null;
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

export default function Chat({ socket, gameId, userId, userName, players }: ChatProps) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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

  useEffect(() => {
    if (!socket) return;

    const handleChatMessage = (msg: ChatMessage) => {
      setMessages(prev => [...prev, msg]);
      scrollToBottom();
    };

    // Join the chat room
    socket.emit('join_room', { gameId });

    // Listen for incoming messages
    socket.on('chat_message', handleChatMessage);

    // Cleanup
    return () => {
      socket.off('chat_message', handleChatMessage);
    };
  }, [socket, gameId]);

  // Scroll to the bottom of the chat when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !socket) return;

    const chatMessage: ChatMessage = {
      userId,
      userName,
      message: message.trim(),
      timestamp: Date.now(),
    };

    socket.emit('chat_message', { gameId, ...chatMessage });
    setMessage('');
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
      {/* Messages container */}
      <div className="flex-1 overflow-y-auto p-3" style={{ backgroundColor: '#1a202c' }}>
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
      <form onSubmit={handleSendMessage} className="p-2 bg-gray-900 flex">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={screenSize.width < 640 ? "Type..." : "Type a message..."}
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