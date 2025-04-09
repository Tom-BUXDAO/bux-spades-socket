"use client";

import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import type { GameState } from "@/types/game";
import type { Socket } from "socket.io-client";

interface GameLobbyProps {
  onGameSelect: (game: GameState) => void;
  user: {
    id: string;
    name?: string | null;
    isGuest?: boolean;
  };
  socket: typeof Socket | null;
  createGame: (user: { id: string; name?: string | null }) => void;
  joinGame: (gameId: string, userId: string, testPlayer?: { name: string; team: 1 | 2; browserSessionId?: string }) => void;
  onGamesUpdate: (callback: (games: GameState[]) => void) => () => void;
}

export default function GameLobby({ 
  onGameSelect, 
  user, 
  socket, 
  createGame, 
  joinGame, 
  onGamesUpdate 
}: GameLobbyProps) {
  const [games, setGames] = useState<GameState[]>([]);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [showNameInput, setShowNameInput] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [selectedGame, setSelectedGame] = useState<{ gameId: string; team: 1 | 2 } | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [testPlayerName, setTestPlayerName] = useState("");
  const [browserSessionId] = useState(() => {
    // Get or create a unique browser session ID
    let sessionId = localStorage.getItem('browserSessionId');
    if (!sessionId) {
      sessionId = `browser_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      localStorage.setItem('browserSessionId', sessionId);
    }
    return sessionId;
  });

  useEffect(() => {
    const unsubscribe = onGamesUpdate(setGames);

    // Ensure the socket is connected and emit 'get_games'
    if (socket) {
      socket.emit("get_games");

      // Handle multiple connections
      socket.on("connect", () => {
        console.log("Connected with socket ID:", socket.id);
        // Emit a custom event to close previous connections
        socket.emit("close_previous_connections", { userId: user.id, browserSessionId });
      });
    }

    // Listen for game creation response
    socket?.on("game_created", ({ gameId, game }: { gameId: string; game: GameState }) => {
      console.log("Game created:", gameId);
      setCurrentPlayerId(user.id);
      // Automatically join the game after creation
      joinGame(gameId, user.id, { name: user.name || "Unknown Player", team: 1 });
      onGameSelect(game);
    });

    // Listen for errors
    socket?.on("error", ({ message }: { message: string }) => {
      console.error("Game error:", message);
    });

    // Listen for game update
    socket?.on("game_update", (game: GameState) => {
      console.log("Received game_update for game:", game.id, "with players:", game.players);
      // Add detailed logging
      console.log("Current game state:", game);
      onGameSelect(game);
    });

    return () => {
      unsubscribe();
      socket?.off("game_created");
      socket?.off("error");
    };
  }, [onGamesUpdate, socket, user.id, onGameSelect, joinGame]);

  const handleCreateGame = async () => {
    console.log("Creating game with user:", user);
    
    if (!user) {
      console.error("No user data available");
      return;
    }
    
    if (!user.id) {
      console.error("No user ID available");
      return;
    }

    console.log("Sending user object:", user);
    createGame(user);
  };

  const handleJoinGame = async (gameId: string, team: 1 | 2) => {
    if (!user?.id) return;

    if (!user.name) {
      setShowNameInput(true);
      setSelectedGame({ gameId, team });
      return;
    }

    if (testPlayerName) {
      // Join as test player with browser session tracking
      const testPlayer = {
        name: testPlayerName,
        team,
        browserSessionId
      };
      const testPlayerId = `test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      joinGame(gameId, testPlayerId, testPlayer);
    } else {
      // Join as current user with team selection
      console.log("Attempting to join game with:", { gameId, userId: user.id, testPlayer: { name: user.name, team } });
      joinGame(gameId, user.id, { name: user.name, team });
    }
    setTestPlayerName("");
    setSelectedGame(null);
  };

  const handleNameSubmit = () => {
    if (playerName.trim()) {
      setShowNameInput(false);
      if (selectedGame) {
        if (testPlayerName) {
          const testPlayer = {
            name: testPlayerName,
            team: selectedGame.team,
            browserSessionId
          };
          const testPlayerId = `test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          joinGame(selectedGame.gameId, testPlayerId, testPlayer);
        } else {
          joinGame(selectedGame.gameId, user.id, { name: playerName, team: selectedGame.team });
        }
      }
      setPlayerName("");
      setSelectedGame(null);
    }
  };

  const handleLogout = () => {
    signOut({ 
      callbackUrl: "/login"
    });
  };

  // Function to check if a player is controlled by this browser
  const isControlledByThisBrowser = (playerId: string, browserSessionId?: string) => {
    return user.id === playerId || browserSessionId === browserSessionId;
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Header with user info and logout */}
      <div className="flex justify-between items-center bg-gray-800 p-4 rounded-lg shadow-md">
        <div>
          <h2 className="text-xl font-bold text-white">
            {currentPlayerId ? 
              `Playing as: ${games.find(g => g.players.some(p => p.id === currentPlayerId))?.players.find(p => p.id === currentPlayerId)?.name}` :
              `Playing as: ${user?.name}`
            }
          </h2>
          <p className="text-sm text-gray-400">
            {user?.isGuest ? "Guest Account" : "Discord Account"}
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Logout
        </button>
      </div>

      {/* Name input modal */}
      {showNameInput && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-96">
            <h3 className="text-lg font-medium mb-4">Enter Player Name</h3>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-3 py-2 border rounded mb-4"
              onKeyPress={(e) => e.key === 'Enter' && handleNameSubmit()}
            />
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowNameInput(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleNameSubmit}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Join Game
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Available Games</h3>
        </div>
        <button
          onClick={handleCreateGame}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Create New Game
        </button>
      </div>

      {/* Test Player Input */}
      <div className="bg-gray-100 p-4 rounded-lg">
        <h4 className="text-sm font-medium mb-2">Test Player Options</h4>
        <div className="flex gap-2">
          <input
            type="text"
            value={testPlayerName}
            onChange={(e) => setTestPlayerName(e.target.value)}
            placeholder="Enter test player name"
            className="flex-1 px-3 py-2 border rounded"
          />
        </div>
        <p className="text-xs text-gray-600 mt-1">
          Leave empty to join as yourself, or enter a name to join as a test player. Each browser can only control its own test players.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {games.map((game) => (
          <div
            key={game.id}
            className="border rounded-lg p-4 bg-gray-50 space-y-3"
          >
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-medium">Game #{game.id}</h3>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(game.id);
                    alert('Game ID copied to clipboard!');
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Copy ID
                </button>
              </div>
              <div className={`px-3 py-1 rounded-full ${
                game.status === "WAITING" ? "bg-yellow-100 text-yellow-800" :
                game.status === "BIDDING" ? "bg-blue-100 text-blue-800" :
                game.status === "PLAYING" ? "bg-green-100 text-green-800" :
                "bg-gray-100 text-gray-800"
              }`}>
                {game.status}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                Players: {game.players.length}/4
              </p>
              <div className="grid grid-cols-2 gap-2">
                {game.players.map((player, index) => (
                  <div 
                    key={player.id}
                    className={`p-2 rounded ${
                      player.team === 1 ? "bg-blue-100" : "bg-red-100"
                    } ${isControlledByThisBrowser(player.id, player.browserSessionId) ? "ring-2 ring-yellow-400" : ""}`}
                  >
                    <div className="text-sm font-medium">
                      {player.name}
                      {isControlledByThisBrowser(player.id, player.browserSessionId) && " (You)"}
                    </div>
                    <div className="text-xs text-gray-600">
                      Team {player.team} - Position {index + 1}
                    </div>
                  </div>
                ))}
                {Array.from({ length: 4 - game.players.length }).map((_, i) => (
                  <div 
                    key={i} 
                    className="p-2 rounded bg-gray-100 flex flex-col space-y-2"
                  >
                    <div className="text-sm text-gray-400">Empty Seat</div>
                    {game.status === "WAITING" && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleJoinGame(game.id, 1)}
                          className="flex-1 px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition"
                        >
                          Join Team 1
                        </button>
                        <button
                          onClick={() => handleJoinGame(game.id, 2)}
                          className="flex-1 px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition"
                        >
                          Join Team 2
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {game.status !== "WAITING" && game.players.some(p => isControlledByThisBrowser(p.id, p.browserSessionId)) && (
              <button
                onClick={() => onGameSelect(game)}
                className="w-full px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition text-sm"
              >
                Join Game
              </button>
            )}
          </div>
        ))}

        {games.length === 0 && (
          <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
            No games available. Create one to start playing!
          </div>
        )}
      </div>
    </div>
  );
} 