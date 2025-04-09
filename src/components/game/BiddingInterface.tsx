import { useState, useEffect } from "react";

interface BiddingProps {
  onBid: (bid: number) => void;
  currentBid?: number;
  gameId: string;
  playerId: string;
  currentPlayerTurn: string;
}

export default function BiddingInterface({ onBid, currentBid, gameId, playerId, currentPlayerTurn }: BiddingProps) {
  const [selectedBid, setSelectedBid] = useState<number | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const isMyTurn = playerId === currentPlayerTurn;

  // Add debugging for turn changes
  useEffect(() => {
    console.log(`BiddingInterface: Turn check - My ID: ${playerId}, Current Turn: ${currentPlayerTurn}, Is My Turn: ${isMyTurn}`);
    if (isMyTurn) {
      console.log(`BiddingInterface: It's my turn to bid`);
      setSubmitting(false);
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
        setSubmitting(true);
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
  if (!currentlyMyTurn || submitting) {
    console.log(`BiddingInterface: Hiding - currentlyMyTurn: ${currentlyMyTurn}, submitting: ${submitting}`);
    return null;
  }

  const handleBidSelect = (bid: number) => {
    setSelectedBid(bid);
  };

  const handleConfirm = () => {
    if (selectedBid !== undefined) {
      setSubmitting(true);
      // Submit the bid
      onBid(selectedBid);
      
      // Force hide the bidding interface immediately after submitting
      // This is a workaround in case the game state doesn't update fast enough
      setTimeout(() => {
        if (playerId === currentPlayerTurn) {
          console.log("Forcing bidding interface to hide - turn should have changed");
          // Force the component to return null by emulating a turn change
          setSubmitting(true);
        }
      }, 500);
    }
  };

  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-800 p-6 rounded-lg shadow-lg border-2 border-yellow-400 z-50">
      <div className="text-yellow-400 text-xl mb-4 text-center font-bold">YOUR TURN - Make your bid</div>
      <div className="flex flex-col gap-2">
        {/* First row: 1-6 */}
        <div className="flex gap-2 justify-center">
          {[1, 2, 3, 4, 5, 6].map((num) => (
            <button
              key={num}
              onClick={() => handleBidSelect(num)}
              disabled={submitting}
              className={`w-12 h-12 rounded ${
                selectedBid === num
                  ? 'bg-blue-600 text-white ring-2 ring-yellow-400'
                  : 'bg-gray-600 hover:bg-gray-500 text-white'
              } ${submitting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {num}
            </button>
          ))}
        </div>
        
        {/* Second row: 7-12 */}
        <div className="flex gap-2 justify-center">
          {[7, 8, 9, 10, 11, 12].map((num) => (
            <button
              key={num}
              onClick={() => handleBidSelect(num)}
              disabled={submitting}
              className={`w-12 h-12 rounded ${
                selectedBid === num
                  ? 'bg-blue-600 text-white ring-2 ring-yellow-400'
                  : 'bg-gray-600 hover:bg-gray-500 text-white'
              } ${submitting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {num}
            </button>
          ))}
        </div>

        {/* Third row: special bids */}
        <div className="flex gap-2 justify-center mt-2">
          <button
            onClick={() => handleBidSelect(0)}
            disabled={submitting}
            className={`w-24 h-12 rounded ${
              selectedBid === 0
                ? 'bg-blue-600 text-white ring-2 ring-yellow-400'
                : 'bg-gray-600 hover:bg-gray-500 text-white'
            } ${submitting ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Nil
          </button>
          <button
            disabled
            className="w-24 h-12 rounded bg-gray-700 text-gray-500 cursor-not-allowed"
          >
            Blind Nil
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedBid === undefined || submitting}
            className={`w-24 h-12 rounded ${
              selectedBid !== undefined && !submitting
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            {submitting ? 'Submitting...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
} 