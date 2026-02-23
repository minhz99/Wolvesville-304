import { GamePhase, Player, GameConfig, DEFAULT_CONFIG } from '../types/GameTypes';

export class GameState {
    public players: Player[] = [];
    public phase: GamePhase = GamePhase.WAITING;
    public round: number = 0;
    public config: GameConfig = { ...DEFAULT_CONFIG };

    // Seer investigation history: { seerPlayerId: { targetId: teamAtTimeOfInvestigation } }
    public seerHistory: Record<string, Record<string, string>> = {};

    // Lover pair (Cupid)
    public loverIds: { cupidId: string; partnerId: string } | null = null;
}
