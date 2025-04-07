"use client";

import { signIn } from "next-auth/react";
import { FaDiscord } from "react-icons/fa";
import { useSearchParams } from "next/navigation";

export default function SignIn() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-md">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-bold text-gray-900">Welcome to Bux Spades</h2>
          <p className="mt-2 text-sm text-gray-600">Sign in to start playing</p>
        </div>
        <div className="mt-8 space-y-4">
          <button
            onClick={() => signIn("discord", { callbackUrl })}
            className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#7289DA] hover:bg-[#677BC4] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#7289DA]"
          >
            <FaDiscord className="mr-2" />
            Sign in with Discord
          </button>
        </div>
      </div>
    </div>
  );
} 