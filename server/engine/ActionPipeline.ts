import { GameContext, GameEvent, Player } from '../types/GameTypes';
import { EventBus } from './EventBus';

export interface NightAction {
    player: Player;
    input: any;
}

/**
 * Collects night actions, sorts them according to Role nightOrder,
 * and executes them to generate events for the EventBus.
 */
export class ActionPipeline {
    private actions: NightAction[] = [];

    constructor(private context: GameContext, private eventBus: EventBus) { }

    public registerAction(player: Player, input: any): void {
        if (!player.alive) return;
        this.actions.push({ player, input });
    }

    public resolveNight(): void {
        // Determine order
        // People with smaller nightOrder act first
        this.actions.sort((a, b) => {
            const orderA = a.player.role?.nightOrder ?? Infinity;
            const orderB = b.player.role?.nightOrder ?? Infinity;
            return orderA - orderB;
        });

        const collectedEvents: GameEvent[] = [];

        // Execute actions
        for (const action of this.actions) {
            if (!action.player.alive) continue; // died during resolution

            if (action.player.role && action.player.role.onAction) {
                try {
                    // Collect immediate events resulting from the action
                    const events = action.player.role.onAction(this.context, action.player, action.input);
                    if (events && events.length > 0) {
                        collectedEvents.push(...events);
                    }
                } catch (error) {
                    console.error(`[ActionPipeline] Error executing action for player ${action.player.id} (${action.player.role?.name}):`, error);
                }
            }
        }

        // Pass collected events to event bus for chain reactions
        if (collectedEvents.length > 0) {
            this.eventBus.publish(collectedEvents);
        }

        // Reset pipeline for the next night
        this.actions = [];
    }
}
