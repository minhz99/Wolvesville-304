import { Skill } from './Skill';
import { GameContext, GameEvent, Player } from '../types/GameTypes';

/**
 * ElderShieldSkill — Used by Elder.
 * Absorbs the first wolf ATTEMPT_KILL (has 1 extra life against wolves).
 * Does NOT protect against vote elimination or poison.
 */
export class ElderShieldSkill extends Skill {
    name = 'ElderShield';
    isNightSkill = false; // Passive skill, no active night action

    private shieldActive = true;

    use(ctx: GameContext, source: Player, input?: any): GameEvent[] {
        // Passive skill — no active use
        return [];
    }

    onEvent(ctx: GameContext, player: Player, event: GameEvent): GameEvent[] {
        if (event.type !== 'ATTEMPT_KILL') return [];
        if (event.target?.id !== player.id) return [];

        // Only block wolf attacks (not poison, not vote, not hunter shot)
        const reason = event.metadata?.reason;
        if (reason === 'POISON' || reason === 'HUNTER_SHOT' || reason === 'VOTE_ELIMINATION') {
            return [];
        }

        if (this.shieldActive) {
            // Absorb the hit
            this.shieldActive = false;
            event.metadata = { ...event.metadata, cancelled: true };

            return [{
                type: 'ELDER_SHIELD_USED',
                source: player,
                target: player,
                metadata: { shieldsRemaining: 0 }
            }];
        }

        return [];
    }
}
