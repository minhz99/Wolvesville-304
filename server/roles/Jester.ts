import { Role } from './Role';
import { GameContext, GameEvent, Player } from '../types/GameTypes';

export class Jester extends Role {
    name = 'Jester';
    displayName = 'Thằng hề';
    description = 'Phe đơn độc. Không có kỹ năng đặc biệt. Thằng hề thắng nếu bị dân làng bỏ phiếu treo cổ — hãy khiến mọi người nghi ngờ bạn!';
    team = 'SOLO';

    // No night action — Jester wins by getting voted out during the day

    onDeath(ctx: GameContext, player: Player): GameEvent[] {
        // Jester win is handled directly in SocketGateway.resolveConfirmHang()
        // where we know it was a vote elimination. Do NOT emit JESTER_WIN here
        // because onDeath fires for ALL death types (wolf bite, poison, etc.)
        return [];
    }

    checkWinCondition(ctx: GameContext): string | null {
        return null;
    }
}
