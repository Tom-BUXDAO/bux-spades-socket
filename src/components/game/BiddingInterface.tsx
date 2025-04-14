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

  const buttonBaseClasses = `
    w-12 h-12 rounded-full text-lg font-bold transition-all transform
    flex items-center justify-center
    sm:w-14 sm:h-14
    md:w-16 md:h-16
  `;

  const selectedButtonClasses = `
    bg-yellow-500 text-black ring-2 ring-yellow-300 shadow-lg
    hover:bg-yellow-400 scale-105
  `;

  const unselectedButtonClasses = `
    bg-gray-700 text-white hover:bg-gray-600
    hover:scale-105
  `;

  return (
    <div className="w-full max-w-md mx-auto bg-gray-800/95 backdrop-blur-sm rounded-xl p-6 shadow-xl">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">Make Your Bid</h2>
        {currentBid !== undefined && (
          <p className="text-gray-300">Current bid: {currentBid}</p>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {/* Row 1: Buttons 1-4 */}
        <div className="flex justify-center gap-4">
          {[1, 2, 3, 4].map((bid) => (
            <button
              key={bid}
              onClick={() => handleBidClick(bid)}
              className={`${buttonBaseClasses} ${
                selectedBid === bid ? selectedButtonClasses : unselectedButtonClasses
              }`}
            >
              {bid}
            </button>
          ))}
        </div>

        {/* Row 2: Buttons 5-9 */}
        <div className="flex justify-center gap-4">
          {[5, 6, 7, 8, 9].map((bid) => (
            <button
              key={bid}
              onClick={() => handleBidClick(bid)}
              className={`${buttonBaseClasses} ${
                selectedBid === bid ? selectedButtonClasses : unselectedButtonClasses
              }`}
            >
              {bid}
            </button>
          ))}
        </div>

        {/* Row 3: Buttons 10-13 */}
        <div className="flex justify-center gap-4">
          {[10, 11, 12, 13].map((bid) => (
            <button
              key={bid}
              onClick={() => handleBidClick(bid)}
              className={`${buttonBaseClasses} ${
                selectedBid === bid ? selectedButtonClasses : unselectedButtonClasses
              }`}
            >
              {bid}
            </button>
          ))}
        </div>

        {/* Row 4: Special bids */}
        <div className="flex justify-center gap-4 mt-2">
          <button
            onClick={() => handleBidClick(0)}
            className={`${buttonBaseClasses} !w-24 !rounded-xl ${
              selectedBid === 0 ? selectedButtonClasses : unselectedButtonClasses
            }`}
          >
            Nil
          </button>
          <button
            disabled={true}
            className={`${buttonBaseClasses} !w-24 !rounded-xl bg-gray-600 text-gray-400 cursor-not-allowed`}
          >
            Blind Nil
          </button>
        </div>

        {/* Confirm button */}
        <button
          onClick={handleSubmit}
          disabled={selectedBid === null || isSubmitting}
          className={`
            w-full py-3 rounded-xl text-lg font-bold transition-all mt-2
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