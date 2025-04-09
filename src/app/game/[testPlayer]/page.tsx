"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import GameTable from "@/components/game/GameTable";
import type { GameState } from "@/types/game";
import { useTestSocket } from "@/lib/test-socket";

const TEST_PLAYERS = {
  "Tom": { name: "Tom", team: 1 },
  "Dani": { name: "Dani", team: 2 },
  "Alice": { name: "Alice", team: 1 },
  "Bob": { name: "Bob", team: 2 }
} as const;

// Disable NextAuth for test routes
export const dynamic = 'force-dynamic';
export const runtime = 'edge';

export default function TestGamePage() {
  const params = useParams();
  const testPlayer = params.testPlayer as keyof typeof TEST_PLAYERS;
  const [currentGame, setCurrentGame] = useState<GameState | null>(null);
  const [games, setGames] = useState<GameState[]>([]);
  
  // Create a unique socket connection for each test player
  const { socket, createGame, joinGame, startGame, onGamesUpdate, onGameUpdate } = useTestSocket(`test_${testPlayer}`);

  // Create a mock session user based on the test player
  const mockUser = {
    id: `test_${testPlayer}`,
    name: TEST_PLAYERS[testPlayer]?.name || testPlayer,
    isGuest: true
  };

  // Handle game state updates
  const handleGameUpdate = useCallback((updatedGame: GameState) => {
    if (updatedGame.id === 'TEST_GAME') {
      setCurrentGame(updatedGame);
    }
  }, []);

  // Handle games list updates
  const handleGamesUpdate = useCallback((games: GameState[]) => {
    // Update the games state
    setGames(games);
    
    const testGame = games.find(g => g.id === "TEST_GAME");
    
    if (!testGame) {
      // If no test game exists and we're Tom (first player), create it
      if (testPlayer === "Tom") {
        createGame(mockUser);
      }
      return;
    }

    // Only join if we haven't yet
    if (!testGame.players.some(p => p.name === TEST_PLAYERS[testPlayer].name)) {
      joinGame("TEST_GAME", mockUser.id, {
        name: TEST_PLAYERS[testPlayer].name,
        team: TEST_PLAYERS[testPlayer].team
      });
    }

    // Update game state
    setCurrentGame(testGame);
  }, [testPlayer, createGame, joinGame, mockUser]);

  useEffect(() => {
    if (!TEST_PLAYERS[testPlayer]) {
      console.error("Invalid test player:", testPlayer);
      return;
    }

    // Clear any existing session data
    localStorage.clear();
    sessionStorage.clear();
    document.cookie.split(";").forEach((c) => {
      document.cookie = c
        .replace(/^ +/, "")
        .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });

    // Set up event listeners
    const unsubscribeGameUpdate = onGameUpdate(handleGameUpdate);
    const unsubscribeGamesUpdate = onGamesUpdate(handleGamesUpdate);

    return () => {
      unsubscribeGameUpdate();
      unsubscribeGamesUpdate();
    };
  }, [testPlayer, onGameUpdate, onGamesUpdate, handleGameUpdate, handleGamesUpdate]);

  return (
    <div className="min-h-screen">
      {!currentGame ? (
        <div className="flex items-center justify-center h-screen">
          <div className="text-xl">Setting up test game as {TEST_PLAYERS[testPlayer]?.name}...</div>
        </div>
      ) : (
        <main className="container mx-auto p-4">
          <GameTable 
            game={currentGame}
            socket={socket || null}
            createGame={createGame}
            joinGame={joinGame}
            onGamesUpdate={((callback: (games: GameState[]) => void) => {
              const unsubscribe = onGamesUpdate(callback);
              return unsubscribe;
            }) as unknown as React.Dispatch<React.SetStateAction<GameState[]>>}
            onLeaveTable={() => {}} // Disable leaving table in test mode
            user={mockUser} // Pass the mock user directly to bypass authentication
            startGame={(gameId: string, userId?: string) => {
              return startGame(gameId);
            }} // Wrap startGame function to match new interface
          />
        </main>
      )}
    </div>
  );
} 