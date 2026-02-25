import { RoomManager } from '../../gateway/RoomManager';

describe('RoomManager', () => {
    let roomManager: RoomManager;

    beforeEach(() => {
        roomManager = new RoomManager();
    });

    afterEach(() => {
        roomManager.destroy();
        jest.clearAllTimers();
    });

    it('should create a room when joinOrCreate is called on a new room', () => {
        const room = roomManager.joinOrCreate('room1', 'player1', 'Alice');
        expect(room).toBeDefined();
        expect(room.id).toBe('room1');
        expect(room.hostId).toBe('player1');
        expect(room.players).toHaveLength(1);
        expect(room.players[0].name).toBe('Alice');
    });

    it('should allow multiple players to join and not duplicate the same player', () => {
        roomManager.joinOrCreate('room1', 'p1', 'Alice');
        const room = roomManager.joinOrCreate('room1', 'p2', 'Bob');
        expect(room.players).toHaveLength(2);

        // Dupe join
        const roomDupe = roomManager.joinOrCreate('room1', 'p1', 'Alice_NewName');
        expect(roomDupe.players).toHaveLength(2); // Still 2
        expect(roomDupe.players.find(p => p.id === 'p1')?.name).toBe('Alice_NewName');
    });

    it('should assign a new host when current host leaves', () => {
        roomManager.joinOrCreate('room1', 'p1', 'Alice');
        roomManager.joinOrCreate('room1', 'p2', 'Bob');

        let room = roomManager.getRoom('room1');
        expect(room?.hostId).toBe('p1');

        roomManager.leaveRoom('room1', 'p1');

        room = roomManager.getRoom('room1');
        expect(room?.players).toHaveLength(1);
        expect(room?.hostId).toBe('p2');
    });

    it('should map sockets correctly', () => {
        roomManager.joinOrCreate('room1', 'p1', 'Alice');
        roomManager.updateSocketId('room1', 'p1', 'socket-abc');

        const playerId = roomManager.getPlayerIdBySocketId('room1', 'socket-abc');
        expect(playerId).toBe('p1');

        const map = roomManager.getSocketMapping('socket-abc');
        expect(map).toEqual({ roomId: 'room1', playerId: 'p1' });
    });

    it('should correctly mark player as ready/unready', () => {
        roomManager.joinOrCreate('room1', 'p1', 'Alice');
        roomManager.setPlayerReady('room1', 'p1', true);

        const room = roomManager.getRoom('room1');
        expect(room?.players[0].ready).toBe(true);

        roomManager.setPlayerReady('room1', 'p1', false);
        expect(room?.players[0].ready).toBe(false);
    });

    it('should delete room when last player leaves', () => {
        roomManager.joinOrCreate('room1', 'p1', 'Alice');
        roomManager.leaveRoom('room1', 'p1');

        expect(roomManager.getRoom('room1')).toBeUndefined();
    });

    it('should startGame if host requests and config matches player count', () => {
        roomManager.joinOrCreate('room1', 'p1', 'Alice');
        roomManager.joinOrCreate('room1', 'p2', 'Bob');

        const config = {
            Werewolf: 1,
            Villager: 1
        };

        const started = roomManager.startGame('room1', config);
        expect(started).toBe(true);

        const room = roomManager.getRoom('room1');
        expect(room?.engine).toBeDefined();
        expect(room?.players[0].roleName).toBeDefined();
        expect(room?.players[1].roleName).toBeDefined();
    });

    it('should fail startGame if player count does not match role count', () => {
        roomManager.joinOrCreate('room1', 'p1', 'Alice');

        const config = {
            Werewolf: 1,
            Villager: 1
        }; // total 2 roles, but only 1 player

        const started = roomManager.startGame('room1', config);
        expect(started).toBe(false);
    });
});
