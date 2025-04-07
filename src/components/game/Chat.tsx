import { useState, useEffect, useRef } from 'react';
import { useSocket } from '@/lib/socket';
import type { Socket } from 'socket.io-client';

interface ChatProps {
  socket: typeof Socket | null;
  gameId: string;
  userId: string;
  userName: string;
}

export default function Chat({ socket, gameId, userId, userName }: ChatProps) {
  const [messages, setMessages] = useState<{ user: string; text: string }[]>([]);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Only use regular socket if not in test mode
  const regularSocket = !socket ? useSocket("") : null;

  useEffect(() => {
    const handleMessage = (message: { user: string; text: string }) => {
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
      user: userName,
      text: inputValue.trim()
    };

    if (socket) {
      socket.emit('chat_message', { gameId, message });
    } else if (regularSocket?.socket) {
      regularSocket.socket.emit('chat_message', { gameId, message });
    }

    setInputValue('');
  };

  return (
    <div className="flex flex-col h-full bg-gray-800 rounded-lg overflow-hidden">
      <div className="p-4 bg-gray-700">
        <h3 className="text-lg font-semibold text-white">Game Chat</h3>
      </div>
      
      <div className="flex-1 p-4 overflow-y-auto">
        {messages.map((msg, i) => (
          <div key={i} className="mb-2">
            <span className="font-semibold text-yellow-400">{msg.user}: </span>
            <span className="text-white">{msg.text}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      
      <form onSubmit={handleSubmit} className="p-4 bg-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 rounded bg-gray-600 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
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