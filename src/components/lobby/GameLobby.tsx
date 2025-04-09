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
    if (game && position !== undefined && game.players[position]) {
      console.log("Position already taken, cannot join this seat");
      return;
    }

    // Join as the user with team selection 
    console.log("Attempting to join game with:", { 
      gameId, 
      userId: user.id, 
      testPlayer: { 
        name: user.name, 
        team,
        browserSessionId,
        image: user.image || undefined
      } 
    });
    
    joinGame(gameId, user.id, { 
      name: user.name, 
      team,
      browserSessionId,
      position,
      image: user.image || undefined
    });
    
    setTestPlayerName("");
    setSelectedGame(null);
  };

  const handleNameSubmit = () => {
    if (playerName.trim()) {
      setShowNameInput(false);
      if (selectedGame) {
        joinGame(
          selectedGame.gameId, 
          user.id, 
          { 
            name: playerName, 
            team: selectedGame.team,
            browserSessionId,
            position: selectedGame.position
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {games.map((game) => (
          <div
            key={game.id}
            className="border rounded-lg p-6 bg-gray-50 shadow-md"
          >
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-medium">Game #{game.id}</h3>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(game.id);
                    alert('Game ID copied to clipboard!');
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800"
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

            {/* Table visualization */}
            <div className="relative aspect-square mb-4 max-w-[300px] mx-auto">
              {/* Table background */}
              <div className="absolute inset-[15%] rounded-full bg-[#316785] border-4 border-[#855f31]"></div>
              
              {/* Team labels */}
              <div className="absolute inset-[20%] flex flex-col items-center justify-center">
                <div className="flex w-full justify-between px-4 pb-1">
                  <div className="bg-blue-500 text-white text-xs px-2 py-0.5 rounded-sm">Team 1</div>
                  <div className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-sm">Team 2</div>
                </div>
                <div className="text-white text-xs text-center mb-1">N/S: Team 1</div>
                <div className="text-white text-xs text-center">E/W: Team 2</div>
              </div>
              
              {/* North position */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-20">
                {game.players[2] ? (
                  <div className={`w-full h-full rounded-full overflow-hidden border-4 ${
                    getTeamForPosition(2) === 1 ? 'border-red-500' : 'border-blue-500'
                  } flex items-center justify-center bg-white`}>
                    {game.players[2].name.charAt(0).toUpperCase()}
                    <div className="absolute bottom-0 w-full bg-black bg-opacity-60 text-white text-xs py-1 text-center truncate">
                      {game.players[2].name}
                    </div>
                  </div>
                ) : (
                  game.status === "WAITING" && (
                    <button 
                      onClick={() => handleJoinGame(game.id, getTeamForPosition(2), 2)}
                      className={`w-full h-full rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-sm font-medium border-4 ${
                        getTeamForPosition(2) === 1 ? 'border-red-500' : 'border-blue-500'
                      }`}
                    >
                      North<br/>Join
                    </button>
                  )
                )}
                <div className={`absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs font-bold text-white ${
                  getTeamForPosition(2) === 1 ? 'bg-red-500' : 'bg-blue-500'
                } px-2 py-0.5 rounded-full`}>N</div>
              </div>
              
              {/* East position */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-20 h-20">
                {game.players[3] ? (
                  <div className={`w-full h-full rounded-full overflow-hidden border-4 ${
                    getTeamForPosition(3) === 1 ? 'border-red-500' : 'border-blue-500'
                  } flex items-center justify-center bg-white`}>
                    {game.players[3].name.charAt(0).toUpperCase()}
                    <div className="absolute bottom-0 w-full bg-black bg-opacity-60 text-white text-xs py-1 text-center truncate">
                      {game.players[3].name}
                    </div>
                  </div>
                ) : (
                  game.status === "WAITING" && (
                    <button 
                      onClick={() => handleJoinGame(game.id, getTeamForPosition(3), 3)}
                      className={`w-full h-full rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-sm font-medium border-4 ${
                        getTeamForPosition(3) === 1 ? 'border-red-500' : 'border-blue-500'
                      }`}
                    >
                      East<br/>Join
                    </button>
                  )
                )}
                <div className={`absolute -left-5 top-1/2 -translate-y-1/2 text-xs font-bold text-white ${
                  getTeamForPosition(3) === 1 ? 'bg-red-500' : 'bg-blue-500'
                } px-2 py-0.5 rounded-full`}>E</div>
              </div>
              
              {/* South position */}
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-20 h-20">
                {game.players[0] ? (
                  <div className={`w-full h-full rounded-full overflow-hidden border-4 ${
                    getTeamForPosition(0) === 1 ? 'border-red-500' : 'border-blue-500'
                  } flex items-center justify-center bg-white`}>
                    {game.players[0].name.charAt(0).toUpperCase()}
                    <div className="absolute bottom-0 w-full bg-black bg-opacity-60 text-white text-xs py-1 text-center truncate">
                      {game.players[0].name}
                    </div>
                  </div>
                ) : (
                  game.status === "WAITING" && (
                    <button 
                      onClick={() => handleJoinGame(game.id, getTeamForPosition(0), 0)}
                      className={`w-full h-full rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-sm font-medium border-4 ${
                        getTeamForPosition(0) === 1 ? 'border-red-500' : 'border-blue-500'
                      }`}
                    >
                      South<br/>Join
                    </button>
                  )
                )}
                <div className={`absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-bold text-white ${
                  getTeamForPosition(0) === 1 ? 'bg-red-500' : 'bg-blue-500'
                } px-2 py-0.5 rounded-full`}>S</div>
              </div>
              
              {/* West position */}
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-20 h-20">
                {game.players[1] ? (
                  <div className={`w-full h-full rounded-full overflow-hidden border-4 ${
                    getTeamForPosition(1) === 1 ? 'border-red-500' : 'border-blue-500'
                  } flex items-center justify-center bg-white`}>
                    {game.players[1].name.charAt(0).toUpperCase()}
                    <div className="absolute bottom-0 w-full bg-black bg-opacity-60 text-white text-xs py-1 text-center truncate">
                      {game.players[1].name}
                    </div>
                  </div>
                ) : (
                  game.status === "WAITING" && (
                    <button 
                      onClick={() => handleJoinGame(game.id, getTeamForPosition(1), 1)}
                      className={`w-full h-full rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-sm font-medium border-4 ${
                        getTeamForPosition(1) === 1 ? 'border-red-500' : 'border-blue-500'
                      }`}
                    >
                      West<br/>Join
                    </button>
                  )
                )}
                <div className={`absolute -right-5 top-1/2 -translate-y-1/2 text-xs font-bold text-white ${
                  getTeamForPosition(1) === 1 ? 'bg-red-500' : 'bg-blue-500'
                } px-2 py-0.5 rounded-full`}>W</div>
              </div>
            </div>

            {game.status !== "WAITING" && game.players.some(p => isControlledByThisBrowser(p.id, p.browserSessionId)) && (
              <button
                onClick={() => onGameSelect(game)}
                className="w-full px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition"
              >
                Join Game
              </button>
            )}
          </div>
        ))}

        {games.length === 0 && (
          <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg col-span-2">
            No games available. Create one to start playing!
          </div>
        )}
      </div>
    </div>
  );
} 