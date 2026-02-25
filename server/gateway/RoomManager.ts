import { GameEngine } from '../engine/GameEngine';
import { Player, GameConfig, DEFAULT_CONFIG } from '../types/GameTypes';
import { Villager } from '../roles/Villager';
import { Werewolf } from '../roles/Werewolf';
import { Seer } from '../roles/Seer';
import { Guard } from '../roles/Guard';
import { Witch } from '../roles/Witch';
import { Hunter } from '../roles/Hunter';
import { Cupid } from '../roles/Cupid';
import { Jester } from '../roles/Jester';
import { Elder } from '../roles/Elder';
import { CursedWolf } from '../roles/CursedWolf';
import { Role } from '../roles/Role';

export interface RoomPlayer {
    id: string; // Persistent ID (e.g. from localStorage)
    socketId: string; // Current transient socket ID
    name: string;
    ready: boolean;
    alive: boolean;
    roleName?: string;
    lastSeen: number; // For garbage collection
    isMicMuted: boolean;
    isSpeakerMuted: boolean;
    online: boolean;
}

export interface RoomData {
    id: string;
    hostId: string;
    players: RoomPlayer[];
    engine: GameEngine | null;
    roleConfig: Record<string, number>;
    timerConfig?: GameConfig['timers'];
    lastActivity: number; // For garbage collection
}

// Role factory map
const ROLE_FACTORY: Record<string, () => Role> = {
    Werewolf: () => new Werewolf(),
    Guard: () => new Guard(),
    Seer: () => new Seer(),
    Witch: () => new Witch(),
    Villager: () => new Villager(),
    Hunter: () => new Hunter(),
    Cupid: () => new Cupid(),
    Jester: () => new Jester(),
    Elder: () => new Elder(),
    CursedWolf: () => new CursedWolf(),
};

export class RoomManager {
    private rooms: Map<string, RoomData> = new Map();
    private playerRooms: Map<string, string> = new Map();
    private socketToRoom: Map<string, { roomId: string, playerId: string }> = new Map();
    private gcInterval: NodeJS.Timeout | null = null;

    constructor() {
        this.startGarbageCollection();
    }

    private startGarbageCollection() {
        if (this.gcInterval) clearInterval(this.gcInterval);

        // Run GC every 30 minutes
        this.gcInterval = setInterval(() => {
            const now = Date.now();
            const ROOM_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours
            const PLAYER_TIMEOUT = 30 * 60 * 1000;   // 30 minutes

            for (const [roomId, room] of this.rooms.entries()) {
                // Delete stale rooms entirely
                if (now - room.lastActivity > ROOM_TIMEOUT) {
                    // Force cleanup
                    room.players.forEach(p => this.playerRooms.delete(p.id));
                    this.rooms.delete(roomId);
                    console.log(`[GC] Deleted stale room: ${roomId}`);
                    continue;
                }

                // Or remove individual stale players
                const originalCount = room.players.length;
                room.players = room.players.filter(p => {
                    const keep = now - p.lastSeen <= PLAYER_TIMEOUT;
                    if (!keep) {
                        this.playerRooms.delete(p.id);
                        console.log(`[GC] Removed stale player ${p.id} from room ${roomId}`);
                    }
                    return keep;
                });

                // Update host if host got removed
                if (room.players.length !== originalCount && room.players.length > 0) {
                    if (!room.players.find(p => p.id === room.hostId)) {
                        room.hostId = room.players[0].id;
                    }
                }

                // If empty -> destroy
                if (room.players.length === 0) {
                    this.rooms.delete(roomId);
                    console.log(`[GC] Deleted empty room: ${roomId}`);
                }
            }
        }, 30 * 60 * 1000); // 30 mins
    }

    public updateSocketId(roomId: string, playerId: string, socketId: string): void {
        const room = this.rooms.get(roomId);
        if (!room) return;
        const player = room.players.find(p => p.id === playerId);
        if (player) {
            // Clean up old mapping if any
            if (player.socketId) this.socketToRoom.delete(player.socketId);

            player.socketId = socketId;
            player.lastSeen = Date.now();
            player.online = true;
            this.socketToRoom.set(socketId, { roomId, playerId });
        }
        room.lastActivity = Date.now();
    }

    public getSocketMapping(socketId: string) {
        return this.socketToRoom.get(socketId);
    }

    public joinOrCreate(roomId: string, playerId: string, playerName: string): RoomData {
        let room = this.rooms.get(roomId);

        if (!room) {
            room = {
                id: roomId,
                hostId: playerId, // First player is host
                players: [],
                engine: null,
                roleConfig: {
                    Werewolf: 1,
                    Witch: 1,
                    Guard: 1,
                    Villager: 1,
                    Seer: 1
                },
                lastActivity: Date.now()
            };
            this.rooms.set(roomId, room);
        }

        // Prevent duplicate joins
        const existingPlayer = room.players.find(p => p.id === playerId);
        if (!existingPlayer) {
            room.players.push({
                id: playerId,
                socketId: playerId, // Fallback if not specified otherwise
                name: playerName,
                ready: false,
                alive: !room.engine, // If game already running, they start dead (spectator)
                lastSeen: Date.now(),
                isMicMuted: true, // User request: default mic muted
                isSpeakerMuted: false, // Speakers on by default
                online: true,
            });
        } else {
            existingPlayer.lastSeen = Date.now();
            existingPlayer.online = true;
            // Re-joining player might have a new name or just updating lastSeen
            if (playerName) existingPlayer.name = playerName;
        }

        room.lastActivity = Date.now();
        this.playerRooms.set(playerId, roomId);
        // We handle socketToRoom mapping in updateSocketId call right after joinOrCreate
        return room;
    }

    public getRoom(roomId: string): RoomData | undefined {
        return this.rooms.get(roomId);
    }

    public getPlayerIdBySocketId(roomId: string, socketId: string): string | undefined {
        const room = this.rooms.get(roomId);
        return room?.players.find(p => p.socketId === socketId)?.id;
    }

    public getPlayerRoom(playerId: string): string | undefined {
        return this.playerRooms.get(playerId);
    }

    public getPlayerName(roomId: string, playerId: string): string | undefined {
        const room = this.rooms.get(roomId);
        return room?.players.find(p => p.id === playerId)?.name;
    }

    public setPlayerOnline(roomId: string, playerId: string, online: boolean): void {
        const room = this.rooms.get(roomId);
        if (!room) return;
        const player = room.players.find(p => p.id === playerId);
        if (player) {
            player.online = online;
            player.lastSeen = Date.now();
        }
        room.lastActivity = Date.now();
    }

    public setPlayerReady(roomId: string, playerId: string, ready: boolean): void {
        const room = this.rooms.get(roomId);
        if (!room) return;
        const player = room.players.find(p => p.id === playerId);
        if (player) {
            player.ready = ready;
            player.lastSeen = Date.now();
        }
        room.lastActivity = Date.now();
    }

    public leaveRoom(roomId: string, playerId: string): void {
        const room = this.rooms.get(roomId);
        if (!room) return;

        const player = room.players.find(p => p.id === playerId);
        if (player) {
            if (player.socketId) this.socketToRoom.delete(player.socketId);
        }

        room.players = room.players.filter(p => p.id !== playerId);
        this.playerRooms.delete(playerId);
        room.lastActivity = Date.now();

        // If host left, assign new host
        if (room.hostId === playerId && room.players.length > 0) {
            room.hostId = room.players[0].id;
        }

        // Clean up empty rooms immediately if all leave
        if (room.players.length === 0) {
            this.rooms.delete(roomId);
            console.log(`[RoomManager] Deleted empty room ${roomId} upon leave`);
        }
    }

    public startGame(roomId: string, roleConfig: Record<string, number>, config?: GameConfig): boolean {
        const room = this.rooms.get(roomId);
        if (!room) return false;

        // Build role list from config
        const roles: Role[] = [];
        for (const [roleName, count] of Object.entries(roleConfig)) {
            const factory = ROLE_FACTORY[roleName];
            if (!factory) continue;
            for (let i = 0; i < count; i++) {
                roles.push(factory());
            }
        }

        // Validate total
        if (roles.length !== room.players.length) return false;

        // Shuffle roles (Fisher-Yates)
        for (let i = roles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [roles[i], roles[j]] = [roles[j], roles[i]];
        }

        // Create engine and assign roles
        const engine = new GameEngine(config);
        const gamePlayers: Player[] = room.players.map((p, index) => {
            p.roleName = roles[index].name;
            p.alive = true;
            p.lastSeen = Date.now();
            return {
                id: p.id,
                alive: true,
                role: roles[index],
            };
        });

        room.engine = engine;
        room.lastActivity = Date.now();
        engine.startGame(gamePlayers);
        return true;
    }

    /**
     * Update heartbeat for a specific player to keep them alive in memory
     */
    public heartbeat(playerId: string): void {
        const roomId = this.playerRooms.get(playerId);
        if (!roomId) return;
        const room = this.rooms.get(roomId);
        if (!room) return;

        const player = room.players.find(p => p.id === playerId);
        if (player) {
            player.lastSeen = Date.now();
            room.lastActivity = Date.now();
        }
    }
}
