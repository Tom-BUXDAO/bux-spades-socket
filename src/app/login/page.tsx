"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Image from "next/image";

export default function LoginPage() {
  const [guestName, setGuestName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleGuestLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) return;
    
    setIsLoading(true);
    try {
      const result = await signIn("credentials", {
        redirect: false,
        name: guestName,
        type: "guest"
      });

      if (result?.error) {
        console.error("Login failed:", result.error);
        setIsLoading(false);
      } else {
        window.location.href = "/game";
      }
    } catch (error) {
      console.error("Login error:", error);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-md space-y-8">
        <h1 className="text-3xl font-bold text-white text-center">Join Spades Game</h1>

        {/* Quick Guest Login */}
        <form onSubmit={handleGuestLogin} className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className="flex-1 px-4 py-3 bg-gray-700 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="Enter your name to play"
              required
              minLength={2}
              maxLength={20}
              pattern="[A-Za-z0-9 ]+"
            />
            <button
              type="submit"
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50"
              disabled={isLoading || !guestName.trim()}
            >
              {isLoading ? "Joining..." : "Play Now"}
            </button>
          </div>
          <p className="text-sm text-gray-400 text-center">
            No account needed - just enter a name and start playing!
          </p>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-600"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-gray-800 text-gray-400">or</span>
          </div>
        </div>

        {/* Discord Login */}
        <button
          onClick={() => signIn("discord", { callbackUrl: "/game" })}
          className="w-full flex items-center justify-center gap-3 bg-[#5865F2] text-white py-3 px-4 rounded-lg hover:bg-[#4752C4] transition-colors"
          disabled={isLoading}
        >
          <Image
            src="/discord-mark-white.svg"
            alt="Discord"
            width={24}
            height={24}
          />
          Sign in with Discord
        </button>
      </div>
    </div>
  );
} 