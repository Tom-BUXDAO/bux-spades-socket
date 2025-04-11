"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import type { GameState, Card, Suit } from "@/types/game";
import type { Socket } from "socket.io-client";
import { useSocket, sendChatMessage, debugTrickWinner, setupTrickCompletionDelay } from "@/lib/socket";
import Chat from './Chat';
import HandSummaryModal from './HandSummaryModal';
import WinnerModal from './WinnerModal';
import LoserModal from './LoserModal';
import BiddingInterface from './BiddingInterface';
import { calculateHandScore } from '@/lib/scoring';
import LandscapePrompt from '@/components/LandscapePrompt';
import { IoExitOutline } from "react-icons/io5";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import useResizeObserver from "@/hooks/useResizeObserver";
import { useWindowSize } from '../../hooks';

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
function getCardValue(rank: string | number): number {
  // If rank is already a number, return it
  if (typeof rank === 'number') {
    return rank;
  }
  
  // Otherwise, convert string ranks to numbers
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
  
  console.log("DETERMINING WINNING CARD:", trick.map(c => `${c.rank}${c.suit}`));
  
  // Check if any spades were played - spades always trump other suits
  const spadesPlayed = trick.filter(card => card.suit === 'S');
  
  if (spadesPlayed.length > 0) {
    // Find the highest spade
    const highestSpade = spadesPlayed.reduce((highest, current) => {
      const currentValue = getCardValue(current.rank);
      const highestValue = getCardValue(highest.rank);
      console.log(`Comparing spades: ${current.rank}${current.suit} (${currentValue}) vs ${highest.rank}${highest.suit} (${highestValue})`);
      return currentValue > highestValue ? current : highest;
    }, spadesPlayed[0]);
    
    console.log(`Highest spade is ${highestSpade.rank}${highestSpade.suit}`);
    
    // Return the index of the highest spade
    for (let i = 0; i < trick.length; i++) {
      if (trick[i].suit === 'S' && trick[i].rank === highestSpade.rank) {
        console.log(`Winning card is at position ${i}: ${trick[i].rank}${trick[i].suit}`);
        return i;
      }
    }
  }
  
  // If no spades, find the highest card of the lead suit
  const leadSuitCards = trick.filter(card => card.suit === leadSuit);
  
  console.log(`Lead suit is ${leadSuit}, cards of this suit:`, leadSuitCards.map(c => `${c.rank}${c.suit}`));
  
  // Debug each card's numeric value
  leadSuitCards.forEach(card => {
    console.log(`Card ${card.rank}${card.suit} has numeric value: ${getCardValue(card.rank)}`);
  });
  
  const highestLeadSuitCard = leadSuitCards.reduce((highest, current) => {
    const currentValue = getCardValue(current.rank);
    const highestValue = getCardValue(highest.rank);
    console.log(`Comparing: ${current.rank}${current.suit} (${currentValue}) vs ${highest.rank}${highest.suit} (${highestValue})`);
    return currentValue > highestValue ? current : highest;
  }, leadSuitCards[0]);
  
  console.log(`Highest card of lead suit ${leadSuit} is ${highestLeadSuitCard.rank}${highestLeadSuitCard.suit}`);
  
  // Return the index of the highest lead suit card
  for (let i = 0; i < trick.length; i++) {
    if (trick[i].suit === leadSuit && trick[i].rank === highestLeadSuitCard.rank) {
      console.log(`Winning card is at position ${i}: ${trick[i].rank}${trick[i].suit}`);
      return i;
    }
  }
  
  // Fallback (should never happen)
  console.error("Failed to determine winning card - this should never happen", trick);
  return 0;
}

// Add a new interface to track which player played each card
interface TrickCard extends Card {
  playedBy?: string; // Player ID who played this card
}

// Add this near the top of the file, after imports
declare global {
  interface Window {
    lastCompletedTrick: {
      cards: Card[];
      winnerIndex: number;
      timeout: any;
    } | null;
  }
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
  const router = useRouter();
  const pathname = usePathname();
  const tableRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const regularSocket = !socket ? useSocket("") : { playCard: () => {}, makeBid: () => {} };
  const [selectedBid, setSelectedBid] = useState<number | null>(null);
  const [showHandSummary, setShowHandSummary] = useState(false);
  const [showWinner, setShowWinner] = useState(false);
  const [showLoser, setShowLoser] = useState(false);
  const [handScores, setHandScores] = useState<ReturnType<typeof calculateHandScore> | null>(null);
  
  // Use the windowSize hook to get responsive information
  const windowSize = useWindowSize();
  
  // Custom border flashing animation style
  useEffect(() => {
    if (typeof document !== "undefined") {
      const borderFlashKeyframes = `
        @keyframes border-flash {
          0%, 100% { border-color: #facc15; } /* yellow-400 */
          50% { border-color: white; }
        }
      `;
      
      const styleElement = document.createElement("style");
      styleElement.innerHTML = borderFlashKeyframes;
      document.head.appendChild(styleElement);
      
      return () => {
        if (styleElement.parentNode) {
          document.head.removeChild(styleElement);
        }
      };
    }
  }, []);
  
  // Game configuration constants
  const WINNING_SCORE = 500; // Score needed to win the game
  const MODAL_DISPLAY_TIME = 5000; // Time to show modals in milliseconds
  
  // Add state to directly track which player played which card
  const [cardPlayers, setCardPlayers] = useState<Record<number, string>>({});
  
  // Add a ref to preserve completed trick card-player mappings
  const completedTrickCardPlayers = useRef<Record<number, string>>({});
  
  // Add state for tracking the winning card
  const [winningCardIndex, setWinningCardIndex] = useState<number | null>(null); 
  const [winningPlayerId, setWinningPlayerId] = useState<string | null>(null);
  const [showWinningCardHighlight, setShowWinningCardHighlight] = useState(false);
  
  const user = propUser || session?.user;
  
  // Add state to store player positions for the current trick
  const [trickCardPositions, setTrickCardPositions] = useState<Record<number, number>>({});

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

  // Effect to track which card was played by which player
  useEffect(() => {
    // When a new trick starts, reset our tracking
    if (game.currentTrick.length === 0) {
      console.log("🔄 New trick starting - resetting card players mapping");
      // Save the completed trick mapping before clearing
      setCardPlayers({});
      setShowWinningCardHighlight(false);
      setWinningCardIndex(null);
      setWinningPlayerId(null);
      return;
    }

    // For a complete trick, we need to determine who played each card
    // First, we need to figure out the starting player (dealer + 1)
    // @ts-ignore - dealerPosition might not be on the type yet
    const startingPlayerPosition = game.dealerPosition !== undefined 
      // @ts-ignore - dealerPosition might not be on the type yet
      ? (game.dealerPosition + 1) % 4 
      : 0;
      
    // Find the starting player
    const startingPlayer = game.players.find(p => p.position === startingPlayerPosition);
    if (!startingPlayer) {
      console.warn("⚠️ Cannot determine starting player for this trick");
      return;
    }
    
    // The first card (index 0) is always played by the starting player
    // Then each subsequent card is played by the next player in rotation
    const updatedCardPlayers: Record<number, string> = {};
    
    // For each card in the trick, determine who played it
    game.currentTrick.forEach((card, index) => {
      // Calculate which position played this card
      const playerPosition = (startingPlayerPosition + index) % 4;
      
      // Find the player at this position
      const player = game.players.find(p => p.position === playerPosition);
      
      if (player) {
        updatedCardPlayers[index] = player.id;
        console.log(`🃏 Card ${index} (${card.rank}${card.suit}) played by ${player.name} at position ${playerPosition}`);
      } else {
        console.warn(`⚠️ Could not find player at position ${playerPosition} for card ${index}`);
      }
    });
    
    // Only update the state if we have new information
    if (Object.keys(updatedCardPlayers).length > Object.keys(cardPlayers).length) {
      console.log("📊 Updating card players mapping:", updatedCardPlayers);
      setCardPlayers(updatedCardPlayers);
    }
    
    // For a complete trick, process the winner
    if (game.currentTrick.length === 4) {
      // Calculate the winning card index
      const winningCardIndex = determineWinningCard(game.currentTrick);
      if (winningCardIndex !== null && winningCardIndex !== undefined) {
        // Get the winner's ID from our mapping
        const winningPlayerId = updatedCardPlayers[winningCardIndex];
        
        // Find the winner in our players list
        const winningPlayer = game.players.find(p => p.id === winningPlayerId);
        
        if (winningPlayer) {
          console.log(`🏆 Winner determined: ${winningPlayer.name} with card ${winningCardIndex} (${game.currentTrick[winningCardIndex].rank}${game.currentTrick[winningCardIndex].suit})`);
          setWinningCardIndex(winningCardIndex);
          setWinningPlayerId(winningPlayerId);
          setShowWinningCardHighlight(true);
          
          // Save the completed trick mapping for future reference
          completedTrickCardPlayers.current = updatedCardPlayers;
        }
      }
    }
  }, [game.currentTrick, game.players]);

  // When playing a card, we now rely solely on server data for tracking
  const handlePlayCard = (card: Card) => {
    if (!socket || !currentPlayerId || !currentPlayer) return;

    // Validate if it's player's turn
    if (game.currentPlayer !== currentPlayerId) {
      console.error(`Cannot play card: Not your turn`);
      return;
    }

    // Check if card is playable
    const isLeadingTrick = game.currentTrick.length === 0;
    const playableCards = getPlayableCards(game, currentPlayer.hand, isLeadingTrick);
    if (!playableCards.some(c => c.suit === card.suit && c.rank === card.rank)) {
      console.error('This card is not playable in the current context');
      return;
    }

    console.log(`Playing card: ${card.rank}${card.suit} as player ${currentPlayer.name}`);
    
    // Update our local tracking immediately to know that current player played this card
    // This helps prevent the "Unknown" player issue when we play our own card
    const updatedMapping = { ...cardPlayers };
    updatedMapping[game.currentTrick.length] = currentPlayerId;
    setCardPlayers(updatedMapping);
    
    // Send the play to the server
    socket.emit("play_card", { 
      gameId: game.id, 
      userId: currentPlayerId, 
      card 
    });
  };

  // Inside the GameTable component, add these state variables
  const [delayedTrick, setDelayedTrick] = useState<Card[] | null>(null);
  const [delayedWinningIndex, setDelayedWinningIndex] = useState<number | null>(null);
  const [isShowingTrickResult, setIsShowingTrickResult] = useState(false);

  // Add this useEffect to handle trick completion
  useEffect(() => {
    if (!socket) return;
    
    console.log("Setting up trick completion delay handler");
    
    // Set up the trick completion delay handler
    const cleanup = setupTrickCompletionDelay(socket, game.id, ({ trickCards, winningIndex }) => {
      console.log("Trick completion callback fired:", trickCards, winningIndex);
      
      // Save the trick data
      setDelayedTrick(trickCards);
      setDelayedWinningIndex(winningIndex);
      setIsShowingTrickResult(true);
      
      // After delay, clear the trick
      setTimeout(() => {
        setIsShowingTrickResult(false);
        setDelayedTrick(null);
        setDelayedWinningIndex(null);
      }, 3000);
    });
    
    return cleanup;
  }, [socket, game.id]);

  // Add this function at the bottom of the component
  const getPlayerWhoPlayedCard = (cardIndex: number) => {
    // Get player ID from our tracking
    const playerId = cardPlayers[cardIndex];
    if (!playerId) return null;
    
    // Find the player object
    return game.players.find(p => p.id === playerId) || null;
  };
  
  // Fix the renderTrickCards function to show cards at correct positions
  const renderTrickCards = () => {
    // Determine if we're on mobile
    const isMobile = windowSize.isMobile;
    
    // Current trick rendering with winning card highlighting
    if (!game.currentTrick || game.currentTrick.length === 0) {
      return (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={`w-[${isMobile ? 150 : 200}px] h-[${isMobile ? 150 : 200}px] rounded-lg flex items-center justify-center text-gray-400`}>
            {game.completedTricks && game.completedTricks.length > 0 ? (
              <div className="text-center">
                <div className="text-lg font-bold mb-1">
                  Trick complete
                </div>
                <div className="text-xs">Waiting for next trick...</div>
              </div>
            ) : (
              <div className="text-sm">Waiting for first card...</div>
            )}
          </div>
        </div>
      );
    }

    // Card dimensions for the trick
    const trickCardWidth = isMobile ? 45 : 60;
    const trickCardHeight = isMobile ? 65 : 84;
    
    // Check if the trick is complete (all 4 cards played)
    const isTrickComplete = game.currentTrick.length === 4;
    
    // Only calculate winner information if trick is complete
    const winningIndex = isTrickComplete ? (showWinningCardHighlight ? winningCardIndex : null) : null;
    const winningPlayer = isTrickComplete && winningPlayerId 
      ? game.players.find(p => p.id === winningPlayerId)
      : null;

    // Define base positions for each card in the trick (NESW order)
    const basePositions = [
      { top: '50%', left: '50%', transform: 'translate(-50%, -150%)', label: 'North' }, // Top
      { top: '50%', left: '50%', transform: 'translate(50%, -50%)', label: 'East' },    // Right
      { top: '50%', left: '50%', transform: 'translate(-50%, 50%)', label: 'South' },   // Bottom
      { top: '50%', left: '50%', transform: 'translate(-150%, -50%)', label: 'West' },  // Left
    ];

    // Map each card to a player position
    // First, we need to know who played each card
    const cardPlayerMap: {cardIndex: number, playerPosition: number}[] = [];

    // For each card, determine which player played it
    game.currentTrick.forEach((card, index) => {
      // Get the player ID who played this card
      const playerId = cardPlayers[index] || '';
      
      // Find this player in the original (unrotated) game.players array to get their table position
      const player = game.players.find(p => p.id === playerId);
      if (player) {
        // @ts-ignore - position property might not be on the type yet
        const playerTablePosition = player.position !== undefined ? player.position : game.players.indexOf(player);
        
        // Calculate the rotated position of this player relative to the current player
        // This is the position we'll use to place their card
        const rotatedPosition = (4 + playerTablePosition - currentPlayerPosition) % 4;
        
        // Save this mapping
        cardPlayerMap.push({
          cardIndex: index,
          playerPosition: rotatedPosition
        });
        
        // Debug logging
        console.log(`Card ${index} (${card.rank}${card.suit}) played by ${player.name} at position ${playerTablePosition}, rotated to ${rotatedPosition}`);
      } else {
        // If we can't determine who played this card, use its index in currentTrick
        // (this is a fallback, should rarely happen)
        cardPlayerMap.push({
          cardIndex: index,
          playerPosition: index
        });
        
        // Debug logging for unidentified cards
        console.log(`Card ${index} (${card.rank}${card.suit}) player unknown, defaulting to position ${index}`);
      }
    });
    
    // Log the final mapping
    console.log('Card player map:', cardPlayerMap, 'Current player position:', currentPlayerPosition);

    return (
      <div className={`absolute inset-0 flex items-center justify-center`}>
        <div className={`w-[${isMobile ? 150 : 200}px] h-[${isMobile ? 150 : 200}px] rounded-lg relative`}>
          {game.currentTrick.map((card, index) => {
            // Determine if this is the winning card
            const isWinningCard = isTrickComplete && (index === winningIndex);
            
            // Find the rotated position for this card
            const cardPlacement = cardPlayerMap.find(cp => cp.cardIndex === index);
            const positionIndex = cardPlacement ? cardPlacement.playerPosition : index;
            
            // Get the position styling for this card based on its player's position
            const position = basePositions[positionIndex];
            
            return (
              <div 
                key={`${card.suit}-${card.rank}-${index}`}
                className={`absolute ${isWinningCard ? (isMobile ? 'ring-2' : 'ring-4') : ''} ring-yellow-500 rounded-md`}
                style={{
                  top: position.top,
                  left: position.left,
                  transform: position.transform,
                  zIndex: isWinningCard ? 10 : index,
                  transition: 'all 0.3s ease-in-out',
                }}
              >
                <img 
                  src={`/cards/${getCardImage(card)}`}
                  alt={`${card.rank} of ${card.suit}`}
                  className="rounded-md"
                  style={{ 
                    width: `${trickCardWidth}px`,
                    height: `${trickCardHeight}px` 
                  }}
                />
                
                {/* Winner indicator - only show if trick is complete */}
                {isWinningCard && isTrickComplete && winningPlayer && (
                  <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 bg-yellow-500 text-black text-center px-1 rounded-sm whitespace-nowrap" style={{ fontSize: isMobile ? '10px' : '12px' }}>
                    Winner: {winningPlayer.name}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
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

  // Keep the getScaleFactor function
  const getScaleFactor = () => {
    // Base scale on the screen width compared to a reference size
    const referenceWidth = 1200; // Reference width for desktop
    let scale = Math.min(1, windowSize.width / referenceWidth);
    
    // Minimum scale to ensure things aren't too small
    return Math.max(0.6, scale);
  };
  
  // Calculate scaleFactor once based on window size
  const scaleFactor = getScaleFactor();
  
  // Update isMobile based on windowSize
  useEffect(() => {
    setIsMobile(windowSize.isMobile);
  }, [windowSize.isMobile]);
  
  // Scale dimensions for card images
  const cardWidth = Math.floor(96 * scaleFactor);
  const cardHeight = Math.floor(144 * scaleFactor);
  const avatarSize = Math.floor(64 * scaleFactor);
  
  // Player positions mapping - responsive
  const playerPositions = useMemo(() => {
    return isMobile ? {
      bottom: "bottom-0 left-1/2 transform -translate-x-1/2",
      left: "left-0 top-1/3 transform -translate-y-1/2",
      top: "top-0 left-1/2 transform -translate-x-1/2",
      right: "right-0 top-1/3 transform -translate-y-1/2",
    } : {
      bottom: "bottom-3 left-1/2 transform -translate-x-1/2",
      left: "left-3 top-1/2 transform -translate-y-1/2",
      top: "top-3 left-1/2 transform -translate-x-1/2",
      right: "right-3 top-1/2 transform -translate-y-1/2",
    };
  }, [isMobile]);
  
  // Add back these missing functions
  const renderPlayerPosition = (position: number) => {
    const player = orderedPlayers[position];
    if (!player) {
      // Empty seat
      return null;
    }

    // Only mark a player as active if the game has started (not in WAITING status)
    const isActive = game.status !== "WAITING" && game.currentPlayer === player.id;
    const isWinningPlayer = player.id === winningPlayerId && showWinningCardHighlight;
    
    // Determine if we're on mobile
    // const isMobile = screenSize.width < 640;
    // Use the isMobile state which is derived from windowSize
    
    // Adjust positioning for responsive layout
    const getPositionClasses = (pos: number): string => {
      // Base positioning
      const basePositions = [
        'bottom-4 left-1/2 -translate-x-1/2',  // South (bottom)
        'left-4 top-1/2 -translate-y-1/2',     // West (left)
        'top-4 left-1/2 -translate-x-1/2',     // North (top)
        'right-4 top-1/2 -translate-y-1/2'     // East (right)
      ];
      
      // Apply responsive adjustments
      if (windowSize.width < 768) {
        // Tighter positioning for smaller screens
        const mobilePositions = [
          'bottom-2 left-1/2 -translate-x-1/2',  // South
          'left-2 top-1/2 -translate-y-1/2',     // West
          'top-2 left-1/2 -translate-x-1/2',     // North
          'right-2 top-1/2 -translate-y-1/2'     // East
        ];
        return mobilePositions[pos];
      }
      
      return basePositions[pos];
    };

    // Get player avatar
    const getPlayerAvatar = (player: any): string => {
      // If player has their own image property, use that first
      if (player.image) {
        return player.image;
      }
      
      // If player matches the current user and we have their image
      if (player.id === currentPlayerId && propUser?.image) {
        return propUser.image;
      }
      
      // Discord user ID (numeric string)
      if (player.id && /^\d+$/.test(player.id)) {
        // For Discord users without an avatar hash or with invalid avatar, use the default Discord avatar
        return `https://cdn.discordapp.com/embed/avatars/${parseInt(player.id) % 5}.png`;
      }
      
      // Guest user, use default avatar
      if (player.id && player.id.startsWith('guest_')) {
        return GUEST_AVATAR;
      }
      
      // Fallback to bot avatar
      return BOT_AVATAR;
    };

    // Determine if this is a left/right seat (position 1 or 3)
    const isSideSeat = position === 1 || position === 3;
    
    // Calculate sizes based on device
    const avatarWidth = isMobile ? 32 : 40;
    const avatarHeight = isMobile ? 32 : 40;
    
    // Determine made/bid status color
    const madeCount = player.tricks || 0;
    const bidCount = player.bid !== undefined ? player.bid : 0;
    const madeStatusColor = madeCount < bidCount ? "text-red-500" : "text-emerald-500";
    
    // Custom team colors
    const redTeamGradient = "bg-gradient-to-r from-red-700 to-red-500";
    const blueTeamGradient = "bg-gradient-to-r from-blue-700 to-blue-500";
    const teamGradient = player.team === 1 ? redTeamGradient : blueTeamGradient;
    const teamLightColor = player.team === 1 ? 'bg-red-400' : 'bg-blue-400';
    const teamAccentColor = player.team === 1 ? 'from-red-400' : 'from-blue-400';
    const teamTextColor = player.team === 1 ? 'text-red-600' : 'text-blue-600';

    return (
      <div className={`absolute ${getPositionClasses(position)} ${isActive ? 'z-10' : 'z-0'}`}>
        <div className={`
          backdrop-blur-sm bg-white/10 rounded-xl overflow-hidden
          ${isActive ? 'ring-2 ring-yellow-400 shadow-lg shadow-yellow-400/30' : 'shadow-md'}
          transition-all duration-200
        `}>
          {isSideSeat ? (
            // Left/right seats - vertical layout
            <div className="flex flex-col items-center p-1.5 gap-1.5">
              {/* Avatar with glowing active border */}
              <div className={`relative`}>
                <div className={`
                  rounded-full overflow-hidden p-0.5
                  ${isActive ? 'bg-gradient-to-r from-yellow-300 to-yellow-500 animate-pulse' : 
                    `bg-gradient-to-r ${teamAccentColor} to-white/80`}
                `}>
                  <div className="bg-gray-900 rounded-full p-0.5">
                    <Image
                      src={getPlayerAvatar(player)}
                      alt={player.name || "Player"}
                      width={avatarWidth}
                      height={avatarHeight}
                      className="rounded-full object-cover"
                    />
                  </div>
                  
                  {/* Dealer chip with premium styling */}
                  {player.isDealer && (
                    <div className="absolute -bottom-1 -right-1">
                      <div className="flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-r from-yellow-300 to-yellow-500 shadow-md">
                        <div className="w-4 h-4 rounded-full bg-yellow-600 flex items-center justify-center">
                          <span className="text-[8px] font-bold text-yellow-200">D</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex flex-col items-center gap-1">
                {/* Player name with team color gradient background */}
                <div className={`w-full px-2 py-1 rounded-lg shadow-sm ${teamGradient}`} style={{ width: isMobile ? '50px' : '70px' }}>
                  <div className="text-white font-medium truncate text-center"
                       style={{ fontSize: isMobile ? '9px' : '11px' }}>
                    {player.name}
                  </div>
                </div>
                
                {/* Bid/Trick counter with glass morphism effect */}
                <div className="backdrop-blur-md bg-white/20 rounded-full px-2 py-0.5 shadow-inner flex items-center justify-center gap-1"
                     style={{ width: isMobile ? '50px' : '70px' }}>
                  <span className={madeStatusColor} style={{ fontSize: isMobile ? '9px' : '11px', fontWeight: 600 }}>
                    {game.status === "WAITING" ? "0" : madeCount}
                  </span>
                  <span className="text-white/70" style={{ fontSize: isMobile ? '9px' : '11px' }}>/</span>
                  <span className="text-white font-semibold" style={{ fontSize: isMobile ? '9px' : '11px' }}>
                    {game.status === "WAITING" ? "0" : bidCount}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            // Top/bottom seats - horizontal layout
            <div className="flex items-center p-1.5 gap-1.5">
              {/* Avatar with glowing active border */}
              <div className={`relative`}>
                <div className={`
                  rounded-full overflow-hidden p-0.5
                  ${isActive ? 'bg-gradient-to-r from-yellow-300 to-yellow-500 animate-pulse' : 
                    `bg-gradient-to-r ${teamAccentColor} to-white/80`}
                `}>
                  <div className="bg-gray-900 rounded-full p-0.5">
                    <Image
                      src={getPlayerAvatar(player)}
                      alt={player.name || "Player"}
                      width={avatarWidth}
                      height={avatarHeight}
                      className="rounded-full object-cover"
                    />
                  </div>
                  
                  {/* Dealer chip with premium styling */}
                  {player.isDealer && (
                    <div className="absolute -bottom-1 -right-1">
                      <div className="flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-r from-yellow-300 to-yellow-500 shadow-md">
                        <div className="w-4 h-4 rounded-full bg-yellow-600 flex items-center justify-center">
                          <span className="text-[8px] font-bold text-yellow-200">D</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex flex-col gap-1 items-center">
                {/* Player name with team color gradient background */}
                <div className={`w-full px-2 py-1 rounded-lg shadow-sm ${teamGradient}`} style={{ width: isMobile ? '50px' : '70px' }}>
                  <div className="text-white font-medium truncate text-center"
                       style={{ fontSize: isMobile ? '9px' : '11px' }}>
                    {player.name}
                  </div>
                </div>
                
                {/* Bid/Trick counter with glass morphism effect */}
                <div className="backdrop-blur-md bg-white/20 rounded-full px-2 py-0.5 shadow-inner flex items-center justify-center gap-1"
                     style={{ width: isMobile ? '50px' : '70px' }}>
                  <span className={madeStatusColor} style={{ fontSize: isMobile ? '9px' : '11px', fontWeight: 600 }}>
                    {game.status === "WAITING" ? "0" : madeCount}
                  </span>
                  <span className="text-white/70" style={{ fontSize: isMobile ? '9px' : '11px' }}>/</span>
                  <span className="text-white font-semibold" style={{ fontSize: isMobile ? '9px' : '11px' }}>
                    {game.status === "WAITING" ? "0" : bidCount}
                  </span>
                </div>
              </div>
              
              {/* Winning animation with improved animation */}
              {isWinningPlayer && (
                <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2">
                  <div className={`
                    ${player.team === 1 ? 'text-red-400' : 'text-blue-400'} 
                    font-bold animate-bounce flex items-center gap-0.5
                  `} style={{ fontSize: isMobile ? '10px' : '12px' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" 
                         className="w-3 h-3 inline-block">
                      <path fillRule="evenodd" d="M12.577 4.878a.75.75 0 01.919-.53l4.78 1.281a.75.75 0 01.531.919l-1.281 4.78a.75.75 0 01-1.449-.387l.81-3.022a19.407 19.407 0 00-5.594 5.203.75.75 0 01-1.139.093L7 10.06l-4.72 4.72a.75.75 0 01-1.06-1.061l5.25-5.25a.75.75 0 011.06 0l3.074 3.073a20.923 20.923 0 015.545-4.931l-3.042-.815a.75.75 0 01-.53-.919z" clipRule="evenodd" />
                    </svg>
                    <span>+1</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderPlayerHand = () => {
    // If no current player, there's no hand to render
    if (!currentPlayer) return null;

    const sortedHand = currentPlayer.hand ? sortCards(currentPlayer.hand) :
      [];
      
    // Determine playable cards
    const isLeadingTrick = game.currentTrick.length === 0;
    const playableCards = game.status === "PLAYING" ? 
      getPlayableCards(game, currentPlayer.hand || [], isLeadingTrick) : 
      [];
      
    // Calculate card width based on screen size
    const isMobile = windowSize.isMobile;
    const cardUIWidth = Math.floor(isMobile ? 70 : 84 * scaleFactor);
    const cardUIHeight = Math.floor(isMobile ? 100 : 120 * scaleFactor);
    const overlapOffset = Math.floor(isMobile ? -40 : -32 * scaleFactor); // How much cards overlap

    return (
      <div className="absolute inset-x-0 bottom-0 flex justify-center">
        <div className="flex">
          {sortedHand.map((card: Card, index: number) => {
            const isPlayable = game.status === "PLAYING" && 
              game.currentPlayer === currentPlayerId &&
              playableCards.some((c: Card) => c.suit === card.suit && c.rank === card.rank);

            return (
              <div
                key={`${card.suit}${card.rank}`}
                className={`relative transition-transform hover:-translate-y-4 hover:z-10 ${
                  isPlayable ? 'cursor-pointer' : 'cursor-not-allowed'
                }`}
                style={{ 
                  width: `${cardUIWidth}px`, 
                  height: `${cardUIHeight}px`,
                  marginLeft: index > 0 ? `${overlapOffset}px` : '0',
                  zIndex: index
                }}
                onClick={() => isPlayable && handlePlayCard(card)}
              >
                <div className="relative">
                  <Image
                    src={`/cards/${getCardImage(card)}`}
                    alt={`${card.rank}${card.suit}`}
                    width={cardUIWidth}
                    height={cardUIHeight}
                    className={`rounded-lg shadow-md ${
                      isPlayable ? 'hover:shadow-lg' : ''
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
      </div>
    );
  };

  // Add the missing handleHandSummaryClose function
  const handleHandSummaryClose = () => {
    setShowHandSummary(false);
    
    if (socket && handScores) {
      // Calculate the new scores after this hand
      const newTeam1Score = game.team1Score + handScores.team1.score;
      const newTeam2Score = game.team2Score + handScores.team2.score;
      
      // Check if the game is over (500 points reached)
      const team1Won = newTeam1Score >= WINNING_SCORE;
      const team2Won = newTeam2Score >= WINNING_SCORE;
      
      // If both teams reach 500 in the same hand, play continues if tied
      const isTied = newTeam1Score === newTeam2Score;
      const gameIsOver = (team1Won || team2Won) && !isTied;
      
      if (gameIsOver) {
        // Determine if the current player is on the winning team
        const winningTeam = newTeam1Score > newTeam2Score ? 1 : 2;
        const currentPlayerTeam = currentPlayer?.team;
        
        if (currentPlayerTeam === winningTeam) {
          setShowWinner(true);
        } else {
          setShowLoser(true);
        }
        
        // Don't start a new hand, game is over
      } else {
        // Game continues, update scores and start new hand
      socket.emit("update_scores", {
        gameId: game.id,
        team1Score: handScores.team1.score,
        team2Score: handScores.team2.score,
        startNewHand: true
      });
      }
      
      setHandScores(null);
    }
  };

  const handleWinnerClose = () => {
    setShowWinner(false);
    setHandScores(null);
    // Emit event to end game and return to lobby
    socket?.emit("end_game", { gameId: game.id });
    onLeaveTable();
  };
  
  const handleLoserClose = () => {
    setShowLoser(false);
    setHandScores(null);
    // Emit event to end game and return to lobby
    socket?.emit("end_game", { gameId: game.id });
    onLeaveTable();
  };

  // Auto-hide modals after timeout
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    if (showHandSummary) {
      timeoutId = setTimeout(handleHandSummaryClose, MODAL_DISPLAY_TIME);
    }
    
    return () => clearTimeout(timeoutId);
  }, [showHandSummary]);
  
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    if (showWinner) {
      timeoutId = setTimeout(handleWinnerClose, MODAL_DISPLAY_TIME);
    }
    
    return () => clearTimeout(timeoutId);
  }, [showWinner]);
  
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    if (showLoser) {
      timeoutId = setTimeout(handleLoserClose, MODAL_DISPLAY_TIME);
    }
    
    return () => clearTimeout(timeoutId);
  }, [showLoser]);

  // Add state to track the server-determined winner
  const [serverWinningCard, setServerWinningCard] = useState<{rank: number | string, suit: Suit} | null>(null);
  const [serverWinningPlayerId, setServerWinningPlayerId] = useState<string | null>(null);

  // Use effect to handle the server trick winner determination
  useEffect(() => {
    let cleanupListener: (() => void) | undefined;
    
    if (socket) {
      // Set up the trick winner handler with a callback
      cleanupListener = debugTrickWinner(socket, game.id, (data) => {
        console.log('✅ CLIENT RECEIVED WINNER:', data);
        if (data.winningCard && data.winningPlayerId) {
          // Convert to the correct Card type
          setServerWinningCard({
            rank: data.winningCard.rank,
            suit: data.winningCard.suit as Suit
          });
          setServerWinningPlayerId(data.winningPlayerId);
          
          // Clear the winner after 3 seconds (when the next trick starts)
          setTimeout(() => {
            setServerWinningCard(null);
            setServerWinningPlayerId(null);
          }, 3000);
        }
      });
    }
    
    // Clean up the listener when component unmounts
    return () => {
      if (cleanupListener) cleanupListener();
    };
  }, [socket, game.id]);

  // Add a useEffect to listen for hand completion and display the hand summary
  useEffect(() => {
    if (!socket) return;

    // Listen for hand completion event
    const handleHandCompleted = () => {
      console.log('Hand completed - calculating scores for display');
      
      // Calculate scores using the scoring algorithm
      const calculatedScores = calculateHandScore(game.players);
      
      console.log('Hand scores calculated:', calculatedScores);
      
      // Set the hand scores and show the modal
      setHandScores(calculatedScores);
      setShowHandSummary(true);
    };
    
    // Register event listener for hand completion
    socket.on('hand_completed', handleHandCompleted);
    
    // Handle scoring state change directly in case the server doesn't emit the event
    if (game.status === "PLAYING" && game.players.every(p => p.hand.length === 0) && !showHandSummary) {
      handleHandCompleted();
    }
    
    return () => {
      socket.off('hand_completed', handleHandCompleted);
    };
  }, [socket, game.id, game.status, game.players, showHandSummary]);

  // Initialize the global variable
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.lastCompletedTrick = null;
    }
  }, []);

  // Utility function to get player for a card if the mapping is missing that card
  const getPlayerForCardIndex = (index: number, existingMapping: Record<number, string>) => {
    // First, try to get from the existing mapping
    const playerId = existingMapping[index];
    if (playerId) {
      const player = game.players.find(p => p.id === playerId);
      if (player) return player;
    }
    
    // If we don't have a mapping for this card, we need to deduce who played it
    // We can do this by working backward from the current player (next to play)
    const currentPlayerInfo = game.players.find(p => p.id === game.currentPlayer);
    if (!currentPlayerInfo || currentPlayerInfo.position === undefined) return null;
    
    // For a complete trick, we know the player who is due to play next
    // won the trick with their card
    if (game.currentTrick.length === 4) {
      // Find how many positions back we need to go from current player
      const stepsBack = game.currentTrick.length - index;
      const position = (currentPlayerInfo.position - stepsBack + 4) % 4;
      return game.players.find(p => p.position === position) || null;
    }
    
    // For an in-progress trick, the player who played this card is
    // the player who is (trick.length - index) positions before the current player
    const stepsBack = game.currentTrick.length - index;
    const position = (currentPlayerInfo.position - stepsBack + 4) % 4;
    return game.players.find(p => p.position === position) || null;
  };

  // Return the JSX for the component
  return (
    <>
      <LandscapePrompt />
      <div className="fixed inset-0 overflow-hidden bg-gray-900">
        {/* Main content area - full height */}
        <div className="flex h-full overflow-hidden">
          {/* Game table area - add padding on top and bottom */}
          <div className="w-[70%] p-2 flex flex-col h-full overflow-hidden">
            {/* Game table with more space top and bottom */}
            <div className="relative flex-1 mb-2 overflow-hidden" style={{ 
              background: 'radial-gradient(circle at center, #316785 0%, #1a3346 100%)',
              borderRadius: `${Math.floor(64 * scaleFactor)}px`,
              border: `${Math.floor(2 * scaleFactor)}px solid #855f31`
            }}>
              {/* Leave Table button - inside table in top left corner */}
              <button
                onClick={handleLeaveTable}
                className="absolute top-4 left-4 z-10 p-2 bg-gray-800/90 text-white rounded-full hover:bg-gray-700 transition shadow-lg"
                style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
              
              {/* Scoreboard in top right corner - inside the table */}
              <div className="absolute top-4 right-4 z-10 flex flex-col items-center px-2 py-1 bg-gray-800/90 rounded-lg shadow-lg">
                {/* Team 1 (Red) Score and Bags */}
                <div className="flex items-center mb-1">
                  <div className="bg-red-500 rounded-full w-2 h-2 mr-1"></div>
                  <span className="text-white font-bold mr-1 text-sm">{game.team1Score}</span>
                  {/* Team 1 Bags */}
                  <div className="flex items-center text-yellow-300" title={`Team 1 Bags: ${game.team1Bags || 0}`}>
                    <Image src="/bag.svg" width={12} height={12} alt="Bags" className="mr-1" />
                    <span className="text-xs">{game.team1Bags || 0}</span>
                  </div>
                </div>
                
                {/* Team 2 (Blue) Score and Bags */}
                <div className="flex items-center">
                  <div className="bg-blue-500 rounded-full w-2 h-2 mr-1"></div>
                  <span className="text-white font-bold mr-1 text-sm">{game.team2Score}</span>
                  {/* Team 2 Bags */}
                  <div className="flex items-center text-yellow-300" title={`Team 2 Bags: ${game.team2Bags || 0}`}>
                    <Image src="/bag.svg" width={12} height={12} alt="Bags" className="mr-1" />
                    <span className="text-xs">{game.team2Bags || 0}</span>
                  </div>
                </div>
              </div>
        
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
                    className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded-lg shadow-lg transform hover:scale-105 transition-all"
                    style={{ fontSize: `${Math.floor(16 * scaleFactor)}px` }}
                  >
                    Start Game
                  </button>
                ) : game.status === "WAITING" && game.players.length < 4 ? (
                  <div className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-center"
                       style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}>
                    <div className="font-bold">Waiting for Players</div>
                    <div className="text-sm mt-1">{game.players.length}/4 joined</div>
                  </div>
                ) : game.status === "WAITING" && game.players[0]?.id !== currentPlayerId ? (
                  <div className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-center"
                       style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}>
                    <div className="font-bold">Waiting for Host</div>
                    <div className="text-sm mt-1">Only {game.players[0]?.name} can start</div>
                  </div>
                ) : game.status === "BIDDING" && game.currentPlayer !== currentPlayerId ? (
                  <div className="px-4 py-2 bg-gray-700 text-white rounded-lg text-center animate-pulse"
                       style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}>
                    <div className="font-bold">Waiting for {game.players.find(p => p.id === game.currentPlayer)?.name} to bid</div>
                  </div>
                ) : game.status === "PLAYING" && game.currentTrick && game.currentTrick.length > 0 ? (
                  renderTrickCards()
                ) : game.status === "PLAYING" && game.currentTrick?.length === 0 ? (
                  <div className="px-4 py-2 bg-gray-700/70 text-white rounded-lg text-center"
                       style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}>
                    <div className="text-sm">
                      Waiting for {game.players.find(p => p.id === game.currentPlayer)?.name} to play
                    </div>
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

            {/* Cards area with more space */}
            <div className="bg-gray-800/50 rounded-lg relative mb-0" 
                 style={{ 
                   height: `${Math.floor(110 * scaleFactor)}px`
                 }}>
              {renderPlayerHand()}
            </div>
          </div>

          {/* Chat area - 30%, full height */}
          <div className="w-[30%] h-full overflow-hidden">
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
        
        {/* Loser Modal */}
        {showLoser && handScores && (
          <LoserModal
            isOpen={showLoser}
            onClose={handleLoserClose}
            team1Score={game.team1Score + handScores.team1.score}
            team2Score={game.team2Score + handScores.team2.score}
            winningTeam={game.team1Score + handScores.team1.score > game.team2Score + handScores.team2.score ? 1 : 2}
          />
        )}
      </div>
    </>
  );
}