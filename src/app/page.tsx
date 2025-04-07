"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";

export default function Home() {
  const { data: session, status } = useSession();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-24">
      <div className="relative w-[200px] sm:w-[300px] aspect-square mb-12">
        <Image
          src="/BUX.png"
          alt="BUX Logo"
          fill
          priority
          sizes="(max-width: 640px) 200px, 300px"
          className="object-contain"
        />
      </div>
      <h1 className="text-4xl font-bold mb-8">Bux Spades</h1>
      {status === "loading" ? (
        <div>Loading...</div>
      ) : session ? (
        <div className="space-y-4 text-center">
          <p>Welcome, {session.user.name}!</p>
          <p>Coins: {session.user.coins}</p>
          <Link
            href="/game"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Play Now
          </Link>
        </div>
      ) : (
        <Link
          href="/login"
          className="inline-block px-6 py-3 bg-[#7289DA] text-white rounded-lg hover:bg-[#677BC4] transition"
        >
          Sign In to Play
        </Link>
      )}
    </main>
  );
}
