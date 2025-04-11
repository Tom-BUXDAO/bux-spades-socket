interface LoserModalProps {
  isOpen: boolean;
  onClose: () => void;
  team1Score: number;
  team2Score: number;
  winningTeam: 1 | 2;
}

export default function LoserModal({
  isOpen,
  onClose,
  team1Score,
  team2Score,
  winningTeam
}: LoserModalProps) {
  if (!isOpen) return null;

  const losingTeam = winningTeam === 1 ? 2 : 1;

  return (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
      <div className="bg-gray-800 rounded-lg p-4 w-[400px] mx-4 text-center">
        <h2 className="text-2xl font-bold text-white mb-4">Game Over!</h2>
        
        <div className="text-3xl font-bold mb-6 text-gray-400">
          Team {losingTeam} Lost
        </div>

        <div className="flex justify-between mb-6">
          <div>
            <div className="text-red-500 font-semibold">Team 1</div>
            <div className="text-2xl text-white">{team1Score}</div>
          </div>
          <div>
            <div className="text-blue-500 font-semibold">Team 2</div>
            <div className="text-2xl text-white">{team2Score}</div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
        >
          New Game
        </button>
      </div>
    </div>
  );
} 