import { SocketGateway } from '../../gateway/SocketGateway';
import { RoomManager } from '../../gateway/RoomManager';
import { GameEngine } from '../../engine/GameEngine';
import { Player, GameConfig, DEFAULT_CONFIG } from '../../types/GameTypes';
import { Server } from 'socket.io'; // We might have to mock this

// The broadcastVoiceState method is private. We can access it via (gateway as any).broadcastVoiceState
// However, it relies heavily on RoomManager and GameEngine state, and it emits via this.io.
// To test it without a real socket connection, we can mock `this.emitTo` or `this.io.to`.

describe('Voice Logic (SocketGateway.broadcastVoiceState)', () => {

    let gateway: any;
    let roomManager: RoomManager;
    let mockEmitTo: jest.Mock;

    beforeEach(() => {
        // Mock socket.io Server
        const mockToReturnType = {
            emit: jest.fn()
        };
        const mockServer = {
            on: jest.fn(),
            to: jest.fn().mockReturnValue(mockToReturnType)
        };
        gateway = new SocketGateway(mockServer as any);
        roomManager = gateway.roomManager;

        // Mock emitTo to capture what is sent to each player
        mockEmitTo = jest.fn();
        gateway.emitTo = mockEmitTo;

        // Create a fake room with an engine. We bypass private modifier with (any)
        const roomData: any = {
            id: 'room1',
            hostId: 'p1',
            players: [],
            roleConfig: {},
            timerConfig: DEFAULT_CONFIG.timers,
            engine: new GameEngine(DEFAULT_CONFIG)
        };
        (roomManager as any).rooms.set('room1', roomData);
    });

    afterEach(() => {
        // Clear GC interval to prevent open handles in Jest
        roomManager.destroy();
    });

    const addPlayer = (id: string, roleName: string, alive: boolean) => {
        const room = roomManager.getRoom('room1')!;
        room.players.push({
            id,
            socketId: `socket_${id}`,
            name: `Player ${id}`,
            ready: true,
            alive,
            lastSeen: Date.now(),
            isMicMuted: false,
            isSpeakerMuted: false,
            online: true,
            roleName
        });

        // Also add to engine state
        if (room.engine) {
            room.engine.state.players.push({
                id,
                alive,
                role: { name: roleName, team: roleName === 'Werewolf' ? 'WEREWOLF' : 'VILLAGER' } as any
            });
        }
    };

    const getVoiceStateFor = (playerId: string) => {
        const call = mockEmitTo.mock.calls.find(call => call[0] === playerId && call[1] === 'voice_state');
        return call ? call[2] : null;
    };

    describe('LOBBY Phase', () => {
        it('should allow everyone to speak and hear everyone else', () => {
            addPlayer('p1', 'Villager', true);
            addPlayer('p2', 'Werewolf', true);
            addPlayer('p3', 'Seer', true);

            gateway.broadcastVoiceState('room1', 'LOBBY');

            expect(getVoiceStateFor('p1')).toEqual({ canSpeak: true, canHear: ['p2', 'p3'], deafTo: [], phase: 'LOBBY' });
            expect(getVoiceStateFor('p2')).toEqual({ canSpeak: true, canHear: ['p1', 'p3'], deafTo: [], phase: 'LOBBY' });
            expect(getVoiceStateFor('p3')).toEqual({ canSpeak: true, canHear: ['p1', 'p2'], deafTo: [], phase: 'LOBBY' });
        });

        it('should allow a single player to speak but hear nobody (empty canHear)', () => {
            addPlayer('lonely', 'Villager', true);

            gateway.broadcastVoiceState('room1', 'LOBBY');

            expect(getVoiceStateFor('lonely')).toEqual({ canSpeak: true, canHear: [], deafTo: [], phase: 'LOBBY' });
        });
    });

    describe('DAY Phase', () => {
        it('should allow alive players to talk to each other and be deaf to dead players', () => {
            addPlayer('alive1', 'Villager', true);
            addPlayer('alive2', 'Werewolf', true);
            addPlayer('dead1', 'Villager', false);

            gateway.broadcastVoiceState('room1', 'DAY');

            expect(getVoiceStateFor('alive1')).toEqual({ canSpeak: true, canHear: ['alive2'], deafTo: ['dead1'], phase: 'DAY' });
            expect(getVoiceStateFor('alive2')).toEqual({ canSpeak: true, canHear: ['alive1'], deafTo: ['dead1'], phase: 'DAY' });
        });

        it('should allow dead players to hear everyone (alive+dead) but only be heard by other dead players', () => {
            addPlayer('alive1', 'Villager', true);
            addPlayer('dead1', 'Villager', false);
            addPlayer('dead2', 'Werewolf', false);

            gateway.broadcastVoiceState('room1', 'DAY');

            // Dead player hears dead2 + alive1
            expect(getVoiceStateFor('dead1')).toEqual({ canSpeak: true, canHear: ['dead2', 'alive1'], deafTo: ['alive1'], phase: 'DAY' });
            expect(getVoiceStateFor('dead2')).toEqual({ canSpeak: true, canHear: ['dead1', 'alive1'], deafTo: ['alive1'], phase: 'DAY' });

            // Alive player cannot hear dead1 or dead2
            expect(getVoiceStateFor('alive1')).toEqual({ canSpeak: true, canHear: [], deafTo: ['dead1', 'dead2'], phase: 'DAY' });
        });

        it('should perfectly isolate a single surviving player', () => {
            addPlayer('survivor', 'Villager', true);
            addPlayer('dead1', 'Werewolf', false);

            gateway.broadcastVoiceState('room1', 'DAY');

            expect(getVoiceStateFor('survivor')).toEqual({ canSpeak: true, canHear: [], deafTo: ['dead1'], phase: 'DAY' });
        });
    });

    describe('NIGHT_WOLVES Phase', () => {
        it('should allow only alive wolves to speak and hear each other, deafening non-wolves', () => {
            addPlayer('wolf1', 'Werewolf', true);
            addPlayer('wolf2', 'Werewolf', true);
            addPlayer('vil1', 'Villager', true);

            gateway.broadcastVoiceState('room1', 'NIGHT_WOLVES');

            expect(getVoiceStateFor('wolf1')).toEqual({ canSpeak: true, canHear: ['wolf2'], deafTo: ['vil1'], phase: 'NIGHT_WOLVES' });
            expect(getVoiceStateFor('vil1')).toEqual({ canSpeak: false, canHear: [], deafTo: ['wolf1', 'wolf2'], phase: 'NIGHT_WOLVES' });
        });

        it('should allow dead players to hear the wolf chat (and other dead players)', () => {
            addPlayer('wolf1', 'Werewolf', true);
            addPlayer('vil1', 'Villager', true);
            addPlayer('dead1', 'Seer', false);

            gateway.broadcastVoiceState('room1', 'NIGHT_WOLVES');

            expect(getVoiceStateFor('dead1')).toEqual({ canSpeak: true, canHear: ['wolf1'], deafTo: ['vil1'], phase: 'NIGHT_WOLVES' });
        });

        it('should allow Lovers (Villager + Villager) to hear each other and ignore wolf chat', () => {
            addPlayer('lover1', 'Villager', true);
            addPlayer('lover2', 'Seer', true);
            addPlayer('wolf1', 'Werewolf', true);

            const room = roomManager.getRoom('room1')!;
            room.engine!.state.loverIds = { cupidId: 'lover1', partnerId: 'lover2' };

            gateway.broadcastVoiceState('room1', 'NIGHT_WOLVES');

            // Wolf only hears self (in array)
            expect(getVoiceStateFor('wolf1')).toEqual({ canSpeak: true, canHear: [], deafTo: ['lover1', 'lover2'], phase: 'NIGHT_WOLVES' });

            // Lovers can talk to each other
            expect(getVoiceStateFor('lover1')).toEqual({ canSpeak: true, canHear: ['lover2'], deafTo: ['wolf1'], phase: 'NIGHT_WOLVES' });
            expect(getVoiceStateFor('lover2')).toEqual({ canSpeak: true, canHear: ['lover1'], deafTo: ['wolf1'], phase: 'NIGHT_WOLVES' });
        });

        it('should force Lover (Wolf) into Wolf chat and silence the Lover (Villager)', () => {
            addPlayer('wolf_lover', 'Werewolf', true);
            addPlayer('vil_lover', 'Villager', true);
            addPlayer('other_wolf', 'Werewolf', true);

            const room = roomManager.getRoom('room1')!;
            room.engine!.state.loverIds = { cupidId: 'wolf_lover', partnerId: 'vil_lover' };

            gateway.broadcastVoiceState('room1', 'NIGHT_WOLVES');

            // Wolf-lover chats with other wolf
            expect(getVoiceStateFor('wolf_lover')).toEqual({ canSpeak: true, canHear: ['other_wolf'], deafTo: ['vil_lover'], phase: 'NIGHT_WOLVES' });
            expect(getVoiceStateFor('other_wolf')).toEqual({ canSpeak: true, canHear: ['wolf_lover'], deafTo: ['vil_lover'], phase: 'NIGHT_WOLVES' });

            // Villager-lover is suspended entirely
            expect(getVoiceStateFor('vil_lover')).toEqual({ canSpeak: false, canHear: [], deafTo: ['wolf_lover', 'other_wolf'], phase: 'NIGHT_WOLVES' });
        });

        it('should process Lovers (Wolf + Wolf) naturally entirely within Wolf chat', () => {
            addPlayer('wolf1', 'Werewolf', true);
            addPlayer('wolf2', 'Werewolf', true);
            addPlayer('vil1', 'Villager', true);

            const room = roomManager.getRoom('room1')!;
            room.engine!.state.loverIds = { cupidId: 'wolf1', partnerId: 'wolf2' };

            gateway.broadcastVoiceState('room1', 'NIGHT_WOLVES');

            expect(getVoiceStateFor('wolf1')).toEqual({ canSpeak: true, canHear: ['wolf2'], deafTo: ['vil1'], phase: 'NIGHT_WOLVES' });
            expect(getVoiceStateFor('vil1')).toEqual({ canSpeak: false, canHear: [], deafTo: ['wolf1', 'wolf2'], phase: 'NIGHT_WOLVES' });
        });
    });

    describe('NIGHT_SILENT Phase', () => {
        it('should silence all normal alive players', () => {
            addPlayer('wolf1', 'Werewolf', true);
            addPlayer('vil1', 'Villager', true);

            gateway.broadcastVoiceState('room1', 'NIGHT_SILENT');

            expect(getVoiceStateFor('wolf1')).toEqual({ canSpeak: false, canHear: [], deafTo: ['vil1'], phase: 'NIGHT_SILENT' });
            expect(getVoiceStateFor('vil1')).toEqual({ canSpeak: false, canHear: [], deafTo: ['wolf1'], phase: 'NIGHT_SILENT' });
        });

        it('should allow Lovers (Villager + Villager) to speak privately', () => {
            addPlayer('lover1', 'Villager', true);
            addPlayer('lover2', 'Seer', true);
            addPlayer('stranger', 'Villager', true);

            const room = roomManager.getRoom('room1')!;
            room.engine!.state.loverIds = { cupidId: 'lover1', partnerId: 'lover2' };

            gateway.broadcastVoiceState('room1', 'NIGHT_SILENT');

            expect(getVoiceStateFor('lover1')).toEqual({ canSpeak: true, canHear: ['lover2'], deafTo: ['stranger'], phase: 'NIGHT_SILENT' });
            expect(getVoiceStateFor('stranger')).toEqual({ canSpeak: false, canHear: [], deafTo: ['lover1', 'lover2'], phase: 'NIGHT_SILENT' });
        });

        it('should silence Lovers (Wolf + Villager) due to Wolf contamination (per current code rules)', () => {
            addPlayer('wolf_lover', 'Werewolf', true);
            addPlayer('vil_lover', 'Villager', true);

            const room = roomManager.getRoom('room1')!;
            room.engine!.state.loverIds = { cupidId: 'wolf_lover', partnerId: 'vil_lover' };

            gateway.broadcastVoiceState('room1', 'NIGHT_SILENT');

            // In current logic: activeLoverIds excludes any pair involving a Wolf. So both are treated as regular players.
            expect(getVoiceStateFor('wolf_lover')).toEqual({ canSpeak: false, canHear: [], deafTo: ['vil_lover'], phase: 'NIGHT_SILENT' });
            expect(getVoiceStateFor('vil_lover')).toEqual({ canSpeak: false, canHear: [], deafTo: ['wolf_lover'], phase: 'NIGHT_SILENT' });
        });

        it('should allow dead players to hear the active Lovers (Villager + Villager)', () => {
            addPlayer('lover1', 'Villager', true);
            addPlayer('lover2', 'Villager', true);
            addPlayer('dead1', 'Werewolf', false);

            const room = roomManager.getRoom('room1')!;
            room.engine!.state.loverIds = { cupidId: 'lover1', partnerId: 'lover2' };

            gateway.broadcastVoiceState('room1', 'NIGHT_SILENT');

            expect(getVoiceStateFor('dead1')).toEqual({ canSpeak: true, canHear: ['lover1', 'lover2'], deafTo: [], phase: 'NIGHT_SILENT' });
        });
    });

    describe('NIGHT_CUPID_PICK Phase', () => {
        it('should enforce absolute silence on ALL alive players regardless of role', () => {
            addPlayer('cupid', 'Cupid', true);
            addPlayer('wolf', 'Werewolf', true);
            addPlayer('vil', 'Villager', true);

            gateway.broadcastVoiceState('room1', 'NIGHT_CUPID_PICK');

            expect(getVoiceStateFor('cupid')).toEqual({ canSpeak: false, canHear: [], deafTo: ['wolf', 'vil'], phase: 'NIGHT_CUPID_PICK' });
            expect(getVoiceStateFor('wolf')).toEqual({ canSpeak: false, canHear: [], deafTo: ['cupid', 'vil'], phase: 'NIGHT_CUPID_PICK' });
            expect(getVoiceStateFor('vil')).toEqual({ canSpeak: false, canHear: [], deafTo: ['cupid', 'wolf'], phase: 'NIGHT_CUPID_PICK' });
        });

        it('should allow dead players to converse with each other but not interfere with the alive list', () => {
            // Even though Cupid pick is Night 1 where nobody should be dead, if they are, they can talk to each other
            addPlayer('alive1', 'Villager', true);
            addPlayer('dead1', 'Villager', false);
            addPlayer('dead2', 'Werewolf', false);

            gateway.broadcastVoiceState('room1', 'NIGHT_CUPID_PICK');

            expect(getVoiceStateFor('dead1')).toEqual({ canSpeak: true, canHear: ['dead2'], deafTo: ['alive1'], phase: 'NIGHT_CUPID_PICK' });
            expect(getVoiceStateFor('alive1')).toEqual({ canSpeak: false, canHear: [], deafTo: [], phase: 'NIGHT_CUPID_PICK' });
        });
    });

});
