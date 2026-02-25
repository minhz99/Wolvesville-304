import { Skill } from './Skill';
import { GameContext, GameEvent, GamePhase, Player } from '../types/GameTypes';

/**
 * ShootSkill — Used by Hunter.
 * Each night, Hunter pre-selects a revenge target.
 * When Hunter dies, the selected target is shot (ATTEMPT_KILL).
 * EXCEPTION: If Hunter is hit by 2+ death effects simultaneously
 * (e.g. wolf bite + poison), Hunter CANNOT shoot.
 */
export class ShootSkill extends Skill {
    name = 'Shoot';

    private revengeTargetId: string | null = null;
    private canShoot: boolean = true;

    onPhaseStart(ctx: GameContext): void {
        if (ctx.phase === GamePhase.NIGHT_INIT) {
            this.canShoot = true; // Reset each night
        }
    }

    use(ctx: GameContext, source: Player, input?: { targetId: string }): GameEvent[] {
        if (!input?.targetId) return [];

        const target = ctx.getPlayer(input.targetId);
        if (!target) return [];

        this.revengeTargetId = target.id;

        return [{
            type: 'HUNTER_TARGET_SET',
            source: source,
            target: target
        }];
    }

    /**
     * Called by EventBus before processing deaths.
     * If Hunter has multiple pending death events, disable shooting.
     */
    markMultiDeath(): void {
        this.canShoot = false;
    }

    /**
     * Called by Hunter.onDeath() — fires the revenge shot.
     * Returns empty if multi-death was detected.
     */
    onTriggerDeath(ctx: GameContext, player: Player): GameEvent[] {
        if (!this.canShoot) return [];
        if (!this.revengeTargetId) return [];

        const target = ctx.getPlayer(this.revengeTargetId);
        if (!target || !target.alive) return [];

        return [{
            type: 'ATTEMPT_KILL',
            source: player,
            target: target,
            metadata: { reason: 'HUNTER_SHOT' }
        }];
    }
}
