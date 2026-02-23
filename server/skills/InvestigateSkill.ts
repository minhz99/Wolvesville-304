import { Skill } from './Skill';
import { GameContext, GameEvent, Player } from '../types/GameTypes';

export class InvestigateSkill extends Skill {
    name = 'Investigate';

    use(ctx: GameContext, source: Player, input?: { targetId: string }): GameEvent[] {
        if (!input?.targetId) return [];

        const target = ctx.getPlayer(input.targetId);
        if (!target) return [];

        const isWolf = target.role?.team === 'WEREWOLF';

        return [{
            type: 'SEER_RESULT',
            source: source,
            target: target,
            metadata: { isWolf }
        }];
    }
}
