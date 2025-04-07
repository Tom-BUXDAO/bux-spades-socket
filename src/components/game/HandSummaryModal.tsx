import { TeamScore } from '@/lib/scoring';
import type { Player } from '@/types/game';

interface HandSummaryModalProps {
  onClose: () => void;
  players: Player[];
  team1Score: TeamScore;
  team2Score: TeamScore;
}

export default function HandSummaryModal({
  onClose,
  players,
  team1Score,
  team2Score
}: HandSummaryModalProps) {
  const team1Players = players.filter(p => p.team === 1);
  const team2Players = players.filter(p => p.team === 2);

  return (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
      <div className="bg-gray-800 rounded-lg p-4 w-[500px] mx-4">
        <h2 className="text-xl font-bold text-white mb-4 text-center">Hand Summary</h2>
        
        <div className="flex gap-4">
          {/* Team 1 (Red) */}
          <div className="flex-1 bg-gray-700/50 rounded-lg p-3">
            <h3 className="text-lg font-semibold text-red-500 mb-2">Team 1</h3>
            {team1Players.map(player => (
              <div key={player.name} className="text-white text-sm mb-1">
                <span className="font-medium">{player.name}</span>
                <span className="text-gray-300"> ({player.bid}/{player.tricks})</span>
              </div>
            ))}
            <div className="border-t border-gray-600 mt-2 pt-2 text-white text-sm">
              <div>Bid: {team1Score.bid}</div>
              <div>Tricks: {team1Score.tricks}</div>
              {team1Score.nilBids > 0 && (
                <div>Nils: {team1Score.madeNils}/{team1Score.nilBids}</div>
              )}
              {team1Score.bags > 0 && (
                <div>Bags: +{team1Score.bags}</div>
              )}
              <div className="text-lg font-bold mt-1">
                Score: {team1Score.score > 0 ? '+' : ''}{team1Score.score}
              </div>
            </div>
          </div>

          {/* Team 2 (Blue) */}
          <div className="flex-1 bg-gray-700/50 rounded-lg p-3">
            <h3 className="text-lg font-semibold text-blue-500 mb-2">Team 2</h3>
            {team2Players.map(player => (
              <div key={player.name} className="text-white text-sm mb-1">
                <span className="font-medium">{player.name}</span>
                <span className="text-gray-300"> ({player.bid}/{player.tricks})</span>
              </div>
            ))}
            <div className="border-t border-gray-600 mt-2 pt-2 text-white text-sm">
              <div>Bid: {team2Score.bid}</div>
              <div>Tricks: {team2Score.tricks}</div>
              {team2Score.nilBids > 0 && (
                <div>Nils: {team2Score.madeNils}/{team2Score.nilBids}</div>
              )}
              {team2Score.bags > 0 && (
                <div>Bags: +{team2Score.bags}</div>
              )}
              <div className="text-lg font-bold mt-1">
                Score: {team2Score.score > 0 ? '+' : ''}{team2Score.score}
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-4 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
        >
          Continue
        </button>
      </div>
    </div>
  );
} 