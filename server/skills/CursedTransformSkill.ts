import { Skill } from './Skill';
import { GameContext, GameEvent, Player } from '../types/GameTypes';

/**
 * CursedTransformSkill — Used by CursedWolf (Sói Nguyền).
 * - Starts as VILLAGER.
 * - When bitten by wolf (ATTEMPT_KILL from WEREWOLF source), does NOT die.
 * - Instead, transforms into WEREWOLF IMMEDIATELY (same night).
 * - This ensures if all other wolves die that night, the cursed wolf counts as a wolf.
 */
export class CursedTransformSkill extends Skill {
    name = 'CursedTransform';
    isNightSkill = false; // Passive — no active night action

    private transformed = false;

    use(ctx: GameContext, source: Player, input?: any): GameEvent[] {
        // Passive skill — no active use
        return [];
    }

    onEvent(ctx: GameContext, player: Player, event: GameEvent): GameEvent[] {
        // Already transformed — act as normal wolf
        if (this.transformed) return [];

        // Only intercept ATTEMPT_KILL from wolves targeting this player
        if (event.type !== 'ATTEMPT_KILL') return [];
        if (event.target?.id !== player.id) return [];

        // Check if the attacker is a wolf
        const attackerTeam = event.source?.role?.team;
        if (attackerTeam !== 'WEREWOLF') return [];

        // Cancel the kill — cursed wolf survives
        event.metadata = { ...event.metadata, cancelled: true };

        // Transform IMMEDIATELY into WEREWOLF (same night)
        this.transformed = true;
        if (player.role) {
            player.role.team = 'WEREWOLF';
            player.role.name = 'Werewolf';
            player.role.displayName = 'Ma Sói (Nguyền)';
        }

        return [{
            type: 'CURSED_WOLF_BITTEN',
            source: event.source,
            target: player,
            metadata: { message: 'Sói Nguyền bị cắn — đã biến thành Ma Sói!' }
        }];
    }

    public isTransformed(): boolean { return this.transformed; }
}
