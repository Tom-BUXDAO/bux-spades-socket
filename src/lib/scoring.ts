import type { Player } from '@/types/game';

export interface TeamScore {
  bid: number;
  tricks: number;
  nilBids: number;
  madeNils: number;
  score: number;
  bags: number;
}

export function calculateHandScore(players: Player[]): { team1: TeamScore, team2: TeamScore } {
  // Initialize team scores
  const team1: TeamScore = { bid: 0, tricks: 0, nilBids: 0, madeNils: 0, score: 0, bags: 0 };
  const team2: TeamScore = { bid: 0, tricks: 0, nilBids: 0, madeNils: 0, score: 0, bags: 0 };

  // Calculate team totals
  players.forEach(player => {
    const team = player.team === 1 ? team1 : team2;
    team.tricks += player.tricks || 0;
    
    if (player.bid === 0) {
      team.nilBids++;
      if (player.tricks === 0) {
        team.madeNils++;
      }
    } else if (player.bid !== undefined) {
      team.bid += player.bid;
    }
  });

  // Calculate scores for each team
  [team1, team2].forEach(team => {
    // Score nil bids
    team.score += team.madeNils * 100;     // +100 for each made nil
    team.score -= (team.nilBids - team.madeNils) * 100;  // -100 for each failed nil

    // Score regular bid
    if (team.bid > 0) {
      if (team.tricks >= team.bid) {
        // Made bid
        team.score += team.bid * 10;  // 10 points per bid book
        team.bags = team.tricks - team.bid;  // Extra books are bags
        team.score += team.bags;  // 1 point per bag
      } else {
        // Set (failed to make bid)
        team.score -= team.bid * 10;  // -10 points per bid book
      }
    }
  });

  return { team1, team2 };
} 