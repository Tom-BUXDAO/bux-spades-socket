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
    <div className="w-[60%] h-[60%] bg-gray-800/95 backdrop-blur-sm rounded-xl p-4 shadow-xl flex flex-col">
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold text-white mb-2">Make Your Bid</h2>
        {currentBid !== undefined && (
          <p className="text-gray-300 text-sm">Current bid: {currentBid}</p>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-2">
        {/* Row 1: Buttons 1-6 */}
        <div className="flex gap-2 justify-center">
          {[1, 2, 3, 4, 5, 6].map((bid) => (
            <button
              key={bid}
              onClick={() => handleBidClick(bid)}
              className={`
                rounded-lg p-2 text-lg font-bold transition-all transform hover:scale-105 w-full
                sm:text-base sm:p-1.5
                ${selectedBid === bid 
                  ? 'bg-yellow-500 text-black ring-2 ring-yellow-300 shadow-lg' 
                  : 'bg-gray-700 text-white hover:bg-gray-600'}
              `}
            >
              {bid}
            </button>
          ))}
        </div>

        {/* Row 2: Buttons 7-13 */}
        <div className="flex gap-2 justify-center">
          {[7, 8, 9, 10, 11, 12, 13].map((bid) => (
            <button
              key={bid}
              onClick={() => handleBidClick(bid)}
              className={`
                rounded-lg p-2 text-lg font-bold transition-all transform hover:scale-105 w-full
                sm:text-base sm:p-1.5
                ${selectedBid === bid 
                  ? 'bg-yellow-500 text-black ring-2 ring-yellow-300 shadow-lg' 
                  : 'bg-gray-700 text-white hover:bg-gray-600'}
              `}
            >
              {bid}
            </button>
          ))}
        </div>

        {/* Row 3: Nil and Confirm */}
        <div className="flex gap-2 justify-center mt-2">
          <button
            onClick={() => handleBidClick(0)}
            className={`
              rounded-lg p-2 text-lg font-bold transition-all transform hover:scale-105 w-1/3
              sm:text-base sm:p-1.5
              ${selectedBid === 0 
                ? 'bg-yellow-500 text-black ring-2 ring-yellow-300 shadow-lg' 
                : 'bg-gray-700 text-white hover:bg-gray-600'}
            `}
          >
            Nil
          </button>
          <button
            onClick={handleSubmit}
            disabled={selectedBid === null || isSubmitting}
            className={`
              rounded-lg p-2 text-lg font-bold transition-all w-2/3
              sm:text-base sm:p-1.5
              ${selectedBid !== null && !isSubmitting
                ? 'bg-green-500 hover:bg-green-600 text-white transform hover:scale-105'
                : 'bg-gray-600 text-gray-400 cursor-not-allowed'}
            `}
          >
            {isSubmitting ? 'Submitting...' : 'Confirm Bid'}
          </button>
        </div>
      </div>
    </div>
  );
} 