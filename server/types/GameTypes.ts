export enum GamePhase {
  WAITING = 'WAITING',
  CONFIGURING = 'CONFIGURING',
  STARTING = 'STARTING',
  NIGHT_INIT = 'NIGHT_INIT',
  NIGHT_LOVER_TALK = 'NIGHT_LOVER_TALK',
  NIGHT_ACTION_COLLECTION = 'NIGHT_ACTION_COLLECTION',
  NIGHT_RESOLVE = 'NIGHT_RESOLVE',
  DAY_ANNOUNCE = 'DAY_ANNOUNCE',
  DAY_DISCUSSION = 'DAY_DISCUSSION',
  DAY_VOTING = 'DAY_VOTING',
  DAY_DEFENSE = 'DAY_DEFENSE',
  DAY_CONFIRM_HANG = 'DAY_CONFIRM_HANG',
  DAY_RESOLVE = 'DAY_RESOLVE',
  CHECK_WIN = 'CHECK_WIN',
  END = 'END'
}

export interface Player {
  id: string;
  alive: boolean;
  role: any;
}

export interface GameEvent {
  type: string;
  source?: Player;
  target?: Player;
  metadata?: any;
}

export interface GameContext {
  players: Player[];
  phase: GamePhase;
  round: number;
  config: GameConfig;

  getPlayer(id: string): Player | undefined;
  getAlivePlayers(): Player[];
  getAllPlayers(): Player[];
}

/**
 * Timer config (seconds) — all customizable by host in lobby.
 *   - nightAction: time for each night role action (guard/seer, witch, hunter)
 *   - wolfDiscussion: time for wolves to discuss and vote on target
 *   - dayDiscussion: discussion + voting time during day
 *   - confirmHang: confirm execution vote time (also used for defense)
 */
export interface GameConfig {
  timers: {
    nightAction: number;     // Time for each role to perform night action (default: 10s)
    wolfDiscussion: number;  // Time for wolves to discuss and vote (default: 30s)
    dayDiscussion: number;   // Discussion + voting time during the day (default: 120s)
    confirmHang: number;     // Defense + confirm execution time (default: 15s)
  };
}

/**
 * Chat message sent from server to client.
 */
export interface ChatMessage {
  id: string;
  type: 'system' | 'role-private' | 'player';
  content: string;
  timestamp: number;
  // If role-private, only players with matching roleFilter see this message
  roleFilter?: string;
  // If playerFilter set, only specific player IDs see this message
  playerFilter?: string[];
  // Optional icon/emoji
  icon?: string;
}

/**
 * Role visibility data sent to each player.
 * Contains what this player is allowed to see about others.
 */
export interface RoleVisibility {
  playerId: string;
  knownRoles: { [targetId: string]: { roleName: string; displayName: string; emoji: string; team: string } };
}

export const DEFAULT_CONFIG: GameConfig = {
  timers: {
    nightAction: 10,
    wolfDiscussion: 30,
    dayDiscussion: 120,
    confirmHang: 15,
  }
};
