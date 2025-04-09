"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import GameLobby from "@/components/lobby/GameLobby";
import GameTable from "@/components/game/GameTable";
import type { GameState } from "@/types/game";
import { useSocket } from "@/lib/socket";

export default function GamePage() {
  const { data: session, status } = useSession();
  const [currentGame, setCurrentGame] = useState<GameState | null>(null);
  const [guestUser, setGuestUser] = useState<any>(null);
  const { socket, createGame, joinGame, onGamesUpdate, startGame, closeAllPreviousConnections } = useSocket("");

  useEffect(() => {
    // Check for guest user in localStorage
    const storedGuest = localStorage.getItem('guestUser');
    if (storedGuest) {
      setGuestUser(JSON.parse(storedGuest));
    }
  }, []);

  // Clean up any lingering game connections when component mounts
  useEffect(() => {
    if (session?.user?.id) {
      console.log("Cleaning up previous connections for user:", session.user.id);
      closeAllPreviousConnections(session.user.id);
    } else if (guestUser?.id) {
      console.log("Cleaning up previous connections for guest:", guestUser.id);
      closeAllPreviousConnections(guestUser.id);
    }
  }, [session?.user?.id, guestUser?.id, closeAllPreviousConnections]);

  useEffect(() => {
    // Listen for game updates
    const unsubscribe = onGamesUpdate((games) => {
      if (currentGame) {
        const updatedGame = games.find(g => g.id === currentGame.id);
        if (updatedGame) {
          setCurrentGame(updatedGame);
        } else {
          // If game no longer exists, return to lobby
          setCurrentGame(null);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [currentGame, onGamesUpdate]);

  // Add another effect to handle initial games list
  useEffect(() => {
    const unsubscribe = onGamesUpdate((games) => {
      // If we're not in a game, we still want to update the lobby
      if (!currentGame) {
        // The GameLobby will receive these updates via its own onGamesUpdate subscription
        console.log("Available games:", games.length);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [currentGame, onGamesUpdate]);

  if (status === "loading") {
    return <div>Loading...</div>;
  }

  // Allow access if user is either authenticated via NextAuth or has guest data
  if (status === "unauthenticated" && !guestUser) {
    redirect("/");
  }

  const handleGameSelect = (game: GameState) => {
    setCurrentGame(game);
  };

  const handleLeaveTable = () => {
    setCurrentGame(null);
  };

  // Use either NextAuth session or guest user data
  const user = session?.user || guestUser;

  return (
    <main className="container mx-auto p-4">
      {currentGame ? (
        <GameTable 
          game={currentGame} 
          socket={socket}
          createGame={createGame}
          joinGame={joinGame}
          onGamesUpdate={onGamesUpdate}
          onLeaveTable={handleLeaveTable}
          startGame={startGame}
          user={user}
        />
      ) : (
        <GameLobby 
          onGameSelect={handleGameSelect} 
          user={user}
          socket={socket}
          createGame={createGame}
          joinGame={joinGame}
          onGamesUpdate={onGamesUpdate}
        />
      )}
    </main>
  );
} 