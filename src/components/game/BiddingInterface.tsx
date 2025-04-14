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
    <>
      <style jsx>{`
        @media (max-width: 639px) {
          .bid-modal {
            width: 120px !important;
            padding: 0.25rem !important;
          }
          .number-button {
            width: 24px !important;
            height: 24px !important;
            font-size: 10px !important;
          }
          .action-button {
            height: 20px !important;
            font-size: 10px !important;
          }
          .modal-title {
            font-size: 12px !important;
          }
          .current-bid {
            font-size: 10px !important;
          }
        }
      `}</style>
      <div className="fixed inset-0 flex items-center justify-center" style={{ top: '15%', zIndex: 9999 }}>
        <div className="bid-modal w-[400px] bg-gray-800/95 rounded-2xl p-4 shadow-2xl">
          <div className="text-center mb-3">
            <h2 className="modal-title text-xl font-bold text-white">Make Your Bid</h2>
            {currentBid !== undefined && (
              <p className="current-bid text-base text-gray-300">Current bid: {currentBid}</p>
            )}
          </div>

          <div className="space-y-2">
            {/* Row 1: 1-4 */}
            <div className="flex justify-between px-0">
              {[1, 2, 3, 4].map((bid) => (
                <button
                  key={bid}
                  onClick={() => handleBidClick(bid)}
                  className={`
                    number-button w-[75px] h-[75px]
                    rounded-full text-xl font-bold transition-all
                    flex items-center justify-center
                    ${selectedBid === bid 
                      ? 'bg-yellow-500 text-black ring-2 ring-yellow-300 shadow-lg' 
                      : 'bg-gray-700 text-white hover:bg-gray-600'}`}
                >
                  {bid}
                </button>
              ))}
            </div>

            {/* Row 2: 5-9 with offset */}
            <div className="flex justify-between px-[37.5px]">
              {[5, 6, 7, 8, 9].map((bid) => (
                <button
                  key={bid}
                  onClick={() => handleBidClick(bid)}
                  className={`
                    number-button w-[75px] h-[75px]
                    rounded-full text-xl font-bold transition-all
                    flex items-center justify-center
                    ${selectedBid === bid 
                      ? 'bg-yellow-500 text-black ring-2 ring-yellow-300 shadow-lg' 
                      : 'bg-gray-700 text-white hover:bg-gray-600'}`}
                >
                  {bid}
                </button>
              ))}
            </div>

            {/* Row 3: 10-13 */}
            <div className="flex justify-between px-0">
              {[10, 11, 12, 13].map((bid) => (
                <button
                  key={bid}
                  onClick={() => handleBidClick(bid)}
                  className={`
                    number-button w-[75px] h-[75px]
                    rounded-full text-xl font-bold transition-all
                    flex items-center justify-center
                    ${selectedBid === bid 
                      ? 'bg-yellow-500 text-black ring-2 ring-yellow-300 shadow-lg' 
                      : 'bg-gray-700 text-white hover:bg-gray-600'}`}
                >
                  {bid}
                </button>
              ))}
            </div>

            {/* Bottom row for special actions */}
            <div className="flex justify-between gap-2 mt-3">
              <button
                onClick={() => handleBidClick(0)}
                className={`
                  action-button h-[40px] flex-1
                  rounded-xl text-lg font-bold transition-all
                  ${selectedBid === 0 
                    ? 'bg-yellow-500 text-black ring-2 ring-yellow-300 shadow-lg' 
                    : 'bg-gray-700 text-white hover:bg-gray-600'}
                `}
              >
                Nil
              </button>
              <button
                disabled={true}
                className="action-button h-[40px] flex-1
                  rounded-xl text-lg font-bold bg-gray-600 text-gray-400 cursor-not-allowed"
              >
                Blind Nil
              </button>
              <button
                onClick={handleSubmit}
                disabled={selectedBid === null || isSubmitting}
                className={`
                  action-button h-[40px] flex-1
                  rounded-xl text-lg font-bold transition-all
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
      </div>
    </>
  );
} 