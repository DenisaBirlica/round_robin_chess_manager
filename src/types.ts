export type FormatType = 'single' | 'double';

export interface Game {
  id: string;
  round: number;
  board: number;
  white: string;
  black: string;
  result: '' | '1-0' | '0.5-0.5' | '0-1';
}

export interface Tournament {
  tournamentName: string;
  tournamentId: string;
  formatType: FormatType;
  players: string[];
  games: Game[];
  ownerId: string;
  updatedAt: any;
  allowGuestEdits?: boolean;
}

export interface Standing {
  name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  sbScore: number;
  blackWins: number;
}
