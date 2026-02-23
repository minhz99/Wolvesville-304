import { GameContext, GameEvent, Player } from '../types/GameTypes';

/**
 * The EventBus is the heart of the reactive engine.
 * It queues events and broadcasts them to all living players,
 * allowing subsequent events (chain reactions) to be processed.
 *
 * Special handling:
 * - Detects multi-death (2+ kill effects on same target) and marks Hunter accordingly.
 */
export class EventBus {
    private queue: GameEvent[] = [];

    private processedCount: number = 0;
    private MAX_CHAIN = 100;

    constructor(private context: GameContext) { }

    /**
     * Pushes an initial event or batch of events into the bus and processes the chain.
     */
    public publish(events: GameEvent | GameEvent[]): void {
        const newEvents = Array.isArray(events) ? events : [events];
        this.queue.push(...newEvents);

        // Pre-process: detect multi-death for Hunter
        this.detectMultiDeath();

        this.processQueue();
    }

    /**
     * Scans the queue for multiple kill effects targeting the same player.
     * If a player (specifically Hunter) has 2+ death/kill events, mark them.
     */
    private detectMultiDeath(): void {
        // Count kill events per target
        const killCount: Record<string, number> = {};

        for (const event of this.queue) {
            if ((event.type === 'ATTEMPT_KILL' || event.type === 'PLAYER_DEATH') && event.target) {
                const targetId = event.target.id;
                killCount[targetId] = (killCount[targetId] || 0) + 1;
            }
        }

        // Mark players with multi-death
        for (const [targetId, count] of Object.entries(killCount)) {
            if (count >= 2) {
                const target = this.context.getPlayer(targetId);
                if (target?.role?.name === 'Hunter' && target.role.markMultiDeath) {
                    target.role.markMultiDeath();
                    console.log(`[EventBus] Hunter ${targetId} hit by ${count} kill effects — cannot shoot.`);
                }
            }
        }
    }

    private processQueue(): void {
        this.processedCount = 0;

        while (this.queue.length > 0) {
            if (this.processedCount++ > this.MAX_CHAIN) {
                console.error('Max event chain limit reached! Possible infinite loop.');
                this.queue = [];
                break;
            }

            const event = this.queue.shift()!;
            this.dispatchEvent(event);
        }
    }

    private dispatchEvent(event: GameEvent): void {
        // For PLAYER_DEATH: handle system-level death first (set alive=false, call onDeath)
        if (event.type === 'PLAYER_DEATH') {
            this.handlePlayerDeath(event);
        }

        // For PLAYER_DEATH: dispatch to ALL players (including recently dead)
        // so CupidLinkSkill can trigger lover chain death even when Cupid is the one who died
        const playersToNotify = event.type === 'PLAYER_DEATH'
            ? this.context.getAllPlayers()
            : this.context.getAlivePlayers();
        for (const player of playersToNotify) {
            if (!player.role) continue;
            if (player.role.onEvent) {
                const reactions = player.role.onEvent(this.context, player, event);
                if (reactions && reactions.length > 0) {
                    this.queue.push(...reactions);
                }
            }
        }

        // AFTER all role reactions: convert ATTEMPT_KILL → PLAYER_DEATH if not cancelled
        // Guard/Elder/CursedWolf set event.metadata.cancelled = true via onEvent above
        if (event.type === 'ATTEMPT_KILL' && event.target && !event.metadata?.cancelled) {
            this.queue.push({
                type: 'PLAYER_DEATH',
                source: event.source,
                target: event.target,
                metadata: { ...(event.metadata || {}), reason: event.metadata?.reason || 'WOLF_ATTACK' }
            });
        }
    }

    private handlePlayerDeath(event: GameEvent): void {
        if (!event.target) return;
        if (event.target.alive) {
            event.target.alive = false;

            if (event.target.role && event.target.role.onDeath) {
                const deathReactions = event.target.role.onDeath(this.context, event.target);
                if (deathReactions && deathReactions.length > 0) {
                    this.queue.push(...deathReactions);
                }
            }
        }
    }
}
