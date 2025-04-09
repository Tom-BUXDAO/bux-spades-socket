"use client";

import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import Image from "next/image";
import type { GameState } from "@/types/game";
import type { Socket } from "socket.io-client";

interface GameLobbyProps {
  onGameSelect: (game: GameState) => void;
  user: {
    id: string;
    name?: string | null;
    isGuest?: boolean;
    image?: string | null;
  };
  socket: typeof Socket | null;
  createGame: (user: { id: string; name?: string | null; image?: string | null }) => void;
  joinGame: (gameId: string, userId: string, testPlayer?: { 
    name: string; 
    team: 1 | 2; 
    browserSessionId?: string; 
    position?: number; 
    image?: string;
  }) => void;
  onGamesUpdate: (callback: (games: GameState[]) => void) => () => void;
}

// Add avatar constants at the top of the file
const GUEST_AVATAR = "/guest-avatar.png";
const BOT_AVATAR = "/guest-avatar.png";

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
  const [selectedGame, setSelectedGame] = useState<{ gameId: string; team: 1 | 2; position?: number } | null>(null);
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
    // Track if this effect has run to prevent duplicate handlers
    let isEffectActive = true;
    
    const unsubscribe = onGamesUpdate(setGames);

    // Keep track of games list requests - use ref to maintain state between renders
    const requestState = {
      hasRequested: false,
      timeoutId: null as NodeJS.Timeout | null
    };

    // Clean up function to ensure we don't have memory leaks
    const cleanup = () => {
      if (requestState.timeoutId) {
        clearTimeout(requestState.timeoutId);
        requestState.timeoutId = null;
      }
    };

    // Ensure the socket is connected and emit 'get_games'
    if (socket && isEffectActive) {
      // Throttled games request function
      const requestGames = () => {
        cleanup(); // Clear any existing timeout
        
        console.log("Requesting games list");
        socket.emit("get_games");
        
        // Set a flag to prevent multiple requests
        requestState.hasRequested = true;
        
        // Reset the flag after some time to allow future requests, if needed
        requestState.timeoutId = setTimeout(() => {
          requestState.hasRequested = false;
          requestState.timeoutId = null;
        }, 10000); // 10 second cooldown
      };

      // Connect event handler
      const handleConnect = () => {
        console.log("Connected with socket ID:", socket.id);
        // Emit a custom event to close previous connections
        socket.emit("close_previous_connections", { userId: user.id });
        
        // Request games list once on connection if needed
        if (!requestState.hasRequested) {
          requestGames();
        }
      };

      // One-time initialize
      console.log("Setting up socket event handlers");
      
      // Remove any existing listeners first to prevent duplicates
      socket.off("connect");
      socket.off("error");
      socket.off("game_created");
      socket.off("game_update");
      
      // Set up event listeners
      socket.on("connect", handleConnect);
      
      // Set up error event handler
      const handleError = ({ message }: { message: string }) => {
        console.error("Game error:", message);
        
        // If the error is that the user already has a game, find and join it
        if (message === 'You already have a game') {
          console.log("User already has a game, looking for it in the games list");
          
          const existingGame = games.find(game => 
            game.players.some(player => player.id === user.id)
          );
          
          if (existingGame) {
            console.log("Found existing game, selecting it:", existingGame.id);
            setCurrentPlayerId(user.id);
            onGameSelect(existingGame);
          } else {
            console.log("Could not find existing game, requesting games update once");
            // Request an update of the games list, but only once
            if (!requestState.hasRequested) {
              console.log("Requesting games list after error");
              requestGames();
            }
          }
        }
      };
      
      // Set up game creation handler
      const handleGameCreated = ({ gameId, game }: { gameId: string; game: GameState }) => {
        console.log("Game created:", gameId);
        setCurrentPlayerId(user.id);
        
        // Explicitly join the game after creation
        console.log("Explicitly joining game after creation:", gameId);
        socket.emit("join_game", { 
          gameId, 
          userId: user.id, 
          testPlayer: { 
            name: user.name || "Unknown Player", 
            team: 1 
          } 
        });
        
        onGameSelect(game);
      };
      
      // Set up game update handler
      const handleGameUpdate = (game: GameState) => {
        console.log("Received game_update for game:", game.id, "with players:", game.players);
        onGameSelect(game);
      };
      
      // Register event handlers
      socket.on("error", handleError);
      socket.on("game_created", handleGameCreated);
      socket.on("game_update", handleGameUpdate);
      
      // Initial connection handling
      if (socket.connected) {
        handleConnect();
      }

      // Clean up 
      return () => {
        // Mark effect as inactive
        isEffectActive = false;
        
        cleanup(); // Clear any timeouts
        
        // Remove all event listeners
        socket.off("connect", handleConnect);
        socket.off("error", handleError);
        socket.off("game_created", handleGameCreated);
        socket.off("game_update", handleGameUpdate);
      };
    }

    // Clean up the effects
    return () => {
      unsubscribe();
      cleanup();
    };
  }, [onGamesUpdate, socket, user.id, onGameSelect]);

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

  const handleJoinGame = async (gameId: string, team: 1 | 2, position?: number) => {
    if (!user?.id) return;

    if (!user.name) {
      setShowNameInput(true);
      setSelectedGame({ gameId, team, position });
      return;
    }

    // Get the game to check if the position is already taken
    const game = games.find(g => g.id === gameId);
    
    // Log everything about this join attempt
    console.log("JOIN ATTEMPT:", {
      gameId,
      userId: user.id,
      userName: user.name,
      requestedPosition: position,
      requestedTeam: team
    });
    
    // Force position to be respected - server will place player at exactly this position
    console.log(`Attempting to join game with EXPLICIT position ${position}`);
    
    // Join as the user with team selection 
    joinGame(gameId, user.id, { 
      name: user.name, 
      team,
      browserSessionId,
      position, // This is the key part - we're passing the exact position
      image: user.image || undefined
    });
    
    setTestPlayerName("");
    setSelectedGame(null);
  };

  const handleNameSubmit = () => {
    if (playerName.trim()) {
      setShowNameInput(false);
      if (selectedGame) {
        console.log(`Guest player ${playerName} joining with EXPLICIT position ${selectedGame.position}`);
        
        joinGame(
          selectedGame.gameId, 
          user.id, 
          { 
            name: playerName, 
            team: selectedGame.team,
            browserSessionId,
            position: selectedGame.position // Make sure position is passed
          }
        );
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

  // Determine team based on position - North/South (0,2) are Team 1, East/West (1,3) are Team 2
  const getTeamForPosition = (position: number): 1 | 2 => {
    return position % 2 === 0 ? 1 : 2;
  };

  // Helper function to match the one in GameTable.tsx
  const getPlayerAvatar = (p: any): string => {
    // If player has their own image property, use that first
    if (p.image) {
      return p.image;
    }
    
    // If Discord user ID format (numeric string), try to use Discord CDN
    if (/^\d+$/.test(p.id)) {
      // Use the player ID to fetch from Discord's CDN if it's a Discord ID
      return `https://cdn.discordapp.com/avatars/${p.id}/${p.image || 'avatar.png'}`;
    }
    
    // If player id starts with "guest_", use the guest avatar
    if (p.id && p.id.startsWith('guest_')) {
      return GUEST_AVATAR;
    }
    
    // Fallback to generic bot/test avatar
    return BOT_AVATAR;
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
          <h3 className="text-lg font-medium text-white">Available Games</h3>
        </div>
        <button
          onClick={handleCreateGame}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Create New Game
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {games.map((game) => (
          <div
            key={game.id}
            className="border border-gray-700 rounded-lg p-4 bg-gray-800 shadow-md"
          >
            <div className="flex justify-between items-center mb-3">
              <div className="text-white">
                <h3 className="text-sm font-medium">REG · NBN · 500</h3>
              </div>
              <div className={`px-2 py-0.5 rounded-full text-xs ${
                game.status === "WAITING" ? "bg-yellow-500 text-black" :
                game.status === "BIDDING" ? "bg-blue-500 text-white" :
                game.status === "PLAYING" ? "bg-green-500 text-white" :
                "bg-gray-500 text-white"
              }`}>
                {game.status}
              </div>
            </div>

            {/* Table visualization */}
            <div className="relative mb-3 mx-auto" style={{ 
              width: "320px", 
              height: "200px",
              maxWidth: "100%" 
            }}>
              {/* Table background */}
              <div className="absolute inset-[15%] rounded-full bg-[#316785] border-4 border-[#855f31]"></div>
              
              {/* North position */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-16">
                {game.players.find(p => p.position === 2) ? (
                  <div className={`w-full h-full rounded-full overflow-hidden border-3 ${
                    getTeamForPosition(2) === 1 ? 'border-red-500' : 'border-blue-500'
                  } flex items-center justify-center bg-white`}>
                    <Image 
                      src={getPlayerAvatar(game.players.find(p => p.position === 2))} 
                      alt="Player avatar" 
                      className="w-full h-full object-cover"
                      width={64}
                      height={64}
                    />
                    <div className="absolute bottom-0 w-full bg-black bg-opacity-60 text-white text-[10px] py-0.5 text-center truncate">
                      {game.players.find(p => p.position === 2)?.name}
                    </div>
                  </div>
                ) : (
                  game.status === "WAITING" && (
                    <button 
                      onClick={() => {
                        // Explicitly log which position we're joining
                        console.log("JOINING POSITION 2 (NORTH)");
                        handleJoinGame(game.id, getTeamForPosition(2), 2);
                      }}
                      className={`w-full h-full rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-xs font-medium border-3 ${
                        getTeamForPosition(2) === 1 ? 'border-red-500' : 'border-blue-500'
                      } text-white`}
                    >
                      Join
                    </button>
                  )
                )}
              </div>
              
              {/* East position */}
              <div className="absolute right-5 top-1/2 -translate-y-1/2 w-16 h-16">
                {game.players.find(p => p.position === 3) ? (
                  <div className={`w-full h-full rounded-full overflow-hidden border-3 ${
                    getTeamForPosition(3) === 1 ? 'border-red-500' : 'border-blue-500'
                  } flex items-center justify-center bg-white`}>
                    <Image 
                      src={getPlayerAvatar(game.players.find(p => p.position === 3))} 
                      alt="Player avatar" 
                      className="w-full h-full object-cover"
                      width={64}
                      height={64}
                    />
                    <div className="absolute bottom-0 w-full bg-black bg-opacity-60 text-white text-[10px] py-0.5 text-center truncate">
                      {game.players.find(p => p.position === 3)?.name}
                    </div>
                  </div>
                ) : (
                  game.status === "WAITING" && (
                    <button 
                      onClick={() => {
                        // Explicitly log which position we're joining
                        console.log("JOINING POSITION 3 (EAST)");
                        handleJoinGame(game.id, getTeamForPosition(3), 3);
                      }}
                      className={`w-full h-full rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-xs font-medium border-3 ${
                        getTeamForPosition(3) === 1 ? 'border-red-500' : 'border-blue-500'
                      } text-white`}
                    >
                      Join
                    </button>
                  )
                )}
              </div>
              
              {/* South position */}
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-16">
                {game.players.find(p => p.position === 0) ? (
                  <div className={`w-full h-full rounded-full overflow-hidden border-3 ${
                    getTeamForPosition(0) === 1 ? 'border-red-500' : 'border-blue-500'
                  } flex items-center justify-center bg-white`}>
                    <Image 
                      src={getPlayerAvatar(game.players.find(p => p.position === 0))} 
                      alt="Player avatar" 
                      className="w-full h-full object-cover"
                      width={64}
                      height={64}
                    />
                    <div className="absolute bottom-0 w-full bg-black bg-opacity-60 text-white text-[10px] py-0.5 text-center truncate">
                      {game.players.find(p => p.position === 0)?.name}
                    </div>
                  </div>
                ) : (
                  game.status === "WAITING" && (
                    <button 
                      onClick={() => {
                        // Explicitly log which position we're joining
                        console.log("JOINING POSITION 0 (SOUTH)");
                        handleJoinGame(game.id, getTeamForPosition(0), 0);
                      }}
                      className={`w-full h-full rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-xs font-medium border-3 ${
                        getTeamForPosition(0) === 1 ? 'border-red-500' : 'border-blue-500'
                      } text-white`}
                    >
                      Join
                    </button>
                  )
                )}
              </div>
              
              {/* West position */}
              <div className="absolute left-5 top-1/2 -translate-y-1/2 w-16 h-16">
                {game.players.find(p => p.position === 1) ? (
                  <div className={`w-full h-full rounded-full overflow-hidden border-3 ${
                    getTeamForPosition(1) === 1 ? 'border-red-500' : 'border-blue-500'
                  } flex items-center justify-center bg-white`}>
                    <Image 
                      src={getPlayerAvatar(game.players.find(p => p.position === 1))} 
                      alt="Player avatar" 
                      className="w-full h-full object-cover"
                      width={64}
                      height={64}
                    />
                    <div className="absolute bottom-0 w-full bg-black bg-opacity-60 text-white text-[10px] py-0.5 text-center truncate">
                      {game.players.find(p => p.position === 1)?.name}
                    </div>
                  </div>
                ) : (
                  game.status === "WAITING" && (
                    <button 
                      onClick={() => {
                        // Explicitly log which position we're joining
                        console.log("JOINING POSITION 1 (WEST)");
                        handleJoinGame(game.id, getTeamForPosition(1), 1);
                      }}
                      className={`w-full h-full rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-xs font-medium border-3 ${
                        getTeamForPosition(1) === 1 ? 'border-red-500' : 'border-blue-500'
                      } text-white`}
                    >
                      Join
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Game actions buttons */}
            <div className="flex gap-2">
              {/* Show Join Game button if the player has already joined the game */}
              {game.status !== "WAITING" && game.players.some(p => isControlledByThisBrowser(p.id, p.browserSessionId)) && (
                <button
                  onClick={() => onGameSelect(game)}
                  className="flex-1 px-2 py-1 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition"
                >
                  Join Game
                </button>
              )}
              
              {/* Watch button for spectators */}
              <button
                onClick={() => onGameSelect(game)}
                className="flex-1 px-2 py-1 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 transition"
              >
                Watch
              </button>
            </div>
          </div>
        ))}

        {games.length === 0 && (
          <div className="text-center py-8 text-gray-400 bg-gray-800 rounded-lg col-span-1 sm:col-span-2 md:col-span-3 lg:col-span-4 border border-gray-700">
            No games available. Create one to start playing!
          </div>
        )}
      </div>
    </div>
  );
} 