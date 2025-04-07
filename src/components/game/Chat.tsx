import { useState, useEffect, useRef } from 'react';
import { useSocket } from '@/lib/socket';
import type { Socket } from 'socket.io-client';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

interface ChatProps {
  socket: typeof Socket | null;
  gameId: string;
  userId: string;
  userName: string;
}

export default function Chat({ socket, gameId, userId, userName }: ChatProps) {
  const [messages, setMessages] = useState<{ user: string; text: string }[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
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
    setShowEmojiPicker(false);
  };

  const onEmojiSelect = (emoji: any) => {
    setInputValue(prev => prev + emoji.native);
  };

  return (
    <div className="flex flex-col h-full bg-gray-800 rounded-lg">
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
              <div className="absolute bottom-full right-0 mb-2 max-h-[50vh] overflow-auto">
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