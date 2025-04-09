"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import type { GameState, Card, Suit } from "@/types/game";
import type { Socket } from "socket.io-client";
import { useSocket } from "@/lib/socket";
import Chat from './Chat';
import HandSummaryModal from './HandSummaryModal';
import WinnerModal from './WinnerModal';
import BiddingInterface from './BiddingInterface';
import { calculateHandScore } from '@/lib/scoring';

interface GameTableProps {
  game: GameState;
  socket: typeof Socket | null;
  createGame: (user: { id: string; name?: string | null }) => void;
  joinGame: (gameId: string, userId: string, options?: any) => void;
  onGamesUpdate: React.Dispatch<React.SetStateAction<GameState[]>>;
  onLeaveTable: () => void;
  startGame: (gameId: string, userId?: string) => Promise<void>;
  user?: any;
}

// Fallback avatars 
const GUEST_AVATAR = "/guest-avatar.png";
const BOT_AVATAR = "/guest-avatar.png";

// Helper function to get card image filename
function getCardImage(card: Card): string {
  const rankMap: Record<number, string> = {
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
    11: 'J', 12: 'Q', 13: 'K', 14: 'A'
  };
  return `${rankMap[card.rank]}${card.suit}.png`;
}

// Helper function to get card rank value
function getCardValue(rank: string): number {
  const rankMap: { [key: string]: number } = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  return rankMap[rank];
}

// Helper function to get suit order
function getSuitOrder(suit: string): number {
  const suitOrder: { [key: string]: number } = {
    '♣': 1, // Clubs first
    '♥': 2, // Hearts second
    '♦': 3, // Diamonds third
    '♠': 4  // Spades last
  };
  return suitOrder[suit];
}

// Helper function to sort cards
function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    const suitOrder: Record<Suit, number> = { 'D': 0, 'C': 1, 'H': 2, 'S': 3 };
    if (a.suit !== b.suit) {
      return suitOrder[a.suit] - suitOrder[b.suit];
    }
    return a.rank - b.rank;
  });
}

// Add new helper functions after the existing ones
function getLeadSuit(trick: Card[]): Suit | null {
  return trick[0]?.suit || null;
}

function hasSpadeBeenPlayed(game: GameState): boolean {
  // Check if any completed trick contained a spade
  return game.completedTricks?.some((trick: Card[]) => 
    trick.some((card: Card) => card.suit === 'S')
  ) || false;
}

function canLeadSpades(game: GameState, hand: Card[]): boolean {
  // Can lead spades if:
  // 1. Spades have been broken, or
  // 2. Player only has spades left
  return hasSpadeBeenPlayed(game) || hand.every(card => card.suit === 'S');
}

function getPlayableCards(game: GameState, hand: Card[], isLeadingTrick: boolean): Card[] {
  if (!hand.length) return [];

  // If leading the trick
  if (isLeadingTrick) {
    // If spades haven't been broken, filter out spades unless only spades remain
    if (!canLeadSpades(game, hand)) {
      const nonSpades = hand.filter(card => card.suit !== 'S');
      return nonSpades.length > 0 ? nonSpades : hand;
    }
    return hand;
  }

  // If following
  const leadSuit = getLeadSuit(game.currentTrick);
  if (!leadSuit) return [];

  // Must follow suit if possible
  const suitCards = hand.filter(card => card.suit === leadSuit);
  return suitCards.length > 0 ? suitCards : hand;
}

function determineWinningCard(trick: Card[]): number {
  if (!trick.length) return -1;

  const leadSuit = trick[0].suit;
  let highestSpade: Card | null = null;
  let highestLeadSuit: Card | null = null;

  trick.forEach((card, index) => {
    if (card.suit === 'S') {
      if (!highestSpade || card.rank > highestSpade.rank) {
        highestSpade = card;
      }
    } else if (card.suit === leadSuit) {
      if (!highestLeadSuit || card.rank > highestLeadSuit.rank) {
        highestLeadSuit = card;
      }
    }
  });

  // If any spades were played, highest spade wins
  if (highestSpade) {
    return trick.findIndex(card => 
      card.suit === highestSpade!.suit && card.rank === highestSpade!.rank
    );
  }

  // Otherwise, highest card of lead suit wins
  return trick.findIndex(card => 
    card.suit === highestLeadSuit!.suit && card.rank === highestLeadSuit!.rank
  );
}

export default function GameTable({ 
  game, 
  socket, 
  createGame, 
  joinGame, 
  onGamesUpdate,
  onLeaveTable,
  startGame,
  user: propUser
}: GameTableProps) {
  const { data: session } = useSession();
  const regularSocket = !socket ? useSocket("") : { playCard: () => {}, makeBid: () => {} };
  const [selectedBid, setSelectedBid] = useState<number | null>(null);
  const [showHandSummary, setShowHandSummary] = useState(false);
  const [showWinner, setShowWinner] = useState(false);
  const [handScores, setHandScores] = useState<ReturnType<typeof calculateHandScore> | null>(null);
  const user = propUser || session?.user;

  // Find the current player's ID
  const currentPlayerId = user?.id;
  
  // Find the current player's position and team
  const currentPlayer = game.players.find(p => p.id === currentPlayerId);
  const currentTeam = currentPlayer?.team;

  // Add state to force component updates when the current player changes
  const [lastCurrentPlayer, setLastCurrentPlayer] = useState<string>(game.currentPlayer);
  
  // Track all game state changes that would affect the UI
  useEffect(() => {
    if (lastCurrentPlayer !== game.currentPlayer) {
      console.log(`Current player changed: ${lastCurrentPlayer} -> ${game.currentPlayer} (my ID: ${currentPlayerId})`);
      setLastCurrentPlayer(game.currentPlayer);
      
      // Force a component state update to trigger re-renders of children
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('gameStateChanged'));
      }
    }
  }, [game.currentPlayer, lastCurrentPlayer, currentPlayerId]);

  // Use the explicit position property if available, otherwise fall back to array index
  // @ts-ignore - position property might not be on the type yet
  const currentPlayerPosition = currentPlayer?.position !== undefined ? currentPlayer.position : game.players.findIndex(p => p.id === currentPlayerId);

  // FIXED ROTATION: Always put current player at bottom (South)
  const rotatePlayersForCurrentView = () => {
    // If we can't find the current player, don't rotate
    if (currentPlayerPosition === -1) {
      // Create a placeholder array for 4 positions
      const positions = Array(4).fill(null);
      
      // Place each player at their explicit position
      game.players.forEach(p => {
        // @ts-ignore - position property might not be on the type yet
        const pos = p.position !== undefined ? p.position : game.players.indexOf(p);
        positions[pos] = p;
      });
      
      return positions;
    }

    // Create a rotated array where current player is at position 0 (South)
    // Create a new array with 4 positions
    const rotated = Array(4).fill(null);
    
    // Place each player at their rotated position based on their explicit position
    game.players.forEach(player => {
      if (!player || !player.id) return;
      
      // Get the player's explicit position, or fall back to array index
      // @ts-ignore - position property might not be on the type yet
      const originalPos = player.position !== undefined ? player.position : game.players.indexOf(player);
      
      // Calculate new position relative to current player
      // Formula: (4 + originalPos - currentPlayerPosition) % 4
      // This ensures current player is at position 0
      const newPos = (4 + originalPos - currentPlayerPosition) % 4;
      rotated[newPos] = player;
    });
    
    return rotated;
  };

  // Preserve original positions in the array so the server knows where everyone sits
  const orderedPlayers = rotatePlayersForCurrentView();

  // Determine player team color based on their ACTUAL team, not position
  const getTeamColor = (player: typeof orderedPlayers[number]): 1 | 2 => {
    if (!player) return 1;
    return player.team || 1;
  };

  const isCurrentPlayersTurn = game.currentPlayer === currentPlayerId;

  const handleBid = (bid: number) => {
    if (!currentPlayerId) {
      console.error('Cannot bid: No current player ID');
      return;
    }
    
    // Validate that it's actually this player's turn
    if (game.currentPlayer !== currentPlayerId) {
      console.error(`Cannot bid: Not your turn. Current player is ${game.currentPlayer}`);
      return;
    }
    
    // Validate game state
    if (game.status !== 'BIDDING') {
      console.error(`Cannot bid: Game is not in bidding state (${game.status})`);
      return;
    }
    
    console.log(`Submitting bid: ${bid} for player ${currentPlayerId} in game ${game.id}`);
    socket?.emit("make_bid", { gameId: game.id, userId: currentPlayerId, bid });
    console.log('Game status:', game.status, 'Current player:', game.currentPlayer);
    console.log('Socket connected:', socket?.connected);
  };

  const handlePlayCard = (card: Card) => {
    if (!currentPlayerId || !currentPlayer) return;

    // Validate if it's player's turn
    if (game.currentPlayer !== currentPlayerId) return;

    // Check if card is playable
    const isLeadingTrick = game.currentTrick.length === 0;
    const playableCards = getPlayableCards(game, currentPlayer.hand, isLeadingTrick);
    if (!playableCards.some(c => c.suit === card.suit && c.rank === card.rank)) {
      return;
    }

    socket?.emit("play_card", { 
      gameId: game.id, 
      userId: currentPlayerId, 
      card 
    });
  };

  const handleLeaveTable = () => {
    if (currentPlayerId && socket) {
      socket.emit("leave_game", { gameId: game.id, userId: currentPlayerId });
    }
    // Always call onLeaveTable even if we couldn't emit the event
    onLeaveTable();
  };

  const handleStartGame = async () => {
    if (!currentPlayerId) return;
    
    // Make sure the game is in the WAITING state
    if (game.status !== "WAITING") {
      console.error(`Cannot start game: game is in ${game.status} state, not WAITING`);
      return;
    }
    
    // Make sure the game has enough players
    if (game.players.length < 4) {
      console.error(`Cannot start game: only ${game.players.length}/4 players joined`);
      return;
    }
    
    // Make sure current user is the creator (first player)
    if (game.players[0]?.id !== currentPlayerId) {
      console.error(`Cannot start game: current user ${currentPlayerId} is not the creator ${game.players[0]?.id}`);
      return;
    }
    
    try {
      console.log(`Starting game ${game.id} as user ${currentPlayerId}, creator: ${game.players[0]?.id}`);
      await startGame(game.id, currentPlayerId);
    } catch (error) {
      console.error("Failed to start game:", error);
    }
  };

  // Replace the getCardDisplayPosition function
  const getCardDisplayPosition = (card: Card, trickIndex: number): number => {
    // We don't need a complex position calculation - each card display position
    // should just match the visual location of the players around the table
    // Since we're rotating the view, we need to adapt each trick position accordingly
    if (currentPlayerPosition === -1) {
      return trickIndex; // No player found, just use the trick index
    }
    
    // Simple offset calculation to match player positions
    return (trickIndex + 4 - currentPlayerPosition) % 4;
  };

  const renderPlayerPosition = (position: number) => {
    const player = orderedPlayers[position];
    if (!player) {
      // Empty seat
      return null;
    }

    const isActive = game.currentPlayer === player.id;
    
    const getPositionClasses = (pos: number): string => {
      switch (pos) {
        case 0: return 'bottom-2 left-1/2 -translate-x-1/2 flex-row';  // South (bottom)
        case 1: return 'left-8 top-1/2 -translate-y-1/2 flex-col';     // West (left)
        case 2: return 'top-2 left-1/2 -translate-x-1/2 flex-row';     // North (top)
        case 3: return 'right-8 top-1/2 -translate-y-1/2 flex-col';    // East (right)
        default: return '';
      }
    };

    // Determine player avatar based on their ID
    const getPlayerAvatar = (p: any): string => {
      // If player has their own image property, use that first
      if (p.image) {
        return p.image;
      }
      
      // If player matches the current user and we have their image
      if (p.id === currentPlayerId && propUser?.image) {
        return propUser.image;
      }
      
      // If Discord user ID format (numeric string), try to use Discord CDN
      if (/^\d+$/.test(p.id)) {
        // Use the player ID to fetch from Discord's CDN if it's a Discord ID
        return `https://cdn.discordapp.com/avatars/${p.id}/${p.image || 'avatar.png'}`;
      }
      
      // If player id starts with "guest_", use the guest avatar
      if (p.id.startsWith('guest_')) {
        return GUEST_AVATAR;
      }
      
      // Fallback to generic bot/test avatar
      return BOT_AVATAR;
    };

    const isHorizontal = position === 0 || position === 2;

    return (
      <div className={`absolute ${getPositionClasses(position)} flex items-center gap-4`}>
        <div className="relative">
          <div className={`w-16 h-16 rounded-full overflow-hidden ring-4 ${
            isActive ? 'ring-yellow-400 animate-pulse' : player.team === 1 ? 'ring-red-500' : 'ring-blue-500'
          }`}>
            <Image
              src={getPlayerAvatar(player)}
              alt="Player avatar"
              width={64}
              height={64}
              className="w-full h-full object-cover"
            />
          </div>
          {player.isDealer && (
            <div className="absolute -right-8 top-1/2 -translate-y-1/2 w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center text-black font-bold shadow-lg border-2 border-black">
              D
            </div>
          )}
        </div>
        <div className={`px-4 py-2 rounded-lg ${
          player.team === 1 ? 'bg-red-500' : 'bg-blue-500'
        } text-white text-center`}>
          <div className="font-semibold">{player.name}</div>
          {player.bid !== undefined && (
            <div className="text-yellow-200">Bid: {player.bid}</div>
          )}
          {game.status === "PLAYING" && (
            <div className="text-yellow-200">Tricks: {player.tricks}</div>
          )}
        </div>
      </div>
    );
  };

  const renderPlayerHand = () => {
    const currentPlayer = orderedPlayers[0];
    if (!currentPlayer?.hand?.length) return null;

    // Sort the cards before rendering
    const sortedHand = sortCards(currentPlayer.hand);

    // Determine playable cards
    const isLeadingTrick = game.currentTrick.length === 0;
    const playableCards = game.status === "PLAYING" ? 
      getPlayableCards(game, currentPlayer.hand, isLeadingTrick) : 
      [];

    return (
      <div className="absolute bottom-[-2rem] left-1/2 -translate-x-1/2 flex p-4">
        {sortedHand.map((card: Card, index: number) => {
          const isPlayable = game.status === "PLAYING" && 
            game.currentPlayer === currentPlayerId &&
            playableCards.some(c => c.suit === card.suit && c.rank === card.rank);

          return (
            <div
              key={`${card.suit}${card.rank}`}
              className={`relative w-24 h-36 transition-transform hover:-translate-y-8 hover:z-10 ${
                isPlayable ? 'cursor-pointer' : 'cursor-not-allowed'
              }`}
              style={{ marginLeft: index > 0 ? '-2rem' : '0' }}
              onClick={() => isPlayable && handlePlayCard(card)}
            >
              <div className="relative">
                <Image
                  src={`/cards/${getCardImage(card)}`}
                  alt={`${card.rank}${card.suit}`}
                  width={96}
                  height={144}
                  className={`rounded-lg shadow-[4px_4px_12px_rgba(0,0,0,0.8)] ${
                    isPlayable ? 'hover:shadow-[8px_8px_16px_rgba(0,0,0,0.9)]' : ''
                  }`}
                  style={{ width: 'auto', height: 'auto' }}
                />
                {!isPlayable && (
                  <div className="absolute inset-0 bg-gray-600/40 rounded-lg" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Check for game end conditions
  const checkGameEnd = (team1Total: number, team2Total: number) => {
    const team1Won = team1Total >= 500 && team1Total > team2Total;
    const team2Won = team2Total >= 500 && team2Total > team1Total;
    const tieBreak = team1Total >= 500 && team2Total >= 500 && team1Total === team2Total;

    if (team1Won) return 1;
    if (team2Won) return 2;
    if (tieBreak) return 'tiebreak';
    return null;
  };

  // Watch for hand completion
  useEffect(() => {
    if (game.status === "FINISHED" && !handScores) {
      setHandScores(calculateHandScore(game.players));
      setShowHandSummary(true);
    }
  }, [game.status]);

  const handleHandSummaryClose = () => {
    setShowHandSummary(false);
    if (socket && handScores) {
      socket.emit("update_scores", {
        gameId: game.id,
        team1Score: handScores.team1.score,
        team2Score: handScores.team2.score,
        startNewHand: true
      });
      setHandScores(null);
    }
  };

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (showHandSummary) {
      timeoutId = setTimeout(handleHandSummaryClose, 5000);
    }
    return () => clearTimeout(timeoutId);
  }, [showHandSummary]);

  const handleWinnerClose = () => {
    setShowWinner(false);
    setHandScores(null);
    // Emit event to end game and return to lobby
    socket?.emit("end_game", { gameId: game.id });
    onLeaveTable();
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      <div className="py-4"></div>
      {/* Header */}
      <div className="bg-gray-800 text-white px-6 py-2 flex justify-between items-center">
        <div className="flex items-center space-x-6">
          <h2 className="text-xl font-bold">Game #{game.id}</h2>
          <div className="flex space-x-4">
            <div>Status: {game.status}</div>
            <div className="text-red-500">Score: {game.team1Score}</div>
            <div className="text-blue-500">Score: {game.team2Score}</div>
          </div>
        </div>
        <button
          onClick={handleLeaveTable}
          className="px-4 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition"
        >
          Leave Table
        </button>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Game table area - 70% */}
        <div className="w-[70%] p-4 flex flex-col">
          {/* Game table */}
          <div className="relative flex-1 mb-4" style={{ 
            background: 'radial-gradient(circle at center, #316785 0%, #1a3346 100%)',
            borderRadius: '64px',
            border: '2px solid #855f31'
          }}>
            {/* Players around the table */}
            {[0, 1, 2, 3].map((position) => (
              <div key={`player-position-${position}`}>
                {renderPlayerPosition(position)}
              </div>
            ))}

            {/* Center content */}
            <div className="absolute inset-0 flex items-center justify-center">
              {game.status === "WAITING" && game.players.length === 4 && game.players[0]?.id === currentPlayerId ? (
                <button
                  onClick={handleStartGame}
                  className="px-6 py-3 bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded-lg shadow-lg transform hover:scale-105 transition-all"
                >
                  Start Game
                </button>
              ) : game.status === "WAITING" && game.players.length < 4 ? (
                <div className="px-6 py-3 bg-gray-700 text-gray-300 rounded-lg text-center">
                  <div className="font-bold">Waiting for Players</div>
                  <div className="text-sm mt-1">{game.players.length}/4 joined</div>
                </div>
              ) : game.status === "WAITING" && game.players[0]?.id !== currentPlayerId ? (
                <div className="px-6 py-3 bg-gray-700 text-gray-300 rounded-lg text-center">
                  <div className="font-bold">Waiting for Host</div>
                  <div className="text-sm mt-1">Only {game.players[0]?.name} can start</div>
                </div>
              ) : game.status === "BIDDING" && game.currentPlayer !== currentPlayerId ? (
                <div className="px-6 py-3 bg-gray-700 text-white rounded-lg text-center animate-pulse">
                  <div className="font-bold">Waiting for {game.players.find(p => p.id === game.currentPlayer)?.name} to bid</div>
                </div>
              ) : game.currentTrick && game.currentTrick.length > 0 ? (
                <div className="relative w-48 h-48">
                  {/* Actual cards */}
                  {game.currentTrick.map((card, index) => {
                    const displayPosition = getCardDisplayPosition(card, index);
                    
                    const positionStyles = [
                      "absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/3",  // Bottom (0)
                      "absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2",    // Left (1)
                      "absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/3",    // Top (2)
                      "absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2"     // Right (3)
                    ];

                    return (
                      <div 
                        key={`${card.suit}${card.rank}`} 
                        className={positionStyles[displayPosition]}
                      >
                        <Image
                          src={`/cards/${getCardImage(card)}`}
                          alt={`${card.rank}${card.suit}`}
                          width={63}
                          height={88}
                          className="rounded-lg shadow-lg"
                          style={{ width: 'auto', height: 'auto' }}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {/* Bidding interface */}
            {game.status === "BIDDING" && (
              <BiddingInterface
                onBid={handleBid}
                currentBid={orderedPlayers[0]?.bid}
                gameId={game.id}
                playerId={currentPlayerId || ''}
                currentPlayerTurn={game.currentPlayer}
              />
            )}
          </div>

          {/* Cards area below table */}
          <div className="h-32 bg-gray-800/50 rounded-lg relative" style={{ clipPath: 'inset(-100% 0 0 0)' }}>
            {renderPlayerHand()}
          </div>
        </div>

        {/* Chat area - 30% */}
        <div className="w-[30%] p-4">
          <Chat 
            socket={socket}
            gameId={game.id}
            userId={currentPlayerId || ''}
            userName={currentPlayer?.name || 'Unknown'}
            players={game.players}
          />
        </div>
      </div>

      {/* Hand Summary Modal */}
      {showHandSummary && handScores && (
        <HandSummaryModal
          onClose={handleHandSummaryClose}
          players={game.players}
          team1Score={handScores.team1}
          team2Score={handScores.team2}
        />
      )}

      {/* Winner Modal */}
      {showWinner && handScores && (
        <WinnerModal
          isOpen={showWinner}
          onClose={handleWinnerClose}
          team1Score={game.team1Score + handScores.team1.score}
          team2Score={game.team2Score + handScores.team2.score}
          winningTeam={game.team1Score + handScores.team1.score > game.team2Score + handScores.team2.score ? 1 : 2}
        />
      )}
    </div>
  );
} 