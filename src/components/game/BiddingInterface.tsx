import { useState, useEffect } from "react";

interface BiddingProps {
  onBid: (bid: number) => void;
  currentBid?: number;
  gameId: string;
  playerId: string;
  currentPlayerTurn: string;
}

export default function BiddingInterface({ onBid, currentBid, gameId, playerId, currentPlayerTurn }: BiddingProps) {
  const [selectedBid, setSelectedBid] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isMyTurn = playerId === currentPlayerTurn;

  // Add debugging for turn changes
  useEffect(() => {
    console.log(`BiddingInterface: Turn check - My ID: ${playerId}, Current Turn: ${currentPlayerTurn}, Is My Turn: ${isMyTurn}`);
    if (isMyTurn) {
      console.log(`BiddingInterface: It's my turn to bid`);
      setIsSubmitting(false);
    } else {
      console.log(`BiddingInterface: Not my turn to bid, hiding interface`);
    }
  }, [isMyTurn, playerId, currentPlayerTurn]);

  // Listen for global game state change events to force UI refresh
  useEffect(() => {
    const handleGameStateChange = () => {
      console.log(`BiddingInterface: Game state changed event detected`);
      // Force check if it's still my turn
      const stillMyTurn = playerId === currentPlayerTurn;
      if (!stillMyTurn && isMyTurn) {
        console.log(`BiddingInterface: Turn changed, forcing hide`);
        // Force a re-render by updating state
        setIsSubmitting(true);
      }
    };
    
    // Add global event listener
    if (typeof window !== 'undefined') {
      window.addEventListener('gameStateChanged', handleGameStateChange);
    }
    
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('gameStateChanged', handleGameStateChange);
      }
    };
  }, [playerId, currentPlayerTurn, isMyTurn]);

  // Force check each render in case the effect isn't triggered
  const currentlyMyTurn = playerId === currentPlayerTurn;
  
  // Extra safeguard - hide if not my turn or if we're submitting
  if (!currentlyMyTurn || isSubmitting) {
    console.log(`BiddingInterface: Hiding - currentlyMyTurn: ${currentlyMyTurn}, submitting: ${isSubmitting}`);
    return null;
  }

  const handleBidClick = (bid: number) => {
    setSelectedBid(bid);
  };

  const handleSubmit = () => {
    if (selectedBid === null) return;
    setIsSubmitting(true);
    onBid(selectedBid);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-[90vw] max-w-[400px] bg-gray-800/95 rounded-2xl p-6 shadow-2xl">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">Make Your Bid</h2>
          {currentBid !== undefined && (
            <p className="text-gray-300">Current bid: {currentBid}</p>
          )}
        </div>

        <div className="grid grid-cols-4 gap-3 sm:gap-4">
          {/* Row 1: Buttons 1-4 */}
          {[1, 2, 3, 4].map((bid) => (
            <button
              key={bid}
              onClick={() => handleBidClick(bid)}
              className={`
                aspect-square rounded-full text-xl font-bold transition-all
                flex items-center justify-center
                ${selectedBid === bid 
                  ? 'bg-yellow-500 text-black ring-2 ring-yellow-300 shadow-lg scale-105' 
                  : 'bg-gray-700 text-white hover:bg-gray-600 hover:scale-105'}
              `}
            >
              {bid}
            </button>
          ))}

          {/* Row 2: Buttons 5-9 */}
          {[5, 6, 7, 8, 9].map((bid) => (
            <button
              key={bid}
              onClick={() => handleBidClick(bid)}
              className={`
                aspect-square rounded-full text-xl font-bold transition-all
                flex items-center justify-center
                ${selectedBid === bid 
                  ? 'bg-yellow-500 text-black ring-2 ring-yellow-300 shadow-lg scale-105' 
                  : 'bg-gray-700 text-white hover:bg-gray-600 hover:scale-105'}
              `}
            >
              {bid}
            </button>
          ))}

          {/* Row 3: Buttons 10-13 */}
          {[10, 11, 12, 13].map((bid) => (
            <button
              key={bid}
              onClick={() => handleBidClick(bid)}
              className={`
                aspect-square rounded-full text-xl font-bold transition-all
                flex items-center justify-center
                ${selectedBid === bid 
                  ? 'bg-yellow-500 text-black ring-2 ring-yellow-300 shadow-lg scale-105' 
                  : 'bg-gray-700 text-white hover:bg-gray-600 hover:scale-105'}
              `}
            >
              {bid}
            </button>
          ))}
        </div>

        {/* Special bids */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 mt-4">
          <button
            onClick={() => handleBidClick(0)}
            className={`
              py-3 rounded-xl text-lg font-bold transition-all
              ${selectedBid === 0 
                ? 'bg-yellow-500 text-black ring-2 ring-yellow-300 shadow-lg' 
                : 'bg-gray-700 text-white hover:bg-gray-600'}
            `}
          >
            Nil
          </button>
          <button
            disabled={true}
            className="py-3 rounded-xl text-lg font-bold bg-gray-600 text-gray-400 cursor-not-allowed"
          >
            Blind Nil
          </button>
        </div>

        {/* Confirm button */}
        <button
          onClick={handleSubmit}
          disabled={selectedBid === null || isSubmitting}
          className={`
            w-full py-4 rounded-xl text-xl font-bold transition-all mt-4
            ${selectedBid !== null && !isSubmitting
              ? 'bg-green-500 hover:bg-green-600 text-white'
              : 'bg-gray-600 text-gray-400 cursor-not-allowed'}
          `}
        >
          {isSubmitting ? 'Submitting...' : 'Confirm Bid'}
        </button>
      </div>
    </div>
  );
} 