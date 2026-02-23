import { Skill } from './Skill';
import { GameContext, GameEvent, Player } from '../types/GameTypes';

export class ProtectSkill extends Skill {
    name = 'Protect';

    private protectedPlayerId: string | null = null;
    private lastProtectedPlayerId: string | null = null;

    onPhaseStart(ctx: GameContext): void {
        if (ctx.phase === 'NIGHT_INIT') {
            this.lastProtectedPlayerId = this.protectedPlayerId;
            this.protectedPlayerId = null;
        }
    }

    use(ctx: GameContext, source: Player, input?: { targetId: string }): GameEvent[] {
        if (!input?.targetId) return [];

        if (input.targetId === this.lastProtectedPlayerId) {
            throw new Error('Cannot protect the same player twice in a row');
        }

        const target = ctx.getPlayer(input.targetId);
        if (!target) return [];

        this.protectedPlayerId = target.id;

        return [{
            type: 'PROTECT_SET',
            source: source,
            target: target
        }];
    }

    onEvent(ctx: GameContext, player: Player, event: GameEvent): GameEvent[] {
        if (event.type === 'ATTEMPT_KILL' && event.target?.id === this.protectedPlayerId) {
            event.metadata = { ...event.metadata, cancelled: true };
            return [{
                type: 'PROTECT_SUCCESS',
                source: player,
                target: event.target
            }];
        }
        return [];
    }
}
