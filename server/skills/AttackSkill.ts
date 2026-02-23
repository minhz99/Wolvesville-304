import { Skill } from './Skill';
import { GameContext, GameEvent, Player } from '../types/GameTypes';

export class AttackSkill extends Skill {
    name = 'Attack';

    use(ctx: GameContext, source: Player, input?: { targetId: string }): GameEvent[] {
        if (!input?.targetId) return [];

        const target = ctx.getPlayer(input.targetId);
        if (!target) return [];

        return [{
            type: 'ATTEMPT_KILL',
            source: source,
            target: target
        }];
    }

    // ATTEMPT_KILL → PLAYER_DEATH is handled centrally by EventBus.handleSystemEvent()
    // to avoid duplicate death events from multiple werewolves listening to the same event.
}
