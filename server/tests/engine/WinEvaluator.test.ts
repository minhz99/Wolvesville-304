import { WinEvaluator } from '../../engine/WinEvaluator';
import { GameContext, GamePhase, Player } from '../../types/GameTypes';
import { DEFAULT_CONFIG } from '../../types/GameTypes';

describe('WinEvaluator', () => {
    let evaluator: WinEvaluator;

    beforeEach(() => {
        evaluator = new WinEvaluator();
    });

    const createMockContext = (players: Player[], loverIds?: { cupidId: string, partnerId: string }): GameContext => {
        return {
            players,
            phase: GamePhase.CHECK_WIN,
            round: 1,
            config: DEFAULT_CONFIG,
            getPlayer: (id: string) => players.find(p => p.id === id),
            getAlivePlayers: () => players.filter(p => p.alive),
            getAllPlayers: () => players,
            getLoverIds: () => loverIds,
        } as GameContext;
    };

    it('should return VILLAGER when all wolves are dead', () => {
        const players: Player[] = [
            { id: '1', alive: true, role: { team: 'VILLAGER' } },
            { id: '2', alive: true, role: { team: 'VILLAGER' } },
            { id: '3', alive: false, role: { team: 'WEREWOLF' } } // Dead wolf
        ];
        const context = createMockContext(players);
        expect(evaluator.evaluate(context)).toBe('VILLAGER');
    });

    it('should return WEREWOLF when wolves >= others', () => {
        const players: Player[] = [
            { id: '1', alive: true, role: { team: 'WEREWOLF' } },
            { id: '2', alive: true, role: { team: 'WEREWOLF' } },
            { id: '3', alive: true, role: { team: 'VILLAGER' } },
            { id: '4', alive: true, role: { team: 'VILLAGER' } }
        ];
        const context = createMockContext(players);
        expect(evaluator.evaluate(context)).toBe('WEREWOLF');
    });

    it('should return null when wolves < others and wolves > 0', () => {
        const players: Player[] = [
            { id: '1', alive: true, role: { team: 'WEREWOLF' } },
            { id: '2', alive: true, role: { team: 'VILLAGER' } },
            { id: '3', alive: true, role: { team: 'VILLAGER' } },
        ];
        const context = createMockContext(players);
        expect(evaluator.evaluate(context)).toBeNull();
    });

    it('should return LOVER when lovers are alive and only 1 other person max is alive', () => {
        // Lover win is now handled by Cupid's role-specific checkWinCondition (via CupidLinkSkill)
        // Mock the Cupid role with a checkWinCondition that returns 'LOVER' when conditions match
        const players: Player[] = [
            {
                id: '1', alive: true, role: {
                    team: 'VILLAGER',
                    checkWinCondition: (ctx: any) => {
                        const alive = ctx.getAlivePlayers();
                        if (alive.length <= 3) return 'LOVER';
                        return null;
                    }
                }
            }, // Cupid/Lover 1
            { id: '2', alive: true, role: { team: 'WEREWOLF' } }, // Lover 2
            { id: '3', alive: true, role: { team: 'VILLAGER' } }, // Other
            { id: '4', alive: false, role: { team: 'VILLAGER' } } // Dead
        ];
        const loverIds = { cupidId: '1', partnerId: '2' };
        const context = createMockContext(players, loverIds);
        expect(evaluator.evaluate(context)).toBe('LOVER');
    });

    it('should NOT return LOVER when lovers are alive but >1 others are alive', () => {
        // Here, length of alive players > 3
        const players: Player[] = [
            { id: '1', alive: true, role: { team: 'VILLAGER' } }, // Cupid/Lover 1
            { id: '2', alive: true, role: { team: 'WEREWOLF' } }, // Lover 2
            { id: '3', alive: true, role: { team: 'VILLAGER' } }, // Other 1
            { id: '4', alive: true, role: { team: 'VILLAGER' } }  // Other 2
        ];
        const loverIds = { cupidId: '1', partnerId: '2' };
        const context = createMockContext(players, loverIds);

        // Wait, wolves = 1, others = 3 -> evaluate should return null
        expect(evaluator.evaluate(context)).toBeNull();
    });

    it('should use role-specific checkWinCondition if provided', () => {
        // Jester mocked role wins immediately
        const players: Player[] = [
            { id: '1', alive: true, role: { team: 'WEREWOLF' } },
            { id: '2', alive: true, role: { team: 'SOLO', checkWinCondition: () => 'JESTER' } },
        ];
        const context = createMockContext(players);
        expect(evaluator.evaluate(context)).toBe('JESTER');
    });
});
