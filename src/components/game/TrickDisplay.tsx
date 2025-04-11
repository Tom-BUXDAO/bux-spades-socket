import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { Card, Player } from '@/types/game';

interface TrickDisplayProps {
  trick: Card[];
  players: Player[];
  currentPlayerId: string;
  onTrickComplete?: () => void;
}

/**
 * A component that displays a trick with cards in fixed positions.
 * Once cards are placed, their positions NEVER change.
 */
export const TrickDisplay: React.FC<TrickDisplayProps> = ({ 
  trick, 
  players, 
  currentPlayerId,
  onTrickComplete
}) => {
  // Initial state to track which player played which card
  const [cardPlayers, setCardPlayers] = useState<Record<number, string>>({});
  
  // State to track if trick is complete
  const [isComplete, setIsComplete] = useState(false);
  const [winningCardIndex, setWinningCardIndex] = useState<number | null>(null);
  
  // Find my player
  const currentPlayer = players.find(p => p.id === currentPlayerId);
  
  // Store initial positions when cards are first rendered
  useEffect(() => {
    // Only process if we have cards and haven't already stored the positions
    if (trick.length > 0 && Object.keys(cardPlayers).length < trick.length) {
      console.log("TrickDisplay: Processing new cards");
      
      // Get all playerIds in position order
      const orderedPlayerIds: Record<number, string> = {};
      players.forEach(player => {
        if (player.position !== undefined) {
          orderedPlayerIds[player.position] = player.id;
        }
      });
      
      // Find the leading player
      const leadingPlayer = players.find(p => p.isLeadingPlayer);
      if (!leadingPlayer || leadingPlayer.position === undefined) return;
      
      // Create a new card player mapping
      const newCardPlayers: Record<number, string> = {};
      
      // Process each card
      for (let i = 0; i < trick.length; i++) {
        // Calculate who played this card based on position
        let playerPosition = (leadingPlayer.position - trick.length + i) % 4;
        if (playerPosition < 0) playerPosition += 4;
        
        const playerId = orderedPlayerIds[playerPosition];
        if (playerId) {
          newCardPlayers[i] = playerId;
          
          // Log for debugging
          const player = players.find(p => p.id === playerId);
          console.log(`TrickDisplay: Card ${i} (${trick[i].rank}${trick[i].suit}) played by ${player?.name || 'Unknown'}`);
        }
      }
      
      // Update our state with the new mappings
      setCardPlayers(prev => {
        // Keep existing mappings and only add new ones
        return { ...prev, ...newCardPlayers };
      });
      
      // Check if trick is complete
      if (trick.length === 4 && !isComplete) {
        setIsComplete(true);
        
        // Determine winning card
        const winningIdx = determineWinningCard(trick);
        setWinningCardIndex(winningIdx);
        
        // Call the completion callback
        if (onTrickComplete) {
          onTrickComplete();
        }
      }
    }
  }, [trick, players, isComplete, cardPlayers, currentPlayerId, onTrickComplete]);
  
  // Function to determine winning card
  const determineWinningCard = (cards: Card[]): number => {
    if (cards.length === 0) return -1;
    
    // Get the lead suit
    const leadSuit = cards[0].suit;
    
    // Filter cards of the lead suit and spades
    const trumpCards = cards.filter(card => card.suit === 'S');
    const leadSuitCards = cards.filter(card => card.suit === leadSuit);
    
    // If there are any spades, the highest spade wins
    if (trumpCards.length > 0) {
      // Find highest spade
      let highestSpadeIdx = -1;
      let highestSpadeRank = -1;
      
      for (let i = 0; i < cards.length; i++) {
        if (cards[i].suit === 'S') {
          const rank = getNumericRank(cards[i].rank);
          if (rank > highestSpadeRank) {
            highestSpadeRank = rank;
            highestSpadeIdx = i;
          }
        }
      }
      
      return highestSpadeIdx;
    }
    
    // Otherwise, highest card of lead suit wins
    let highestIdx = -1;
    let highestRank = -1;
    
    for (let i = 0; i < cards.length; i++) {
      if (cards[i].suit === leadSuit) {
        const rank = getNumericRank(cards[i].rank);
        if (rank > highestRank) {
          highestRank = rank;
          highestIdx = i;
        }
      }
    }
    
    return highestIdx;
  };
  
  // Helper to convert card rank to numeric value
  const getNumericRank = (rank: string | number): number => {
    if (typeof rank === 'number') return rank;
    
    switch (rank) {
      case 'J': return 11;
      case 'Q': return 12;
      case 'K': return 13;
      case 'A': return 14;
      default: return parseInt(rank, 10);
    }
  };
  
  // Get the card image path
  const getCardImage = (card: Card): string => {
    return `${card.rank}${card.suit.toLowerCase()}.png`;
  };
  
  // Fixed positions for the four visual positions
  const positionClasses = [
    "absolute bottom-0 left-1/2 -translate-x-1/2",  // Position 0 (bottom)
    "absolute left-0 top-1/2 -translate-y-1/2",     // Position 1 (left)  
    "absolute top-0 left-1/2 -translate-x-1/2",     // Position 2 (top)
    "absolute right-0 top-1/2 -translate-y-1/2"     // Position 3 (right)
  ];
  
  // If no trick, don't render anything
  if (trick.length === 0) {
    return null;
  }
  
  // Set a scale factor for the card size
  const scaleFactor = 1.0;
  const trickCardWidth = Math.floor(60 * scaleFactor); 
  const trickCardHeight = Math.floor(84 * scaleFactor);
  
  // Get my position
  const myPosition = currentPlayer?.position ?? 0;
  
  return (
    <div className="relative" style={{ 
      width: `${Math.floor(200 * scaleFactor)}px`, 
      height: `${Math.floor(200 * scaleFactor)}px` 
    }}>
      {trick.map((card, index) => {
        // Skip if we don't know who played this card
        if (!cardPlayers[index]) return null;
        
        // Get the player who played this card
        const playerId = cardPlayers[index];
        const player = players.find(p => p.id === playerId);
        
        if (!player) return null;
        
        // Calculate the fixed table position for this card
        const playerPosition = player.position ?? 0;
        // The relative position from current player's view
        const tablePosition = (4 + playerPosition - myPosition) % 4;
        
        // Determine if this is the winning card
        const isWinningCard = isComplete && index === winningCardIndex;
        
        return (
          <div 
            key={`trick-card-${index}`} 
            className={positionClasses[tablePosition]}
            data-testid={`trick-card-${index}`}
          >
            <div className={`relative transition-all duration-300 ${isWinningCard ? 'z-10 scale-110' : ''}`}>
              <Image
                src={`/cards/${getCardImage(card)}`}
                alt={`${card.rank}${card.suit}`}
                width={trickCardWidth}
                height={trickCardHeight}
                className={`rounded-lg shadow-md ${isWinningCard ? 'ring-2 ring-yellow-400' : ''}`}
              />
              {isWinningCard && (
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-yellow-400 text-black px-2 py-1 text-xs rounded-full">
                  Winner
                </div>
              )}
            </div>
            <div className="text-xs text-white mt-1 text-center">
              {player.name}
            </div>
          </div>
        );
      })}
      
      {/* Leading suit indicator */}
      {trick[0] && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white px-2 py-1 rounded text-xs">
          Lead: {trick[0].suit}
        </div>
      )}
    </div>
  );
};

export default TrickDisplay; 