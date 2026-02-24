import { GamePhase, Player, GameContext, GameEvent, GameConfig, DEFAULT_CONFIG } from '../types/GameTypes';
import { EventBus } from './EventBus';
import { ActionPipeline } from './ActionPipeline';
import { GameState } from './GameState';
import { WinEvaluator } from './WinEvaluator';

export class GameEngine {
    public state: GameState;
    public eventBus: EventBus;
    public actionPipeline: ActionPipeline;
    public evaluator: WinEvaluator;

    // Callbacks for external systems (SocketGateway)
    public onPhaseChange?: (phase: GamePhase, round: number) => void;
    public onChatMessage?: (msg: { content: string; icon?: string; roleFilter?: string; playerFilter?: string[] }) => void;

    private context: GameContext;

    constructor(config?: Partial<GameConfig>) {
        this.state = new GameState();
        if (config) {
            this.state.config = { ...DEFAULT_CONFIG, ...config, timers: { ...DEFAULT_CONFIG.timers, ...config.timers } };
        }

        const self = this;
        this.context = {
            get players() { return self.state.players; },
            get phase() { return self.state.phase; },
            get round() { return self.state.round; },
            get config() { return self.state.config; },
            getPlayer: (id: string) => self.state.players.find(p => p.id === id),
            getAlivePlayers: () => self.state.players.filter(p => p.alive),
            getAllPlayers: () => self.state.players,
            getLoverIds: () => self.state.loverIds
        };

        this.eventBus = new EventBus(this.context);
        this.actionPipeline = new ActionPipeline(this.context, this.eventBus);
        this.evaluator = new WinEvaluator();
    }

    public startGame(players: Player[]): void {
        this.state.players = players;
        this.state.round = 1;
        this.setPhase(GamePhase.STARTING);
        this.setPhase(GamePhase.NIGHT_INIT);
    }

    public setPhase(phase: GamePhase): void {
        this.state.phase = phase;
        console.log(`[GameEngine] Phase → ${phase}`);

        // Trigger onPhaseStart across all roles
        const alivePlayers = this.state.players.filter(p => p.alive);
        for (const player of alivePlayers) {
            if (player.role?.onPhaseStart) {
                player.role.onPhaseStart(this.context, player);
            }
        }

        // Callback for SocketGateway
        this.onPhaseChange?.(phase, this.state.round);
    }

    public handleNightAction(playerId: string, input: any): void {
        const player = this.state.players.find(p => p.id === playerId);
        if (!player || !player.alive) return;
        this.actionPipeline.registerAction(player, input);
    }

    public resolveNight(): void {
        this.setPhase(GamePhase.NIGHT_RESOLVE);
        this.actionPipeline.resolveNight();
        this.checkWinCondition();

        if (this.state.phase !== GamePhase.END) {
            this.state.round++;
            this.setPhase(GamePhase.DAY_ANNOUNCE);
        }
    }

    /**
     * Record Seer investigation result (snapshot at time of investigation).
     */
    public recordSeerInvestigation(seerId: string, targetId: string): void {
        const target = this.state.players.find(p => p.id === targetId);
        if (!target?.role) return;

        if (!this.state.seerHistory[seerId]) {
            this.state.seerHistory[seerId] = {};
        }
        // Store team at THIS moment (e.g., CursedWolf still shows VILLAGER before transform)
        this.state.seerHistory[seerId][targetId] = target.role.team;
        console.log(`[GameEngine] Seer ${seerId} investigated ${targetId} -> ${target.role.team}`);
    }

    /**
     * Register lover pair (Cupid + partner).
     */
    public registerLovers(cupidId: string, partnerId: string): void {
        this.state.loverIds = { cupidId, partnerId };
    }

    /**
     * Get Seer's investigation history (for role-private chat).
     */
    public getSeerHistory(seerId: string): Record<string, string> {
        return this.state.seerHistory[seerId] || {};
    }

    /**
     * Build role visibility for a specific player.
     * Returns which other players' roles this player can see.
     */
    public buildRoleVisibility(playerId: string): Record<string, { roleName: string; displayName: string; emoji: string; team: string }> {
        const player = this.state.players.find(p => p.id === playerId);
        if (!player) return {};

        const known: Record<string, { roleName: string; displayName: string; emoji: string; team: string }> = {};

        // Dead players see ALL roles (including their own)
        if (!player.alive) {
            for (const p of this.state.players) {
                if (p.role) {
                    known[p.id] = {
                        roleName: p.role.name,
                        displayName: p.role.displayName,
                        emoji: this.getRoleEmoji(p.role.name),
                        team: p.role.team,
                    };
                }
            }
            return known;
        }

        // Wolves see other wolves
        if (player.role?.team === 'WEREWOLF') {
            for (const p of this.state.players) {
                if (p.id !== playerId && p.role?.team === 'WEREWOLF') {
                    known[p.id] = {
                        roleName: p.role.name,
                        displayName: p.role.displayName,
                        emoji: this.getRoleEmoji(p.role.name),
                        team: 'WEREWOLF',
                    };
                }
            }
        }

        // Seer sees investigated players (old status at time of investigation)
        if (player.role?.name === 'Seer') {
            const history = this.getSeerHistory(playerId);
            for (const [targetId, team] of Object.entries(history)) {
                const target = this.state.players.find(p => p.id === targetId);
                if (target) {
                    known[targetId] = {
                        roleName: team === 'WEREWOLF' ? 'Werewolf' : 'Villager',
                        displayName: team === 'WEREWOLF' ? 'Ma Sói' : 'Dân Làng',
                        emoji: team === 'WEREWOLF' ? '🐺' : '👤',
                        team: team,
                    };
                }
            }
        }

        // Cupid sees partner's role
        if (this.state.loverIds) {
            const { cupidId, partnerId } = this.state.loverIds;
            if (playerId === cupidId) {
                const partner = this.state.players.find(p => p.id === partnerId);
                if (partner?.role) {
                    known[partnerId] = {
                        roleName: partner.role.name,
                        displayName: partner.role.displayName,
                        emoji: this.getRoleEmoji(partner.role.name),
                        team: partner.role.team,
                    };
                }
            }
            if (playerId === partnerId) {
                const cupid = this.state.players.find(p => p.id === cupidId);
                if (cupid?.role) {
                    known[cupidId] = {
                        roleName: cupid.role.name,
                        displayName: cupid.role.displayName,
                        emoji: this.getRoleEmoji(cupid.role.name),
                        team: cupid.role.team,
                    };
                }
            }
        }

        return known;
    }

    private getRoleEmoji(roleName: string): string {
        const emojis: Record<string, string> = {
            Werewolf: '🐺', Guard: '🛡️', Seer: '🔮', Witch: '🧪',
            Villager: '👤', Hunter: '🏹', Cupid: '💕', Jester: '🃏',
            Elder: '🧓', CursedWolf: '🌑',
        };
        return emojis[roleName] || '❓';
    }

    private checkWinCondition(): void {
        const winner = this.evaluator.evaluate(this.context);

        if (winner) {
            console.log(`[GameEngine] Game over! ${winner} wins.`);
            this.state.phase = GamePhase.END;
            this.onPhaseChange?.(GamePhase.END, this.state.round);
        }
    }
}
