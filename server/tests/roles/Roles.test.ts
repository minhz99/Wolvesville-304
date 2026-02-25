import { Seer } from '../../roles/Seer';
import { Witch } from '../../roles/Witch';
import { GameContext, GamePhase, Player, GameEvent } from '../../types/GameTypes';
import { DEFAULT_CONFIG } from '../../types/GameTypes';
import { Guard } from '../../roles/Guard';
import { Cupid } from '../../roles/Cupid';
import { Hunter } from '../../roles/Hunter';
import { Jester } from '../../roles/Jester';
import { Elder } from '../../roles/Elder';
import { CursedWolf } from '../../roles/CursedWolf';
import { Werewolf } from '../../roles/Werewolf';

describe('Roles and Skills', () => {

    const createMockContext = (players: Player[]): GameContext => {
        return {
            players,
            phase: GamePhase.NIGHT_ACTION_COLLECTION,
            round: 1,
            config: DEFAULT_CONFIG,
            getPlayer: (id: string) => players.find(p => p.id === id),
            getAlivePlayers: () => players.filter(p => p.alive),
            getAllPlayers: () => players,
            getLoverIds: () => undefined,
        } as GameContext;
    };

    describe('Seer', () => {
        it('should return SEER_RESULT event with isWolf true/false', () => {
            const seerRole = new Seer();
            const source: Player = { id: 'seer', alive: true, role: seerRole };
            const targetWolf: Player = { id: 'wolf', alive: true, role: { team: 'WEREWOLF' } };
            const targetVil: Player = { id: 'vil', alive: true, role: { team: 'VILLAGER' } };

            const context = createMockContext([source, targetWolf, targetVil]);

            const eventsWolf = seerRole.onAction(context, source, { targetId: 'wolf' });
            expect(eventsWolf).toHaveLength(1);
            expect(eventsWolf[0].type).toBe('SEER_RESULT');
            expect(eventsWolf[0].metadata.isWolf).toBe(true);
            expect(eventsWolf[0].target).toBe(targetWolf);

            const eventsVil = seerRole.onAction(context, source, { targetId: 'vil' });
            expect(eventsVil).toHaveLength(1);
            expect(eventsVil[0].metadata.isWolf).toBe(false);
            expect(eventsVil[0].target).toBe(targetVil);
        });
    });

    describe('Witch', () => {
        it('should heal and poison correctly, only once per game', () => {
            const witchRole = new Witch();
            const source: Player = { id: 'witch', alive: true, role: witchRole };
            const targetA: Player = { id: 'A', alive: true, role: { team: 'VILLAGER' } };
            const targetB: Player = { id: 'B', alive: true, role: { team: 'WEREWOLF' } };

            const context = createMockContext([source, targetA, targetB]);

            // Use heal on A and poison on B
            const events = witchRole.onAction(context, source, { healTargetId: 'A', poisonTargetId: 'B' });

            expect(events).toHaveLength(2);
            expect(events.find(e => e.type === 'HEAL_POTION_USED')?.target).toBe(targetA);
            const poisonEvent = events.find(e => e.type === 'PLAYER_DEATH');
            expect(poisonEvent?.target).toBe(targetB);
            expect(poisonEvent?.metadata.reason).toBe('POISON');

            // Try to use again, should return no events because potions are depleted
            const events2 = witchRole.onAction(context, source, { healTargetId: 'A', poisonTargetId: 'B' });
            expect(events2).toHaveLength(0);
        });
    });

    describe('Guard', () => {
        it('should protect a player', () => {
            const guardRole = new Guard();
            const source: Player = { id: 'guard', alive: true, role: guardRole };
            const target: Player = { id: 'A', alive: true, role: { team: 'VILLAGER' } };

            const context = createMockContext([source, target]);

            const events = guardRole.onAction(context, source, { targetId: 'A' });
            expect(events).toHaveLength(1);
            expect(events[0].type).toBe('PROTECT_SET');
            expect(events[0].target).toBe(target);
        });
    });

    describe('Cupid', () => {
        it('should pair two lovers on round 1', () => {
            const cupidRole = new Cupid();
            const source: Player = { id: 'cupid', alive: true, role: cupidRole };
            const targetA: Player = { id: 'A', alive: true, role: { team: 'VILLAGER' } };
            const targetB: Player = { id: 'B', alive: true, role: { team: 'WEREWOLF' } };

            const context = createMockContext([source, targetA, targetB]);

            const events = cupidRole.onAction(context, source, { targetId: 'B' });
            expect(events).toHaveLength(1);
            expect(events[0].type).toBe('LOVER_LINKED');
            expect(events[0].metadata.cupidId).toBe('cupid');
            expect(events[0].metadata.partnerId).toBe('B');

            // Should not work on round 2
            context.round = 2;
            const events2 = cupidRole.onAction(context, source, { targetId: 'B' });
            expect(events2).toHaveLength(0);
        });
    });

    describe('Hunter', () => {
        it('should shoot target upon death', () => {
            const hunterRole = new Hunter();
            const source: Player = { id: 'hunter', alive: true, role: hunterRole };
            const target: Player = { id: 'A', alive: true, role: { team: 'WEREWOLF' } };

            const context = createMockContext([source, target]);

            // Set target
            const nightEvents = hunterRole.onAction(context, source, { targetId: 'A' });
            expect(nightEvents).toHaveLength(1);
            expect(nightEvents[0].type).toBe('HUNTER_TARGET_SET');
            expect(nightEvents[0].target).toBe(target);

            // Hunter shoots upon death (simulated by skills)
            const shootSkill = hunterRole.skills.find(s => s.name === 'Shoot') as any;
            const deathEvents = shootSkill?.onTriggerDeath?.(context, source) || [];
            expect(deathEvents).toHaveLength(1);
            expect(deathEvents[0].type).toBe('ATTEMPT_KILL');
            expect(deathEvents[0].target).toBe(target);
        });
    });

    describe('Jester', () => {
        it('should win immediately if voted out', () => {
            const jesterRole = new Jester();
            const context = createMockContext([]);

            // Jester's normal checkWinCondition returns null
            expect(jesterRole.checkWinCondition(context)).toBeNull();

            // Note: actual win is checked in SocketGateway when a VOTE_ELIMINATION happens.
            // Role tests just ensure no night actions or weird override logic.
            const source: Player = { id: 'jester', alive: true, role: jesterRole };
            expect(jesterRole.onAction(context, source, {})).toHaveLength(0);
        });
    });

    describe('Elder', () => {
        it('should absorb the first wolf attack', () => {
            const elderRole = new Elder();
            const shieldSkill = elderRole.skills.find(s => s.name === 'ElderShield')!;
            const source: Player = { id: 'elder', alive: true, role: elderRole };
            const wolf: Player = { id: 'wolf', alive: true, role: { team: 'WEREWOLF' } };
            const context = createMockContext([source, wolf]);

            const wolfAttackEvent: GameEvent = {
                type: 'ATTEMPT_KILL',
                source: wolf,
                target: source,
                metadata: { reason: 'WOLF_ATTACK' }
            };

            // First attack: intercepted
            const events1 = shieldSkill.onEvent!(context, source, wolfAttackEvent);
            expect(events1).toHaveLength(1);
            expect(events1[0].type).toBe('ELDER_SHIELD_USED');
            expect(wolfAttackEvent.metadata.cancelled).toBe(true);

            // Second attack: passes through
            wolfAttackEvent.metadata.cancelled = false;
            const events2 = shieldSkill.onEvent!(context, source, wolfAttackEvent);
            expect(events2).toHaveLength(0);
        });
    });

    describe('CursedWolf', () => {
        it('should transform into a wolf if bitten by a wolf', () => {
            const cursedRole = new CursedWolf();
            const transformSkill = cursedRole.skills.find(s => s.name === 'CursedTransform') as any;
            const source: Player = { id: 'cursed', alive: true, role: cursedRole };
            const wolf: Player = { id: 'wolf', alive: true, role: { team: 'WEREWOLF' } };
            const context = createMockContext([source, wolf]);

            const wolfAttackEvent: GameEvent = {
                type: 'ATTEMPT_KILL',
                source: wolf,
                target: source,
                metadata: {}
            };

            const events = transformSkill.onEvent(context, source, wolfAttackEvent);
            expect(events).toHaveLength(1);
            expect(events[0].type).toBe('CURSED_WOLF_BITTEN');
            expect(wolfAttackEvent.metadata.cancelled).toBe(true);
            expect(source.role.team).toBe('WEREWOLF'); // Transformation!
            expect(transformSkill.isTransformed()).toBe(true);
        });
    });

    describe('Werewolf', () => {
        it('should emit ATTEMPT_KILL event', () => {
            const wwRole = new Werewolf();
            const source: Player = { id: 'wolf', alive: true, role: wwRole };
            const target: Player = { id: 'vil', alive: true, role: { team: 'VILLAGER' } };
            const context = createMockContext([source, target]);

            const events = wwRole.onAction(context, source, { targetId: 'vil' });
            expect(events).toHaveLength(1);
            expect(events[0].type).toBe('ATTEMPT_KILL');
            expect(events[0].target).toBe(target);
        });
    });

    describe('Guard (additional)', () => {
        it('should NOT allow guard to protect themselves', () => {
            const guardRole = new Guard();
            const source: Player = { id: 'guard', alive: true, role: guardRole };
            const context = createMockContext([source]);

            const events = guardRole.onAction(context, source, { targetId: 'guard' });
            expect(events).toHaveLength(0);
        });

        it('should NOT allow protecting the same player twice in a row', () => {
            const guardRole = new Guard();
            const source: Player = { id: 'guard', alive: true, role: guardRole };
            const target: Player = { id: 'A', alive: true, role: { team: 'VILLAGER' } };
            const context = createMockContext([source, target]);

            // First night: protect A
            guardRole.onAction(context, source, { targetId: 'A' });

            // Simulate new night
            (context as any).phase = GamePhase.NIGHT_INIT;
            guardRole.onPhaseStart!(context);

            // Second night: try to protect A again → should throw
            expect(() => guardRole.onAction(context, source, { targetId: 'A' }))
                .toThrow('Cannot protect the same player twice in a row');
        });
    });

    describe('Witch (additional)', () => {
        it('should be able to use heal and poison independently across turns', () => {
            const witchRole = new Witch();
            const source: Player = { id: 'witch', alive: true, role: witchRole };
            const targetA: Player = { id: 'A', alive: true, role: { team: 'VILLAGER' } };
            const targetB: Player = { id: 'B', alive: true, role: { team: 'WEREWOLF' } };
            const context = createMockContext([source, targetA, targetB]);

            // Use only heal
            const eventsHeal = witchRole.onAction(context, source, { healTargetId: 'A' });
            expect(eventsHeal).toHaveLength(1);
            expect(eventsHeal[0].type).toBe('HEAL_POTION_USED');

            // Heal used up, but poison still available
            const eventsPoison = witchRole.onAction(context, source, { poisonTargetId: 'B' });
            expect(eventsPoison).toHaveLength(1);
            expect(eventsPoison[0].type).toBe('PLAYER_DEATH');
            expect(eventsPoison[0].metadata.reason).toBe('POISON');

            // Both used up
            const eventsEmpty = witchRole.onAction(context, source, { healTargetId: 'A', poisonTargetId: 'B' });
            expect(eventsEmpty).toHaveLength(0);
        });
    });

    describe('CursedWolf (additional)', () => {
        it('should NOT transform when attacked by hunter shot', () => {
            const cursedRole = new CursedWolf();
            const transformSkill = cursedRole.skills.find(s => s.name === 'CursedTransform') as any;
            const source: Player = { id: 'cursed', alive: true, role: cursedRole };
            const hunter: Player = { id: 'hunter', alive: true, role: { team: 'VILLAGER', name: 'Hunter' } };
            const context = createMockContext([source, hunter]);

            const event: GameEvent = {
                type: 'ATTEMPT_KILL',
                source: hunter,
                target: source,
                metadata: { reason: 'HUNTER_SHOT' }
            };

            const events = transformSkill.onEvent(context, source, event);
            expect(events).toHaveLength(0);
            expect(source.role.team).toBe('VILLAGER'); // Still villager
        });
    });
});


