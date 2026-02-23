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
    id: string;
    name: string;
    ready: boolean;
    alive: boolean;
    roleName?: string;
}

export interface RoomData {
    id: string;
    hostId: string;
    players: RoomPlayer[];
    engine: GameEngine | null;
    roleConfig: Record<string, number>;
    timerConfig?: GameConfig['timers'];
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

    public joinOrCreate(roomId: string, playerId: string, playerName: string): RoomData {
        let room = this.rooms.get(roomId);

        if (!room) {
            room = {
                id: roomId,
                hostId: playerId, // First player is host
                players: [],
                engine: null,
                roleConfig: {},
            };
            this.rooms.set(roomId, room);
        }

        // Prevent duplicate joins
        if (!room.players.find(p => p.id === playerId)) {
            room.players.push({
                id: playerId,
                name: playerName,
                ready: false,
                alive: true,
            });
        }

        this.playerRooms.set(playerId, roomId);
        return room;
    }

    public getRoom(roomId: string): RoomData | undefined {
        return this.rooms.get(roomId);
    }

    public getPlayerRoom(playerId: string): string | undefined {
        return this.playerRooms.get(playerId);
    }

    public getPlayerName(roomId: string, playerId: string): string | undefined {
        const room = this.rooms.get(roomId);
        return room?.players.find(p => p.id === playerId)?.name;
    }

    public setPlayerReady(roomId: string, playerId: string, ready: boolean): void {
        const room = this.rooms.get(roomId);
        if (!room) return;
        const player = room.players.find(p => p.id === playerId);
        if (player) player.ready = ready;
    }

    public leaveRoom(roomId: string, playerId: string): void {
        const room = this.rooms.get(roomId);
        if (!room) return;

        room.players = room.players.filter(p => p.id !== playerId);
        this.playerRooms.delete(playerId);

        // If host left, assign new host
        if (room.hostId === playerId && room.players.length > 0) {
            room.hostId = room.players[0].id;
        }

        // Clean up empty rooms
        if (room.players.length === 0) {
            this.rooms.delete(roomId);
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
            return {
                id: p.id,
                alive: true,
                role: roles[index],
            };
        });

        room.engine = engine;
        engine.startGame(gamePlayers);
        return true;
    }
}
