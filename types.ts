
export type GameState = 'IDLE' | 'ACTIVE' | 'WINDOW_OPEN' | 'LOCKED';
export type Language = 'EN' | 'RU';

export interface Player {
  id: string;
  name: string;
  disabled: boolean;
}

export interface BuzzRecord {
  playerId: string;
  playerName: string;
  timestamp: number;
  offset: number;
  rank: number;
}

export interface Config {
  server: {
    ip: string;
    port: number;
  };
  game: {
    buzzerWindowMs: number;
    hapticPattern: number[];
  };
}

export type Role = 'host' | 'player';
