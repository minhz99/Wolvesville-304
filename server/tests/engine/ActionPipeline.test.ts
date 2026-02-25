import { ActionPipeline } from '../../engine/ActionPipeline';
import { EventBus } from '../../engine/EventBus';
import { GameContext, GamePhase, Player, DEFAULT_CONFIG } from '../../types/GameTypes';
import { Guard } from '../../roles/Guard';
import { Seer } from '../../roles/Seer';
import { Werewolf } from '../../roles/Werewolf';
import { Witch } from '../../roles/Witch';
import { Hunter } from '../../roles/Hunter';
import { Villager } from '../../roles/Villager';

describe('ActionPipeline', () => {

    const createContext = (players: Player[]): GameContext => ({
        players,
        phase: GamePhase.NIGHT_ACTION_COLLECTION,
        round: 1,
        config: DEFAULT_CONFIG,
        getPlayer: (id: string) => players.find(p => p.id === id),
        getAlivePlayers: () => players.filter(p => p.alive),
        getAllPlayers: () => players,
        getLoverIds: () => undefined,
    });

    it('should execute actions in nightOrder (Guard=5 before Wolf=50 before Hunter=70)', () => {
        const guardRole = new Guard();
        const wolfRole = new Werewolf();
        const hunterRole = new Hunter();

        const guard: Player = { id: 'guard', alive: true, role: guardRole };
        const wolf: Player = { id: 'wolf', alive: true, role: wolfRole };
        const hunter: Player = { id: 'hunter', alive: true, role: hunterRole };
        const innocent: Player = { id: 'innocent', alive: true, role: new Villager() };

        const ctx = createContext([guard, wolf, hunter, innocent]);
        const bus = new EventBus(ctx);
        const pipeline = new ActionPipeline(ctx, bus);

        // Execution order tracking
        const executionOrder: string[] = [];
        const origGuardAction = guardRole.onAction!.bind(guardRole);
        guardRole.onAction = (c, p, i) => { executionOrder.push('Guard'); return origGuardAction(c, p, i); };
        const origWolfAction = wolfRole.onAction!.bind(wolfRole);
        wolfRole.onAction = (c, p, i) => { executionOrder.push('Wolf'); return origWolfAction(c, p, i); };
        const origHunterAction = hunterRole.onAction!.bind(hunterRole);
        hunterRole.onAction = (c, p, i) => { executionOrder.push('Hunter'); return origHunterAction(c, p, i); };

        pipeline.registerAction(guard, { targetId: 'innocent' });
        pipeline.registerAction(wolf, { targetId: 'innocent' });
        pipeline.registerAction(hunter, { targetId: 'wolf' });
        pipeline.resolveNight();

        // Guard (5) → Wolf (50) → Hunter (70)
        expect(executionOrder).toEqual(['Guard', 'Wolf', 'Hunter']);
    });

    it('should skip dead players actions', () => {
        const wolfRole = new Werewolf();
        const wolf: Player = { id: 'wolf', alive: true, role: wolfRole };
        const deadGuard: Player = { id: 'dead', alive: false, role: new Guard() };
        const vil: Player = { id: 'vil', alive: true, role: new Villager() };

        const ctx = createContext([wolf, deadGuard, vil]);
        const bus = new EventBus(ctx);
        const pipeline = new ActionPipeline(ctx, bus);

        // Dead guard registers action but should be skipped
        pipeline.registerAction(deadGuard, { targetId: 'vil' });
        pipeline.registerAction(wolf, { targetId: 'vil' });
        pipeline.resolveNight();

        // Only wolf's attack should have gone through (dead guard action skipped)
        expect(vil.alive).toBe(false);
    });

    it('should produce no events when pipeline is empty', () => {
        const vil: Player = { id: 'vil', alive: true, role: new Villager() };
        const ctx = createContext([vil]);
        const bus = new EventBus(ctx);
        const pipeline = new ActionPipeline(ctx, bus);

        const publishSpy = jest.spyOn(bus, 'publish');
        pipeline.resolveNight();
        expect(publishSpy).not.toHaveBeenCalled();
    });

    it('should reset actions after resolveNight', () => {
        const wolfRole = new Werewolf();
        const wolf: Player = { id: 'wolf', alive: true, role: wolfRole };
        const vil1: Player = { id: 'vil1', alive: true, role: new Villager() };
        const vil2: Player = { id: 'vil2', alive: true, role: new Villager() };

        const ctx = createContext([wolf, vil1, vil2]);
        const bus = new EventBus(ctx);
        const pipeline = new ActionPipeline(ctx, bus);

        pipeline.registerAction(wolf, { targetId: 'vil1' });
        pipeline.resolveNight();
        expect(vil1.alive).toBe(false);

        // Second resolve should have no pending actions
        vil1.alive = true; // reset for test
        const publishSpy = jest.spyOn(bus, 'publish');
        publishSpy.mockClear();
        pipeline.resolveNight();
        expect(publishSpy).not.toHaveBeenCalled();
    });

    it('should handle Guard protecting wolf target (integrated scenario)', () => {
        const guardRole = new Guard();
        const wolfRole = new Werewolf();
        const guard: Player = { id: 'guard', alive: true, role: guardRole };
        const wolf: Player = { id: 'wolf', alive: true, role: wolfRole };
        const target: Player = { id: 'target', alive: true, role: new Villager() };

        const ctx = createContext([guard, wolf, target]);
        const bus = new EventBus(ctx);
        const pipeline = new ActionPipeline(ctx, bus);

        // Guard protects target; Wolf attacks target
        pipeline.registerAction(guard, { targetId: 'target' });
        pipeline.registerAction(wolf, { targetId: 'target' });
        pipeline.resolveNight();

        expect(target.alive).toBe(true); // Guard saved the target
    });
});
