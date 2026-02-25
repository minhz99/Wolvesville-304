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
        room.engine!.state.players.push({
            id,
            alive,
            role: { name: roleName, team: roleName === 'Werewolf' ? 'WEREWOLF' : 'VILLAGER' } as any
        });
    };

    const getVoiceStateFor = (playerId: string) => {
        const call = mockEmitTo.mock.calls.find(call => call[0] === playerId && call[1] === 'voice_state');
        return call ? call[2] : null;
    };

    it('LOBBY Phase: Everyone can speak and hear everyone else', () => {
        addPlayer('p1', 'Villager', true);
        addPlayer('p2', 'Werewolf', true);

        gateway.broadcastVoiceState('room1', 'LOBBY');

        expect(getVoiceStateFor('p1')).toEqual({
            canSpeak: true,
            canHear: ['p2'],
            deafTo: [],
            phase: 'LOBBY'
        });

        expect(getVoiceStateFor('p2')).toEqual({
            canSpeak: true,
            canHear: ['p1'],
            deafTo: [],
            phase: 'LOBBY'
        });
    });

    it('DAY Phase: Alive players can speak and hear each other. Dead players can hear everyone but ONLY speak to dead players.', () => {
        addPlayer('alive1', 'Villager', true);
        addPlayer('alive2', 'Villager', true);
        addPlayer('dead1', 'Villager', false);
        addPlayer('dead2', 'Werewolf', false);

        gateway.broadcastVoiceState('room1', 'DAY');

        // Alive player
        expect(getVoiceStateFor('alive1')).toEqual({
            canSpeak: true,
            canHear: ['alive2'], // can hear other alive players
            deafTo: ['dead1', 'dead2'], // deaf to dead players
            phase: 'DAY'
        });

        // Dead player
        expect(getVoiceStateFor('dead1')).toEqual({
            canSpeak: true,
            canHear: ['dead2', 'alive1', 'alive2'], // can hear everyone
            deafTo: ['alive1', 'alive2'], // alive players are deaf to them
            phase: 'DAY'
        });
    });

    it('NIGHT_WOLVES Phase: Wolves can speak/hear each other. Non-wolves are silenced.', () => {
        addPlayer('wolf1', 'Werewolf', true);
        addPlayer('wolf2', 'Werewolf', true);
        addPlayer('vil1', 'Villager', true);
        addPlayer('dead_wolf', 'Werewolf', false);

        gateway.broadcastVoiceState('room1', 'NIGHT_WOLVES');

        // Alive Wolf
        expect(getVoiceStateFor('wolf1')).toEqual({
            canSpeak: true,
            canHear: ['wolf2'],
            deafTo: ['dead_wolf', 'vil1'],
            phase: 'NIGHT_WOLVES'
        });

        // Alive Villager
        expect(getVoiceStateFor('vil1')).toEqual({
            canSpeak: false,
            canHear: [],
            deafTo: ['dead_wolf', 'wolf1', 'wolf2'],
            phase: 'NIGHT_WOLVES'
        });

        // Dead player
        expect(getVoiceStateFor('dead_wolf')).toEqual({
            canSpeak: true,
            canHear: ['wolf1', 'wolf2'], // dead can hear wolves
            deafTo: ['vil1'], // deaf to alive non-wolves (and alive non-wolves are deaf to them)
            phase: 'NIGHT_WOLVES'
        });
    });

    it('NIGHT_WOLVES Phase (Lovers): Lovers can hear each other. But if one is a wolf, the wolf participates in wolf chat, and only they can hear their non-wolf lover.', () => {
        addPlayer('wolf_lover', 'Werewolf', true);
        addPlayer('vil_lover', 'Villager', true);
        addPlayer('other_wolf', 'Werewolf', true);

        // Set up lovers
        const room = roomManager.getRoom('room1')!;
        room.engine!.state.loverIds = { cupidId: 'wolf_lover', partnerId: 'vil_lover' };

        gateway.broadcastVoiceState('room1', 'NIGHT_WOLVES');

        // Alive Wolf (is also lover)
        expect(getVoiceStateFor('wolf_lover')).toEqual({
            canSpeak: true,
            canHear: ['other_wolf'], // In wolf chat, hears wolves
            deafTo: ['vil_lover'], // Cannot hear lover during wolf chat
            phase: 'NIGHT_WOLVES'
        });

        // Alive Villager (is lover)
        expect(getVoiceStateFor('vil_lover')).toEqual({
            canSpeak: false, // Since their partner is a wolf, lover chat is suspended during wolf phase
            canHear: [],
            deafTo: ['wolf_lover', 'other_wolf'],
            phase: 'NIGHT_WOLVES'
        });
    });

    it('NIGHT_SILENT Phase: Lovers can speak to each other. Everyone else is silent.', () => {
        addPlayer('lover1', 'Villager', true);
        addPlayer('lover2', 'Villager', true);
        addPlayer('lonely', 'Villager', true);

        // Set up lovers
        const room = roomManager.getRoom('room1')!;
        room.engine!.state.loverIds = { cupidId: 'lover1', partnerId: 'lover2' };

        gateway.broadcastVoiceState('room1', 'NIGHT_SILENT');

        // Lover
        expect(getVoiceStateFor('lover1')).toEqual({
            canSpeak: true,
            canHear: ['lover2'],
            deafTo: ['lonely'],
            phase: 'NIGHT_SILENT'
        });

        // Lonely
        expect(getVoiceStateFor('lonely')).toEqual({
            canSpeak: false,
            canHear: [],
            deafTo: ['lover1', 'lover2'],
            phase: 'NIGHT_SILENT'
        });
    });

    it('NIGHT_CUPID_PICK Phase: Entirely silent for everyone, no lovers yet.', () => {
        addPlayer('cupid', 'Cupid', true);
        addPlayer('vil', 'Villager', true);

        gateway.broadcastVoiceState('room1', 'NIGHT_CUPID_PICK');

        expect(getVoiceStateFor('cupid')).toEqual({
            canSpeak: false,
            canHear: [],
            deafTo: ['vil'],
            phase: 'NIGHT_CUPID_PICK'
        });

        expect(getVoiceStateFor('vil')).toEqual({
            canSpeak: false,
            canHear: [],
            deafTo: ['cupid'],
            phase: 'NIGHT_CUPID_PICK'
        });
    });

});
