import { EventBus } from '../../engine/EventBus';
import { GameContext, GamePhase, Player, GameEvent, DEFAULT_CONFIG } from '../../types/GameTypes';
import { Guard } from '../../roles/Guard';
import { Werewolf } from '../../roles/Werewolf';
import { Elder } from '../../roles/Elder';
import { CursedWolf } from '../../roles/CursedWolf';
import { Hunter } from '../../roles/Hunter';
import { Cupid } from '../../roles/Cupid';
import { Villager } from '../../roles/Villager';
import { Witch } from '../../roles/Witch';

describe('EventBus', () => {

    const createContext = (players: Player[]): GameContext => ({
        players,
        phase: GamePhase.NIGHT_RESOLVE,
        round: 1,
        config: DEFAULT_CONFIG,
        getPlayer: (id: string) => players.find(p => p.id === id),
        getAlivePlayers: () => players.filter(p => p.alive),
        getAllPlayers: () => players,
        getLoverIds: () => undefined,
    });

    describe('ATTEMPT_KILL → PLAYER_DEATH', () => {
        it('should convert uncancelled ATTEMPT_KILL into PLAYER_DEATH', () => {
            const wolf: Player = { id: 'wolf', alive: true, role: new Werewolf() };
            const vil: Player = { id: 'vil', alive: true, role: new Villager() };
            const ctx = createContext([wolf, vil]);
            const bus = new EventBus(ctx);

            bus.publish({ type: 'ATTEMPT_KILL', source: wolf, target: vil });

            expect(vil.alive).toBe(false);
        });

        it('should NOT kill when ATTEMPT_KILL is cancelled', () => {
            const wolf: Player = { id: 'wolf', alive: true, role: new Werewolf() };
            const guardRole = new Guard();
            const guard: Player = { id: 'guard', alive: true, role: guardRole };
            const target: Player = { id: 'target', alive: true, role: new Villager() };
            const ctx = createContext([wolf, guard, target]);
            const bus = new EventBus(ctx);

            // Guard protects target first
            guardRole.onAction!(ctx, guard, { targetId: 'target' });

            // Wolf attacks target → Guard cancels
            bus.publish({ type: 'ATTEMPT_KILL', source: wolf, target: target });

            expect(target.alive).toBe(true); // Guard saved them
        });
    });

    describe('Elder Shield', () => {
        it('should absorb first wolf attack', () => {
            const wolf: Player = { id: 'wolf', alive: true, role: new Werewolf() };
            const elder: Player = { id: 'elder', alive: true, role: new Elder() };
            const ctx = createContext([wolf, elder]);
            const bus = new EventBus(ctx);

            bus.publish({ type: 'ATTEMPT_KILL', source: wolf, target: elder });

            expect(elder.alive).toBe(true);
        });

        it('should not absorb second wolf attack', () => {
            const wolf: Player = { id: 'wolf', alive: true, role: new Werewolf() };
            const elder: Player = { id: 'elder', alive: true, role: new Elder() };
            const ctx = createContext([wolf, elder]);
            const bus = new EventBus(ctx);

            bus.publish({ type: 'ATTEMPT_KILL', source: wolf, target: elder });
            expect(elder.alive).toBe(true);

            bus.publish({ type: 'ATTEMPT_KILL', source: wolf, target: elder });
            expect(elder.alive).toBe(false);
        });

        it('should NOT absorb poison', () => {
            const witch: Player = { id: 'witch', alive: true, role: new Witch() };
            const elder: Player = { id: 'elder', alive: true, role: new Elder() };
            const ctx = createContext([witch, elder]);
            const bus = new EventBus(ctx);

            bus.publish({
                type: 'ATTEMPT_KILL', source: witch, target: elder,
                metadata: { reason: 'POISON' }
            });

            expect(elder.alive).toBe(false);
        });
    });

    describe('CursedWolf Transform', () => {
        it('should transform into WEREWOLF when bitten by wolf', () => {
            const wolf: Player = { id: 'wolf', alive: true, role: new Werewolf() };
            const cursed: Player = { id: 'cursed', alive: true, role: new CursedWolf() };
            const ctx = createContext([wolf, cursed]);
            const bus = new EventBus(ctx);

            bus.publish({ type: 'ATTEMPT_KILL', source: wolf, target: cursed });

            expect(cursed.alive).toBe(true); // Survived
            expect(cursed.role!.team).toBe('WEREWOLF'); // Transformed
        });

        it('should NOT transform when attacked by non-wolf source', () => {
            const hunter: Player = { id: 'hunter', alive: true, role: new Hunter() };
            const cursed: Player = { id: 'cursed', alive: true, role: new CursedWolf() };
            const ctx = createContext([hunter, cursed]);
            const bus = new EventBus(ctx);

            bus.publish({
                type: 'ATTEMPT_KILL', source: hunter, target: cursed,
                metadata: { reason: 'HUNTER_SHOT' }
            });

            expect(cursed.alive).toBe(false);
            expect(cursed.role!.team).toBe('VILLAGER'); // Still villager
        });
    });

    describe('Hunter Revenge Shot', () => {
        it('should shoot revenge target on death', () => {
            const wolf: Player = { id: 'wolf', alive: true, role: new Werewolf() };
            const hunterRole = new Hunter();
            const hunter: Player = { id: 'hunter', alive: true, role: hunterRole };
            const target: Player = { id: 'target', alive: true, role: new Villager() };
            const ctx = createContext([wolf, hunter, target]);
            const bus = new EventBus(ctx);

            // Hunter sets revenge target
            hunterRole.onAction!(ctx, hunter, { targetId: 'target' });

            // Wolf kills hunter → Hunter shoots target
            bus.publish({ type: 'ATTEMPT_KILL', source: wolf, target: hunter });

            expect(hunter.alive).toBe(false);
            expect(target.alive).toBe(false); // Shot by hunter
        });

        it('should NOT shoot when multi-death detected', () => {
            const wolf: Player = { id: 'wolf', alive: true, role: new Werewolf() };
            const witch: Player = { id: 'witch', alive: true, role: new Witch() };
            const hunterRole = new Hunter();
            const hunter: Player = { id: 'hunter', alive: true, role: hunterRole };
            const target: Player = { id: 'target', alive: true, role: new Villager() };
            const ctx = createContext([wolf, witch, hunter, target]);
            const bus = new EventBus(ctx);

            // Hunter sets revenge target
            hunterRole.onAction!(ctx, hunter, { targetId: 'target' });

            // Both wolf bite and poison hit hunter simultaneously
            bus.publish([
                { type: 'ATTEMPT_KILL', source: wolf, target: hunter },
                { type: 'PLAYER_DEATH', source: witch, target: hunter, metadata: { reason: 'POISON' } },
            ]);

            expect(hunter.alive).toBe(false);
            expect(target.alive).toBe(true); // NOT shot — multi-death blocks it
        });
    });

    describe('Lover Chain Death', () => {
        it('should kill the surviving lover when one dies', () => {
            const wolf: Player = { id: 'wolf', alive: true, role: new Werewolf() };
            const cupidRole = new Cupid();
            const cupid: Player = { id: 'cupid', alive: true, role: cupidRole };
            const partner: Player = { id: 'partner', alive: true, role: new Villager() };
            const ctx = createContext([wolf, cupid, partner]);
            const bus = new EventBus(ctx);

            // Link lovers
            cupidRole.onAction!(ctx, cupid, { targetId: 'partner' });

            // Wolf kills partner → Cupid also dies
            bus.publish({ type: 'ATTEMPT_KILL', source: wolf, target: partner });

            expect(partner.alive).toBe(false);
            expect(cupid.alive).toBe(false); // Died from heartbreak
        });

        it('should kill both lovers regardless of which one dies', () => {
            const wolf: Player = { id: 'wolf', alive: true, role: new Werewolf() };
            const cupidRole = new Cupid();
            const cupid: Player = { id: 'cupid', alive: true, role: cupidRole };
            const partner: Player = { id: 'partner', alive: true, role: new Villager() };
            const ctx = createContext([wolf, cupid, partner]);
            const bus = new EventBus(ctx);

            cupidRole.onAction!(ctx, cupid, { targetId: 'partner' });

            // Wolf kills cupid → Partner also dies
            bus.publish({ type: 'ATTEMPT_KILL', source: wolf, target: cupid });

            expect(cupid.alive).toBe(false);
            expect(partner.alive).toBe(false);
        });
    });

    describe('Max Chain Limit', () => {
        it('should prevent infinite event loops', () => {
            // Create a role that always reacts to events with new events
            const infiniteRole = {
                name: 'Infinite', team: 'VILLAGER',
                onEvent: () => [{ type: 'LOOP_EVENT' }],
            } as any;
            const p: Player = { id: 'p', alive: true, role: infiniteRole };
            const ctx = createContext([p]);
            const bus = new EventBus(ctx);

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            bus.publish({ type: 'TRIGGER' });
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Max event chain limit'));
            consoleSpy.mockRestore();
        });
    });

    describe('Witch Heal via EventBus', () => {
        it('should cancel ATTEMPT_KILL when witch has healed the target', () => {
            const wolf: Player = { id: 'wolf', alive: true, role: new Werewolf() };
            const witchRole = new Witch();
            const witch: Player = { id: 'witch', alive: true, role: witchRole };
            const target: Player = { id: 'target', alive: true, role: new Villager() };
            const ctx = createContext([wolf, witch, target]);
            const bus = new EventBus(ctx);

            // Witch heals target
            witchRole.onAction!(ctx, witch, { healTargetId: 'target' });

            // Wolf attacks target → should be cancelled by PotionSkill.onEvent
            bus.publish({ type: 'ATTEMPT_KILL', source: wolf, target: target });

            expect(target.alive).toBe(true); // Witch saved them
        });
    });
});
