import { useState, useEffect } from "react";

interface BiddingProps {
  onBid: (bid: number) => void;
  currentBid?: number;
  gameId: string;
  playerId: string;
  currentPlayerTurn: string;
}

// Assign a unique class name for direct targeting
const modalContainerClass = "bidding-modal-container";
const modalContentClass = "bidding-modal-content";
const numberButtonClass = "bidding-number-button";
const bottomButtonClass = "bidding-bottom-button";

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
    // Wrap in fragment
    <>
      {/* Apply unique class - Changed positioning to absolute center within parent */}
      {/* Removed inset-0, flex, items-center, justify-center, p-4 */}
      <div className={`${modalContainerClass} absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50`}>
        {/* Apply unique class - Content styles remain */}
        <div className={`${modalContentClass} w-[380px] md:w-[360px] sm:w-[320px] max-sm:w-[280px] bg-gray-800/95 rounded-2xl p-4 max-sm:p-3 shadow-xl`}>
          <div className="text-center mb-3 max-sm:mb-2">
            <h2 className="text-lg max-sm:text-base font-bold text-white">Make Your Bid</h2>
            {currentBid !== undefined && (
              <p className="text-sm max-sm:text-xs text-gray-300">Current bid: {currentBid}</p>
            )}
          </div>

          <div className="space-y-2 max-sm:space-y-1.5">
            {/* Row 1: 1-4 */}
            <div className="flex justify-center gap-3 max-sm:gap-2">
              {[1, 2, 3, 4].map((bid) => (
                <button
                  key={bid}
                  onClick={() => handleBidClick(bid)}
                  // Add unique class
                  className={`${numberButtonClass} w-16 h-16 md:w-14 md:h-14 sm:w-12 sm:h-12 max-sm:w-11 max-sm:h-11 rounded-full text-xl md:text-lg sm:text-base max-sm:text-sm font-bold transition-all flex items-center justify-center flex-shrink-0 ${selectedBid === bid ? 'bg-yellow-500 text-black ring-2 max-sm:ring-1 ring-yellow-300 shadow-lg' : 'bg-gray-700 text-white hover:bg-gray-600'}`}>
                  {bid}
                </button>
              ))}
            </div>

            {/* Row 2: 5-9 - Note: Spacing still needs fixing later if this works */}
            <div className="flex justify-center gap-3 max-sm:gap-2">
              {[5, 6, 7, 8, 9].map((bid) => (
                <button
                  key={bid}
                  onClick={() => handleBidClick(bid)}
                  // Add unique class
                  className={`${numberButtonClass} w-16 h-16 md:w-14 md:h-14 sm:w-12 sm:h-12 max-sm:w-11 max-sm:h-11 rounded-full text-xl md:text-lg sm:text-base max-sm:text-sm font-bold transition-all flex items-center justify-center flex-shrink-0 ${selectedBid === bid ? 'bg-yellow-500 text-black ring-2 max-sm:ring-1 ring-yellow-300 shadow-lg' : 'bg-gray-700 text-white hover:bg-gray-600'}`}>
                  {bid}
                </button>
              ))}
            </div>

            {/* Row 3: 10-13 */}
            <div className="flex justify-center gap-3 max-sm:gap-2">
              {[10, 11, 12, 13].map((bid) => (
                <button
                  key={bid}
                  onClick={() => handleBidClick(bid)}
                  // Add unique class
                  className={`${numberButtonClass} w-16 h-16 md:w-14 md:h-14 sm:w-12 sm:h-12 max-sm:w-11 max-sm:h-11 rounded-full text-xl md:text-lg sm:text-base max-sm:text-sm font-bold transition-all flex items-center justify-center flex-shrink-0 ${selectedBid === bid ? 'bg-yellow-500 text-black ring-2 max-sm:ring-1 ring-yellow-300 shadow-lg' : 'bg-gray-700 text-white hover:bg-gray-600'}`}>
                  {bid}
                </button>
              ))}
            </div>

            {/* Bottom row */}
            <div className="flex justify-between gap-3 max-sm:gap-1.5 mt-3 max-sm:mt-2">
              {/* Nil Button */}
              <button
                onClick={() => handleBidClick(0)}
                // Add unique class
                className={`${bottomButtonClass} h-10 max-sm:h-9 flex-1 rounded-lg max-sm:rounded-md text-base max-sm:text-xs font-bold transition-all flex items-center justify-center ${selectedBid === 0 ? 'bg-blue-500 text-white ring-2 max-sm:ring-1 ring-blue-300 shadow-lg' : 'bg-gray-700 text-white hover:bg-gray-600'}`}>
                Nil
              </button>
              {/* Blind Nil Button */}
              <button 
                disabled={true}
                // Add unique class
                className={`${bottomButtonClass} h-10 max-sm:h-9 flex-1 rounded-lg max-sm:rounded-md text-base max-sm:text-xs font-bold bg-gray-600 text-gray-400 cursor-not-allowed flex items-center justify-center`}>
                Blind Nil
              </button> 
              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={selectedBid === null || isSubmitting}
                // Add unique class
                className={`${bottomButtonClass} h-10 max-sm:h-9 flex-1 rounded-lg max-sm:rounded-md text-base max-sm:text-xs font-bold transition-all flex items-center justify-center ${selectedBid !== null && !isSubmitting ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}>
                {isSubmitting ? 'Submitting...' : 'Submit Bid'} 
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Force mobile styles using style jsx global and !important */}
      <style jsx global>{`
        @media (max-width: 639px) {
          .${modalContainerClass} {
            padding-top: 20px !important; /* Reduce top padding */
          }
          .${modalContentClass} {
            width: 160px !important;
            padding: 8px !important;
          }
          .${modalContentClass} h2 {
            font-size: 14px !important;
            margin-bottom: 4px !important;
          }
          .${modalContentClass} p {
            font-size: 10px !important;
          }
          .${modalContentClass} > div:nth-of-type(2) { /* Main content div */
             gap: 4px !important; /* Reduce gap between rows */
          }
          .${modalContentClass} .flex {
            gap: 4px !important; /* Reduce gap between buttons */
          }
          .${numberButtonClass} {
            width: 32px !important;
            height: 32px !important;
            font-size: 12px !important;
          }
           .${numberButtonClass}.ring-2 {
             ring-width: 1px !important; /* Use ring-1 style */
          }
          .${bottomButtonClass} {
            height: 24px !important;
            font-size: 10px !important;
            border-radius: 4px !important; /* Smaller radius */
          }
           .${bottomButtonClass}.ring-2 {
             ring-width: 1px !important; /* Use ring-1 style */
          }
        }
      `}</style>
    </>
  );
} 