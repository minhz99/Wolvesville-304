import { GameContext, GameEvent, Player } from '../types/GameTypes';
import { Skill } from '../skills/Skill';

export abstract class Role {
    abstract name: string;
    abstract displayName: string; // Vietnamese display name (e.g. "Ma Sói")
    abstract description: string; // Vietnamese role guide (e.g. "Mỗi đêm, chọn 1 người để cắn")
    abstract team: string; // e.g. 'VILLAGER', 'WEREWOLF', 'SOLO'

    // 'independent' = runs in parallel with timeout, 'reactive' = triggered by events
    actionType: 'independent' | 'reactive' | 'none' = 'none';

    // A role is now composed of multiple skills
    skills: Skill[] = [];

    // Determines the order of execution during the night. Lower number = runs first.
    // For independent actions, nightOrder is used for resolve priority (not execution order).
    // Optional, if undefined the role has no night action.
    nightOrder?: number;

    /**
     * Called when the game transitions to a new phase.
     */
    onPhaseStart?(ctx: GameContext): void {
        for (const skill of this.skills) {
            if ((skill as any).onPhaseStart) {
                (skill as any).onPhaseStart(ctx);
            }
        }
    }

    /**
     * Called to handle inputs from the player during their night turn.
     * Should return events resulting from this action (e.g., ATTEMPT_KILL).
     */
    onAction?(ctx: GameContext, player: Player, input: any): GameEvent[] {
        // By default, a role finds the appropriate skill to use based on input
        // or just uses the first available skill if not specified.
        if (this.skills.length === 0) return [];

        const skillName = input?.skillName;
        const skill = skillName ? this.skills.find(s => s.name === skillName) : this.skills[0];

        if (skill) {
            return skill.use(ctx, player, input);
        }
        return [];
    }

    /**
     * Called when an event is published to the EventBus.
     * The Role can react to events by returning new events to push to the queue.
     */
    onEvent?(ctx: GameContext, player: Player, event: GameEvent): GameEvent[] {
        const reactions: GameEvent[] = [];
        for (const skill of this.skills) {
            if (skill.onEvent) {
                const res = skill.onEvent(ctx, player, event);
                if (res) reactions.push(...res);
            }
        }
        return reactions;
    }

    /**
     * Called exactly when the player holding this role dies.
     */
    onDeath?(ctx: GameContext, player: Player): GameEvent[] {
        return [];
    }

    /**
     * Overrides or adds to the default win condition.
     * Returns the winning team name if this role triggered a win, otherwise null.
     */
    checkWinCondition?(ctx: GameContext): string | null {
        return null; // default handled by engine
    }
}

