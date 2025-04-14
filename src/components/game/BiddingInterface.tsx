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
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ top: '35%' }}>
      <div className="w-[200px] sm:w-[280px] md:w-[320px] bg-gray-800/95 rounded-xl p-2 shadow-xl">
        <div className="text-center mb-1">
          <h2 className="text-sm sm:text-base font-bold text-white">Make Your Bid</h2>
          {currentBid !== undefined && (
            <p className="text-xs text-gray-300">Current bid: {currentBid}</p>
          )}
        </div>

        <div className="grid grid-cols-4 gap-1">
          {/* Numbers 1-13 in a grid */}
          {[...Array(13)].map((_, i) => (
            <button
              key={i + 1}
              onClick={() => handleBidClick(i + 1)}
              className={`
                w-[40px] h-[40px] sm:w-[50px] sm:h-[50px]
                rounded-full text-sm sm:text-base font-bold transition-all
                flex items-center justify-center
                ${selectedBid === i + 1
                  ? 'bg-yellow-500 text-black ring-2 ring-yellow-300 shadow-lg' 
                  : 'bg-gray-700 text-white hover:bg-gray-600'}`}
            >
              {i + 1}
            </button>
          ))}
        </div>

        {/* Bottom row for special actions */}
        <div className="flex justify-between gap-1 mt-1">
          <button
            onClick={() => handleBidClick(0)}
            className={`
              h-[30px] flex-1
              rounded-lg text-xs sm:text-sm font-bold transition-all
              ${selectedBid === 0 
                ? 'bg-yellow-500 text-black ring-2 ring-yellow-300 shadow-lg' 
                : 'bg-gray-700 text-white hover:bg-gray-600'}
            `}
          >
            Nil
          </button>
          <button
            disabled={true}
            className="h-[30px] flex-1 rounded-lg text-xs sm:text-sm font-bold bg-gray-600 text-gray-400 cursor-not-allowed"
          >
            Blind Nil
          </button>
          <button
            onClick={handleSubmit}
            disabled={selectedBid === null || isSubmitting}
            className={`
              h-[30px] flex-1
              rounded-lg text-xs sm:text-sm font-bold transition-all
              ${selectedBid !== null && !isSubmitting
                ? 'bg-green-500 hover:bg-green-600 text-white'
                : 'bg-gray-600 text-gray-400 cursor-not-allowed'}
            `}
          >
            {isSubmitting ? '...' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
} 