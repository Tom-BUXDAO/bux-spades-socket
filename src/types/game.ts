export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface Player {
  id: string;
  name: string;
  position?: number;
  hand?: Card[];
  tricks?: number;
  bid?: number;
  isLeadingPlayer?: boolean;
  team: 1 | 2;
  browserSessionId?: string;
  isDealer?: boolean;
}

export type GameStatus = "WAITING" | "BIDDING" | "PLAYING" | "FINISHED";

export interface GameState {
  id: string;
  status: GameStatus;
  players: Player[];
  currentPlayer: string;
  currentTrick: Card[];
  completedTricks: Card[][];
  team1Score: number;
  team2Score: number;
  team1Bags: number;
  team2Bags: number;
  createdAt?: number;
}

export interface LobbyState {
  games: GameState[];
}

export type GameAction = 
  | { type: "CREATE_GAME"; userId: string }
  | { type: "JOIN_GAME"; gameId: string; userId: string }
  | { type: "MAKE_BID"; gameId: string; userId: string; bid: number }
  | { type: "PLAY_CARD"; gameId: string; userId: string; card: Card }; 