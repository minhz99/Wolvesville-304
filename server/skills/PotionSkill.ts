import { Skill } from './Skill';
import { GameContext, GameEvent, Player } from '../types/GameTypes';

export class PotionSkill extends Skill {
    name = 'Potion';

    private hasHealPotion = true;
    private hasPoisonPotion = true;
    private healedPlayerId: string | null = null;

    use(ctx: GameContext, source: Player, input?: { healTargetId?: string, poisonTargetId?: string }): GameEvent[] {
        const events: GameEvent[] = [];

        // Process Healing
        if (input?.healTargetId && this.hasHealPotion) {
            const target = ctx.getPlayer(input.healTargetId);
            if (target) {
                this.hasHealPotion = false;
                this.healedPlayerId = target.id;
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

    onEvent(ctx: GameContext, player: Player, event: GameEvent): GameEvent[] {
        // Cancel ATTEMPT_KILL on the healed player
        if (event.type === 'ATTEMPT_KILL' && this.healedPlayerId && event.target?.id === this.healedPlayerId) {
            event.metadata = { ...event.metadata, cancelled: true };
            this.healedPlayerId = null;
            return [{
                type: 'HEAL_SUCCESS',
                source: player,
                target: event.target
            }];
        }
        return [];
    }
}
