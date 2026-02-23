import { Skill } from './Skill';
import { GameContext, GameEvent, Player } from '../types/GameTypes';

export class PotionSkill extends Skill {
    name = 'Potion';

    private hasHealPotion = true;
    private hasPoisonPotion = true;

    use(ctx: GameContext, source: Player, input?: { healTargetId?: string, poisonTargetId?: string }): GameEvent[] {
        const events: GameEvent[] = [];

        // Process Healing
        if (input?.healTargetId && this.hasHealPotion) {
            const target = ctx.getPlayer(input.healTargetId);
            if (target) {
                this.hasHealPotion = false;
                events.push({
                    type: 'HEAL_POTION_USED',
                    source: source,
                    target: target
                });
            }
        }

        // Process Poisoning
        if (input?.poisonTargetId && this.hasPoisonPotion) {
            const target = ctx.getPlayer(input.poisonTargetId);
            if (target) {
                this.hasPoisonPotion = false;
                events.push({
                    type: 'PLAYER_DEATH',
                    source: source,
                    target: target,
                    metadata: { reason: 'POISON' }
                });
            }
        }

        return events;
    }
}
