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
    // console.log(`BiddingInterface: Hiding - currentlyMyTurn: ${currentlyMyTurn}, submitting: ${isSubmitting}`);
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
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 p-4">
      {/* Adjusted modal width and padding */}
      <div className="w-[380px] md:w-[360px] sm:w-[320px] max-sm:w-[280px] bg-gray-800/95 rounded-2xl p-4 max-sm:p-3 shadow-xl">
        {/* Adjusted text size and margin */}
        <div className="text-center mb-3 max-sm:mb-2">
          <h2 className="text-lg max-sm:text-base font-bold text-white">Make Your Bid</h2>
          {currentBid !== undefined && (
            <p className="text-sm max-sm:text-xs text-gray-300">Current bid: {currentBid}</p>
          )}
        </div>

        {/* Adjusted spacing */}
        <div className="space-y-2 max-sm:space-y-1.5">
          {/* Row 1: 1-4 - Added gap */}
          <div className="flex justify-center gap-3 max-sm:gap-2">
            {[1, 2, 3, 4].map((bid) => (
              <button
                key={bid}
                onClick={() => handleBidClick(bid)}
                // Standardized button size and text size
                className={`
                  w-16 h-16 md:w-14 md:h-14 sm:w-12 sm:h-12 max-sm:w-11 max-sm:h-11
                  rounded-full text-xl md:text-lg sm:text-base max-sm:text-sm font-bold transition-all
                  flex items-center justify-center flex-shrink-0
                  ${selectedBid === bid 
                    ? 'bg-yellow-500 text-black ring-2 max-sm:ring-1 ring-yellow-300 shadow-lg' 
                    : 'bg-gray-700 text-white hover:bg-gray-600'}`
                }
              >
                {bid}
              </button>
            ))}
          </div>

          {/* Row 2: 5-9 - Added gap, removed padding */}
          <div className="flex justify-center gap-3 max-sm:gap-2">
            {[5, 6, 7, 8, 9].map((bid) => (
              <button
                key={bid}
                onClick={() => handleBidClick(bid)}
                // Standardized button size and text size
                 className={`
                  w-16 h-16 md:w-14 md:h-14 sm:w-12 sm:h-12 max-sm:w-11 max-sm:h-11
                  rounded-full text-xl md:text-lg sm:text-base max-sm:text-sm font-bold transition-all
                  flex items-center justify-center flex-shrink-0
                  ${selectedBid === bid 
                    ? 'bg-yellow-500 text-black ring-2 max-sm:ring-1 ring-yellow-300 shadow-lg' 
                    : 'bg-gray-700 text-white hover:bg-gray-600'}`
                }
              >
                {bid}
              </button>
            ))}
          </div>

          {/* Row 3: 10-13 - Added gap */}
          <div className="flex justify-center gap-3 max-sm:gap-2">
            {[10, 11, 12, 13].map((bid) => (
              <button
                key={bid}
                onClick={() => handleBidClick(bid)}
                // Standardized button size and text size
                className={`
                  w-16 h-16 md:w-14 md:h-14 sm:w-12 sm:h-12 max-sm:w-11 max-sm:h-11
                  rounded-full text-xl md:text-lg sm:text-base max-sm:text-sm font-bold transition-all
                  flex items-center justify-center flex-shrink-0
                  ${selectedBid === bid 
                    ? 'bg-yellow-500 text-black ring-2 max-sm:ring-1 ring-yellow-300 shadow-lg' 
                    : 'bg-gray-700 text-white hover:bg-gray-600'}`
                }
              >
                {bid}
              </button>
            ))}
          </div>

          {/* Bottom row for special actions - Adjusted height, gap, margin, text size */}
          <div className="flex justify-between gap-2 max-sm:gap-1.5 mt-3 max-sm:mt-2">
            <button
              onClick={() => handleBidClick(0)}
              className={`
                h-10 max-sm:h-9 flex-1
                rounded-lg max-sm:rounded-md text-base max-sm:text-xs font-bold transition-all
                flex items-center justify-center
                ${selectedBid === 0 
                  ? 'bg-blue-500 text-white ring-2 max-sm:ring-1 ring-blue-300 shadow-lg' // Changed Nil color
                  : 'bg-gray-700 text-white hover:bg-gray-600'}`
                }
            >
              Nil
            </button>
            {/* <button // Blind Nil currently disabled
              disabled={true}
              className="h-10 max-sm:h-9 flex-1
                rounded-lg max-sm:rounded-md text-base max-sm:text-xs font-bold bg-gray-600 text-gray-400 cursor-not-allowed
                flex items-center justify-center"
            >
              Blind Nil
            </button> */}
            <button
              onClick={handleSubmit}
              disabled={selectedBid === null || isSubmitting}
              className={`
                h-10 max-sm:h-9 flex-1
                rounded-lg max-sm:rounded-md text-base max-sm:text-xs font-bold transition-all
                flex items-center justify-center
                ${selectedBid !== null && !isSubmitting
                  ? 'bg-green-500 hover:bg-green-600 text-white'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`
                }
            >
              {isSubmitting ? 'Submitting...' : 'Submit Bid'} 
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 