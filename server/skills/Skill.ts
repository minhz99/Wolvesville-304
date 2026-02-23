import { GameContext, GameEvent, Player } from '../types/GameTypes';

export abstract class Skill {
    abstract name: string;

    // Can this skill be used at night?
    public isNightSkill: boolean = true;

    /**
     * Called when a player decides to use the skill.
     * Returns generated events.
     */
    abstract use(ctx: GameContext, source: Player, input?: any): GameEvent[];

    /**
     * Some skills might be passive and react to events
     */
    onEvent?(ctx: GameContext, player: Player, event: GameEvent): GameEvent[];
}
