export type PlayerRole = "mafia" | "don" | "sheriff" | "doctor" | "civilian";

export interface Player {
  userId: string;
  name: string;
  role: PlayerRole;
  message: string;
  alive: boolean;
  ready: boolean;
  knownEnemyId: string | null;
}

export type GameStatus = "lobby" | "playing" | "finished";
export type GamePhase = "lobby" | "night_zero" | "day_discussion" | "day_voting" | "night" | "night_planning";

export interface GameRoom {
  roomId: string;
  hostId: string;
  status: GameStatus;
  gameMode: "open" | "closed";
  phase: GamePhase;
  dayNumber: number;
  infoMessage: string;
  winner: string; // "UPA" or "NKVD"
  players: Record<string, Player>;
  nkvdPlan: string[];
  planIndex: number;
  nightActions: Record<string, string>;
  speakerIndex: number;
  lastHealedTarget?: string;
  nominations: Record<string, string>; // nominatorId -> candidateId
  votes: Record<string, string>;
  wasNightKill: boolean;
}
