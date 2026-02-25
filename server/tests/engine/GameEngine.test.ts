import { GameEngine } from '../../engine/GameEngine';
import { GamePhase, Player } from '../../types/GameTypes';
import { Role } from '../../roles/Role';

describe('GameEngine', () => {
    let engine: GameEngine;

    beforeEach(() => {
        engine = new GameEngine();
    });

    it('should initialize and start game correctly', () => {
        const players: Player[] = [
            { id: '1', alive: true, role: { name: 'Villager', team: 'VILLAGER' } as Role },
            { id: '2', alive: true, role: { name: 'Werewolf', team: 'WEREWOLF' } as Role }
        ];

        engine.startGame(players);

        expect(engine.state.players).toEqual(players);
        expect(engine.state.round).toBe(1);
        expect(engine.state.phase).toBe(GamePhase.NIGHT_INIT);
    });

    it('should transition phases and call callbacks', () => {
        let callbackPhase: GamePhase | null = null;
        engine.onPhaseChange = (phase) => {
            callbackPhase = phase;
        };

        engine.setPhase(GamePhase.DAY_DISCUSSION);
        expect(engine.state.phase).toBe(GamePhase.DAY_DISCUSSION);
        expect(callbackPhase).toBe(GamePhase.DAY_DISCUSSION);
    });

    it('should trigger onPhaseStart for alive roles', () => {
        let called = false;
        const mockRole = {
            name: 'Villager',
            team: 'VILLAGER',
            onPhaseStart: () => { called = true; }
        } as unknown as Role;

        const players: Player[] = [
            { id: '1', alive: true, role: mockRole }
        ];

        engine.startGame(players);
        expect(called).toBe(true);
    });

    it('should register night actions', () => {
        const players: Player[] = [
            { id: '1', alive: true, role: {} as Role }
        ];
        engine.startGame(players);

        const spy = jest.spyOn(engine.actionPipeline, 'registerAction');
        engine.handleNightAction('1', { targetId: '2' });

        expect(spy).toHaveBeenCalledWith(players[0], { targetId: '2' });
    });

    it('should properly build role visibility for wolves', () => {
        const players: Player[] = [
            { id: '1', alive: true, role: { name: 'Werewolf', displayName: 'Ma Sói', team: 'WEREWOLF' } as Role },
            { id: '2', alive: true, role: { name: 'Werewolf', displayName: 'Ma Sói', team: 'WEREWOLF' } as Role },
            { id: '3', alive: true, role: { name: 'Villager', displayName: 'Dân', team: 'VILLAGER' } as Role },
            { id: '4', alive: true, role: { name: 'CursedWolf', displayName: 'Sói nguyền', team: 'VILLAGER' } as Role } // not wolf yet
        ];
        engine.startGame(players);

        const visibilityP1 = engine.buildRoleVisibility('1');
        // P1 should see P2
        expect(visibilityP1['2']).toBeDefined();
        expect(visibilityP1['2'].team).toBe('WEREWOLF');
        // P1 should not see P3 or P4
        expect(visibilityP1['3']).toBeUndefined();
        expect(visibilityP1['4']).toBeUndefined();
    });

    it('should store and use Seer investigation history', () => {
        const players: Player[] = [
            { id: 'seer', alive: true, role: { name: 'Seer', displayName: 'Tiên tri', team: 'VILLAGER' } as Role },
            { id: 'wolf', alive: true, role: { name: 'Werewolf', displayName: 'Ma Sói', team: 'WEREWOLF' } as Role },
            { id: 'villager', alive: true, role: { name: 'Villager', displayName: 'Dân', team: 'VILLAGER' } as Role }
        ];
        engine.startGame(players);

        // Seer investigates 'wolf'
        engine.recordSeerInvestigation('seer', 'wolf');
        expect(engine.getSeerHistory('seer')).toEqual({ 'wolf': 'WEREWOLF' });

        const visibility = engine.buildRoleVisibility('seer');
        expect(visibility['wolf']).toBeDefined();
        expect(visibility['wolf'].team).toBe('WEREWOLF');
        expect(visibility['villager']).toBeUndefined(); // hasn't investigated villager
    });

    it('should show all roles to dead players', () => {
        const players: Player[] = [
            { id: 'dead', alive: false, role: { name: 'Villager', displayName: 'Dân', team: 'VILLAGER' } as Role },
            { id: 'alive_wolf', alive: true, role: { name: 'Werewolf', displayName: 'Ma Sói', team: 'WEREWOLF' } as Role }
        ];
        engine.startGame(players);

        const visibility = engine.buildRoleVisibility('dead');
        // Should see alive_wolf
        expect(visibility['alive_wolf']).toBeDefined();
        expect(visibility['alive_wolf'].team).toBe('WEREWOLF');
    });

    it('should build visibility for lovers', () => {
        const players: Player[] = [
            { id: 'cupid', alive: true, role: { name: 'Cupid', displayName: 'Tình yêu', team: 'VILLAGER' } as Role },
            { id: 'partner', alive: true, role: { name: 'Villager', displayName: 'Dân', team: 'VILLAGER' } as Role },
        ];
        engine.startGame(players);
        engine.registerLovers('cupid', 'partner');

        const cupidVis = engine.buildRoleVisibility('cupid');
        expect(cupidVis['partner']).toBeDefined();
        expect(cupidVis['partner'].roleName).toBe('Villager');

        const partnerVis = engine.buildRoleVisibility('partner');
        expect(partnerVis['cupid']).toBeDefined();
        expect(partnerVis['cupid'].roleName).toBe('Cupid');
    });

    it('should resolve night and update round/phase if game continues', () => {
        const players: Player[] = [
            { id: '1', alive: true, role: { team: 'VILLAGER' } as Role },
            { id: '2', alive: true, role: { team: 'WEREWOLF' } as Role },
            { id: '3', alive: true, role: { team: 'VILLAGER' } as Role },
        ];
        engine.startGame(players); // Round=1, Phase=NIGHT_INIT

        engine.resolveNight();

        // Wolves=1, Others=2 -> game continues
        expect(engine.state.round).toBe(2);
        expect(engine.state.phase).toBe(GamePhase.DAY_ANNOUNCE);
    });

    it('should check win condition on night resolve and stop if won', () => {
        const players: Player[] = [
            { id: '1', alive: true, role: { team: 'WEREWOLF' } as Role },
            { id: '2', alive: true, role: { team: 'WEREWOLF' } as Role },
        ];
        engine.startGame(players);

        engine.resolveNight();

        // Wolves >= Others -> WOLVES win -> END
        expect(engine.state.phase).toBe(GamePhase.END);
        expect(engine.state.round).toBe(1); // round doesn't increment if game ended
    });
});
