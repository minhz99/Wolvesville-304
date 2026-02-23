import { Server, Socket } from 'socket.io';
import { RoomManager, RoomData } from './RoomManager';
import { LiveKitService } from './LiveKitService';
import { GamePhase, GameConfig, DEFAULT_CONFIG } from '../types/GameTypes';

/**
 * SocketGateway — Full game flow.
 *
 * NIGHT (sequential timers):
 *   1. Lover talk (if Cupid pair exists)
 *   2. Guard + Seer (parallel)
 *   3. Wolves (discuss + vote)
 *   4. Witch (knows victim, save/kill)
 *   5. Hunter (set revenge target)
 *   → resolveNight
 *
 * DAY (sequential timers):
 *   1. Announce (who died)
 *   2. Discussion (timer)
 *   3. Vote (select suspect)
 *   4. Defense (voted player speaks)
 *   5. Confirm hang (final vote yes/no)
 *   6. Resolve (execute or skip)
 *   → Check win → next night or game_over
 */
export class SocketGateway {
    private io: Server;
    private roomManager: RoomManager;
    private liveKitService: LiveKitService;
    private nightState: Map<string, NightRoomState> = new Map();
    private dayState: Map<string, DayRoomState> = new Map();
    // Tracking trạng thái bình thuốc của Witch cho mỗi phòng: roomId -> WitchPotionState
    private witchPotionState: Map<string, WitchPotionState> = new Map();

    constructor(server: any) {
        this.io = new Server(server, { cors: { origin: '*' } });
        this.roomManager = new RoomManager();
        this.liveKitService = new LiveKitService();
        this.setupListeners();
    }

    private setupListeners(): void {
        this.io.on('connection', (socket: Socket) => {
            console.log(`[Socket] ++ ${socket.id}`);

            socket.on('join_room', (data: { roomId: string; playerName: string }) => {
                const { roomId, playerName } = data;
                socket.join(roomId);
                const room = this.roomManager.joinOrCreate(roomId, socket.id, playerName);
                socket.emit('room_joined', { roomId, playerId: socket.id, isHost: room.hostId === socket.id });
                socket.to(roomId).emit('player_joined', { playerId: socket.id, playerName });
                this.broadcastPlayerList(roomId);
            });

            socket.on('leave_room', (data: { roomId: string }) => this.handlePlayerLeave(socket, data.roomId));

            socket.on('player_ready', (data: { roomId: string; ready: boolean }) => {
                this.roomManager.setPlayerReady(data.roomId, socket.id, data.ready);
                this.broadcastPlayerList(data.roomId);
            });

            // Host config → reset host ready
            socket.on('role_config', (data: { roomId: string; roles: Record<string, number> }) => {
                const room = this.roomManager.getRoom(data.roomId);
                if (room && room.hostId === socket.id) {
                    room.roleConfig = data.roles;
                    this.roomManager.setPlayerReady(data.roomId, socket.id, false);
                    this.broadcastPlayerList(data.roomId);
                }
            });

            socket.on('timer_config', (data: { roomId: string; timers: Partial<GameConfig['timers']> }) => {
                const room = this.roomManager.getRoom(data.roomId);
                if (room && room.hostId === socket.id) {
                    room.timerConfig = { ...DEFAULT_CONFIG.timers, ...data.timers };
                    this.roomManager.setPlayerReady(data.roomId, socket.id, false);
                    this.broadcastPlayerList(data.roomId);
                }
            });

            socket.on('start_game', async (data: { roomId: string; roles: Record<string, number> }) => {
                const room = this.roomManager.getRoom(data.roomId);
                if (!room || room.hostId !== socket.id) return;

                // Require everyone (including host) to be ready before starting
                const allReady = room.players.every(p => p.ready);
                // Basic safety: minimum player count
                if (room.players.length < 5) {
                    socket.emit('error', { message: 'Cần ít nhất 5 người chơi để bắt đầu.' });
                    return;
                }

                const totalRoles = Object.values(data.roles).reduce((a, b) => a + b, 0);
                if (totalRoles !== room.players.length) {
                    socket.emit('error', { message: `Role (${totalRoles}) ≠ người chơi (${room.players.length}).` });
                    return;
                }
                const config: GameConfig = { timers: room.timerConfig || DEFAULT_CONFIG.timers };
                if (!this.roomManager.startGame(data.roomId, data.roles, config) || !room.engine) return;

                // Khởi tạo trạng thái bình thuốc của Witch
                this.witchPotionState.set(data.roomId, {
                    hasHealPotion: true,
                    hasPoisonPotion: true,
                });

                // Generate LiveKit tokens for all players
                const liveKitWsUrl = this.liveKitService.getWsUrl();
                const tokenPromises = room.players.map(async (p) => {
                    const token = await this.liveKitService.generateToken(data.roomId, p.id, p.name);
                    return { playerId: p.id, token };
                });
                const playerTokens = await Promise.all(tokenPromises);

                for (const p of room.players) {
                    const ps = this.io.sockets.sockets.get(p.id);
                    if (ps && p.roleName) {
                        ps.emit('game_started', { phase: 'NIGHT_INIT', round: 1, role: p.roleName, config });
                        ps.emit('role_visibility', { knownRoles: room.engine.buildRoleVisibility(p.id) });
                        
                        // Send LiveKit token to player
                        const playerToken = playerTokens.find(pt => pt.playerId === p.id);
                        if (playerToken?.token && liveKitWsUrl) {
                            ps.emit('voice_token', { 
                                token: playerToken.token, 
                                wsUrl: liveKitWsUrl,
                                playerId: p.id 
                            });
                        }
                    }
                }
                this.sysChat(data.roomId, '🎮 Game bắt đầu! Đêm 1 đang đến...', '🌙');
                this.io.to(data.roomId).emit('sound_effect', { sound: 'night_start' });
                this.startNightFlow(data.roomId);
            });

            // Night actions
            socket.on('night_action', (data: { roomId: string; input: any }) => this.handleNightAction(data.roomId, socket.id, data.input));
            socket.on('wolf_vote', (data: { roomId: string; targetId: string }) => this.handleWolfVote(data.roomId, socket.id, data.targetId));
            socket.on('witch_action', (data: { roomId: string; action: string; targetId?: string }) => this.handleWitchAction(data.roomId, socket.id, data));

            // Day actions
            socket.on('day_vote', (data: { roomId: string; targetId: string }) => this.handleDayVote(data.roomId, socket.id, data.targetId));
            socket.on('confirm_hang', (data: { roomId: string; vote: boolean }) => this.handleConfirmHang(data.roomId, socket.id, data.vote));
            socket.on('hunter_revenge', (data: { roomId: string; targetId: string }) => this.handleHunterRevenge(data.roomId, socket.id, data.targetId));

            // Chat (always allowed for everyone)
            socket.on('player_chat', (data: { roomId: string; message: string }) => {
                const room = this.roomManager.getRoom(data.roomId);
                if (!room) return;
                const player = room.players.find(p => p.id === socket.id);
                if (!player) return;
                // Dead players cannot send public chat — they are observers
                if (!player.alive && room.engine) {
                    this.pvtChat(data.roomId, socket.id, '👻 Bạn đã chết, không thể chat.', '👻');
                    return;
                }
                this.io.to(data.roomId).emit('chat_message', {
                    type: 'player', content: data.message, sender: player.name, senderId: socket.id, icon: '💬',
                });
            });

            socket.on('disconnect', () => {
                const roomId = this.roomManager.getPlayerRoom(socket.id);
                if (roomId) this.handlePlayerLeave(socket, roomId);
            });
        });
    }

    // ================================================================
    //  NIGHT FLOW (sequential timers per role)
    // ================================================================

    private startNightFlow(roomId: string): void {
        const room = this.roomManager.getRoom(roomId);
        if (!room?.engine) return;
        const ns: NightRoomState = { phase: 'GUARD_SEER', actions: {}, wolfVotes: {}, witchAction: null, wolfTarget: null, timerId: null };
        this.nightState.set(roomId, ns);

        this.io.to(roomId).emit('phase_change', { phase: 'NIGHT_INIT', round: room.engine.state.round });
        this.clearAllTimers(roomId);

        // Night 1: Cupid acts FIRST (pick target → then lover talk = 2x nightAction)
        const isNight1 = room.engine.state.round === 1;
        const cupid = room.players.find(p => p.roleName === 'Cupid' && p.alive);
        if (isNight1 && cupid && !room.engine.state.loverIds) {
            this.nightPhaseCupid(roomId);
        } else {
            this.nightPhaseGuardSeer(roomId);
        }
    }

    /** Night 1 only: Cupid picks a lover target */
    private nightPhaseCupid(roomId: string): void {
        const room = this.roomManager.getRoom(roomId);
        if (!room?.engine) return;
        const ns = this.nightState.get(roomId)!;
        ns.phase = 'CUPID_PICK';
        const config = room.engine.state.config;
        const cupid = room.players.find(p => p.roleName === 'Cupid' && p.alive);
        if (!cupid) { this.nightPhaseGuardSeer(roomId); return; }

        // Voice: Silent while Cupid picks (no partner yet)
        this.broadcastVoiceState(roomId, 'NIGHT_CUPID_PICK');

        const alive = room.players.filter(p => p.alive).map(p => ({ id: p.id, name: p.name, alive: p.alive }));
        this.sysChat(roomId, '💘 Cupid đang chọn...', '💘');
        this.emitTo(cupid.id, 'night_action_request', {
            players: alive.filter(p => p.id !== cupid.id), // Can't pick self
            actionTitle: '💘 Chọn người yêu của bạn',
            timeLimit: config.timers.nightAction,
        });

        ns.timerId = setTimeout(() => {
            // Chỉ resolve nếu Cupid chưa chọn (auto random)
            if (!room.engine.state.loverIds) {
                this.autoRandom(roomId, 'Cupid', cupid.id);
                this.resolveCupidPairing(roomId, cupid.id);
                
                // Thông báo cho cả 2 người yêu nếu vừa được ghép
                if (room.engine.state.loverIds) {
                    this.notifyLovers(roomId);
                }
            }

            // Go straight to guard/seer (no separate lover talk phase)
            this.emitNightWaiting(roomId, []);
            this.nightPhaseGuardSeer(roomId);
        }, config.timers.nightAction * 1000);
    }

    private nightPhaseGuardSeer(roomId: string): void {
        const room = this.roomManager.getRoom(roomId);
        if (!room?.engine) return;
        const ns = this.nightState.get(roomId)!;
        ns.phase = 'GUARD_SEER';
        const config = room.engine.state.config;
        const alive = room.players.filter(p => p.alive).map(p => ({ id: p.id, name: p.name, alive: p.alive }));

        // Voice: Everyone silent during guard/seer
        this.broadcastVoiceState(roomId, 'NIGHT_SILENT');

        this.sysChat(roomId, '🛡️🔮 Bảo Vệ và Tiên Tri...', '⏳');

        const guard = room.players.find(p => p.roleName === 'Guard' && p.alive);
        const seer = room.players.find(p => p.roleName === 'Seer' && p.alive);

        if (guard) this.emitTo(guard.id, 'night_action_request', { players: alive, actionTitle: 'Chọn người bảo vệ (không lặp 2 đêm)', timeLimit: config.timers.nightAction });
        if (seer) {
            const hist = room.engine.getSeerHistory(seer.id);
            const str = Object.entries(hist).map(([tid, team]) => { const t = room.players.find(p => p.id === tid); return `${t?.name || '???'}: ${team === 'WEREWOLF' ? '🐺' : '👤'}`; }).join(', ');
            if (str) this.pvtChat(roomId, seer.id, `🔮 Đã soi: ${str}`, '🔮');
            this.emitTo(seer.id, 'night_action_request', { players: alive, actionTitle: 'Chọn người để soi', timeLimit: config.timers.nightAction });
        }

        // Emit waiting state for non-active players → client shows vote UI preview
        this.emitNightWaiting(roomId, [guard?.id, seer?.id].filter(Boolean) as string[]);

        ns.timerId = setTimeout(() => {
            this.autoRandom(roomId, 'Guard', guard?.id);
            this.autoRandom(roomId, 'Seer', seer?.id);

            // Xử lý Seer investigation khi hết giờ
            this.resolveSeerInvestigation(roomId, seer?.id);

            this.nightPhaseWolves(roomId);
        }, config.timers.nightAction * 1000);
    }

    private resolveSeerInvestigation(roomId: string, seerId?: string): void {
        if (!seerId) return;
        const room = this.roomManager.getRoom(roomId);
        if (!room?.engine) return;
        const ns = this.nightState.get(roomId);
        if (!ns) return;

        const action = ns.actions[seerId];
        if (!action?.targetId) return;

        // Ghi nhận và thông báo kết quả soi
        room.engine.recordSeerInvestigation(seerId, action.targetId);
        const engineTarget = room.engine.state.players.find(p => p.id === action.targetId);
        const team = engineTarget?.role?.team || 'VILLAGER';
        const target = room.players.find(p => p.id === action.targetId);
        this.pvtChat(roomId, seerId, `🔮 ${target?.name}: ${team === 'WEREWOLF' ? '🐺 Ma Sói!' : '👤 Dân Làng'}`, '🔮');
        this.emitTo(seerId, 'role_visibility', { knownRoles: room.engine.buildRoleVisibility(seerId) });
    }

    private resolveCupidPairing(roomId: string, cupidId?: string): void {
        if (!cupidId) return;
        const room = this.roomManager.getRoom(roomId);
        if (!room?.engine) return;
        const ns = this.nightState.get(roomId);
        if (!ns) return;

        const action = ns.actions[cupidId];
        if (!action?.targetId) return;

        // Chỉ ghép cặp nếu chưa có
        if (room.engine.state.loverIds) return;

        // Ghép cặp
        room.engine.registerLovers(cupidId, action.targetId);
    }

    /**
     * Thông báo cho cả 2 người yêu về nhau (gửi tin nhắn + role visibility)
     */
    private notifyLovers(roomId: string): void {
        const room = this.roomManager.getRoom(roomId);
        if (!room?.engine?.state.loverIds) return;

        const { cupidId, partnerId } = room.engine.state.loverIds;
        const cupidPlayer = room.players.find(p => p.id === cupidId);
        const partnerPlayer = room.players.find(p => p.id === partnerId);

        if (!cupidPlayer || !partnerPlayer) return;

        // Lấy role của partner để hiện cho Cupid
        const partnerEnginePlayer = room.engine.state.players.find(p => p.id === partnerId);
        const partnerRoleName = partnerEnginePlayer?.role?.displayName || partnerEnginePlayer?.role?.name || 'Không rõ';

        // Thông báo cho Cupid: tên partner + role của partner
        this.pvtChat(roomId, cupidId, `💕 Người yêu của bạn: ${partnerPlayer.name} (${partnerRoleName})`, '💕');
        
        // Thông báo cho Partner: được chọn làm tình nhân + tên Cupid
        this.pvtChat(roomId, partnerId, `💕 Cupid (${cupidPlayer.name}) đã chọn bạn làm Tình Nhân!`, '💕');

        // Gửi role visibility để cả 2 thấy role của nhau
        this.emitTo(cupidId, 'role_visibility', { knownRoles: room.engine.buildRoleVisibility(cupidId) });
        this.emitTo(partnerId, 'role_visibility', { knownRoles: room.engine.buildRoleVisibility(partnerId) });
    }

    private nightPhaseWolves(roomId: string): void {
        const room = this.roomManager.getRoom(roomId);
        if (!room?.engine) return;
        const ns = this.nightState.get(roomId)!;
        ns.phase = 'WOLVES';
        ns.wolfVotes = {};
        const config = room.engine.state.config;
        const wolves = room.players.filter(p => p.roleName === 'Werewolf' && p.alive);
        // Sói có thể chọn bất kỳ ai còn sống, bao gồm cả sói khác (tự cắn bản thân)
        const targets = room.players.filter(p => p.alive).map(p => ({ id: p.id, name: p.name, alive: p.alive }));

        // Voice: Only wolves can talk (interrupts lover talk if wolf is a lover)
        this.broadcastVoiceState(roomId, 'NIGHT_WOLVES');

        this.sysChat(roomId, '🐺 Ma Sói đang thảo luận...', '🐺');
        this.io.to(roomId).emit('sound_effect', { sound: 'suspense' });
        
        // Use wolfDiscussion timer for wolves
        const wolfTime = config.timers.wolfDiscussion;
        for (const w of wolves) this.emitTo(w.id, 'wolf_action_request', { players: targets, wolves: wolves.map(x => ({ id: x.id, name: x.name })), actionTitle: 'Bỏ phiếu mục tiêu', timeLimit: wolfTime });
        this.emitNightWaiting(roomId, wolves.map(w => w.id));

        ns.timerId = setTimeout(() => { this.resolveWolfVote(roomId); this.nightPhaseWitch(roomId); }, wolfTime * 1000);
    }

    private nightPhaseWitch(roomId: string): void {
        const room = this.roomManager.getRoom(roomId);
        if (!room?.engine) return;
        const ns = this.nightState.get(roomId)!;
        ns.phase = 'WITCH';
        const witch = room.players.find(p => p.roleName === 'Witch' && p.alive);
        if (!witch) { this.nightPhaseHunter(roomId); return; }

        const config = room.engine.state.config;
        const potionState = this.witchPotionState.get(roomId) || { hasHealPotion: true, hasPoisonPotion: true };

        // Nếu không còn bình thuốc nào, bỏ qua phase Witch
        if (!potionState.hasHealPotion && !potionState.hasPoisonPotion) {
            this.nightPhaseHunter(roomId);
            return;
        }

        // Voice: Everyone silent during witch
        this.broadcastVoiceState(roomId, 'NIGHT_SILENT');

        this.sysChat(roomId, '🧪 Phù Thủy...', '🧪');
        const victim = ns.wolfTarget ? room.players.find(p => p.id === ns.wolfTarget) : null;
        this.emitTo(witch.id, 'witch_action_request', {
            victimId: ns.wolfTarget,
            victimName: victim?.name || 'Không ai',
            players: room.players.filter(p => p.alive).map(p => ({ id: p.id, name: p.name, alive: p.alive })),
            timeLimit: config.timers.nightAction,
            hasHealPotion: potionState.hasHealPotion,
            hasPoisonPotion: potionState.hasPoisonPotion,
        });
        this.emitNightWaiting(roomId, [witch.id]);
        ns.timerId = setTimeout(() => this.nightPhaseHunter(roomId), config.timers.nightAction * 1000);
    }

    private nightPhaseHunter(roomId: string): void {
        const room = this.roomManager.getRoom(roomId);
        if (!room?.engine) return;
        const ns = this.nightState.get(roomId)!;
        ns.phase = 'HUNTER';
        const hunter = room.players.find(p => p.roleName === 'Hunter' && p.alive);
        if (!hunter) { this.resolveNight(roomId); return; }

        // Voice: Everyone silent during hunter
        this.broadcastVoiceState(roomId, 'NIGHT_SILENT');

        const config = room.engine.state.config;
        this.emitTo(hunter.id, 'night_action_request', {
            players: room.players.filter(p => p.alive).map(p => ({ id: p.id, name: p.name, alive: p.alive })),
            actionTitle: 'Chọn mục tiêu trả thù', timeLimit: config.timers.nightAction,
        });
        this.emitNightWaiting(roomId, [hunter.id]);
        ns.timerId = setTimeout(() => this.resolveNight(roomId), config.timers.nightAction * 1000);
    }

    private resolveNight(roomId: string): void {
        const room = this.roomManager.getRoom(roomId);
        if (!room?.engine) return;
        const ns = this.nightState.get(roomId);
        if (!ns) return;

        // Track who was alive before resolution
        const aliveBefore = new Set(room.players.filter(p => p.alive).map(p => p.id));

        // Feed actions into engine
        for (const [pid, input] of Object.entries(ns.actions)) {
            room.engine.handleNightAction(pid, input);
        }
        room.engine.resolveNight();

        this.nightState.delete(roomId);

        // Đồng bộ trạng thái alive từ engine về gateway (room.players)
        for (const enginePlayer of room.engine.state.players) {
            const gatewayPlayer = room.players.find(p => p.id === enginePlayer.id);
            if (gatewayPlayer) {
                gatewayPlayer.alive = enginePlayer.alive;
            }
        }

        // Broadcast updated alive status
        this.broadcastAlive(roomId);
        this.broadcastVisibility(roomId);

        // Find who died this night
        const diedThisNight = room.players.filter(p => aliveBefore.has(p.id) && !p.alive);

        this.io.to(roomId).emit('sound_effect', { sound: 'day_start' });

        if (diedThisNight.length > 0) {
            const names = diedThisNight.map(p => p.name).join(', ');
            this.sysChat(roomId, `💀 Đêm qua: ${names} đã chết.`, '💀');
        } else {
            this.sysChat(roomId, '☀️ Đêm bình yên, không ai chết.', '☀️');
        }

        // Check win
        if (this.checkGameOver(roomId)) return;

        // → DAY DISCUSSION
        this.startDayDiscussion(roomId);
    }

    // ================================================================
    //  DAY FLOW (gộp thảo luận và bỏ phiếu)
    // ================================================================

    private startDayDiscussion(roomId: string): void {
        const room = this.roomManager.getRoom(roomId);
        if (!room?.engine) return;
        const config = room.engine.state.config;
        const round = room.engine.state.round;

        // Thời gian thảo luận & bỏ phiếu (đã gộp chung)
        const totalTime = config.timers.dayDiscussion;

        // Khởi tạo day state ngay từ đầu để cho phép vote trong lúc thảo luận
        const ds: DayRoomState = { votes: {}, confirmVotes: {}, accusedId: null, timerId: null };
        this.dayState.set(roomId, ds);

        this.clearAllTimers(roomId);

        // Voice: All alive players can talk during day
        this.broadcastVoiceState(roomId, 'DAY');

        // Gửi tất cả người chơi (bao gồm cả chết) để hiển thị, client sẽ disable người chết
        const allPlayers = room.players.map(p => ({ id: p.id, name: p.name, alive: p.alive }));

        this.io.to(roomId).emit('phase_change', {
            phase: 'DAY_DISCUSSION',
            round,
            timeLimit: totalTime,
        });
        this.sysChat(roomId, `☀️ Ngày ${round} — Thảo luận & Bỏ phiếu! (${totalTime}s)`, '☀️');
        this.io.to(roomId).emit('sound_effect', { sound: 'discussion' });

        // Gửi vote request ngay lập tức để người chơi có thể vote trong lúc thảo luận
        for (const p of room.players.filter(x => x.alive)) {
            this.emitTo(p.id, 'day_vote_request', { players: allPlayers, timeLimit: totalTime });
        }

        // Hết thời gian → tự động xử lý vote
        ds.timerId = setTimeout(() => this.resolveDayVote(roomId), totalTime * 1000);
    }

    // Giữ lại startDayVoting cho backward compatibility nhưng không còn được gọi riêng
    private startDayVoting(roomId: string): void {
        // Đã gộp vào startDayDiscussion, hàm này không còn được sử dụng
        this.startDayDiscussion(roomId);
    }

    private resolveDayVote(roomId: string): void {
        const room = this.roomManager.getRoom(roomId);
        if (!room?.engine) return;
        const ds = this.dayState.get(roomId);
        if (!ds) return;

        // Tally votes
        const tally: Record<string, number> = {};
        for (const tid of Object.values(ds.votes)) {
            tally[tid] = (tally[tid] || 0) + 1;
        }

        const maxVotes = Math.max(0, ...Object.values(tally));
        const aliveCount = room.players.filter(p => p.alive).length;
        const requiredVotes = Math.floor(aliveCount / 2) + 1; // Trên 50% = majority

        if (maxVotes === 0) {
            this.sysChat(roomId, '🕊️ Không ai bị bỏ phiếu. Tha!', '🕊️');
            this.dayState.delete(roomId);
            if (!this.checkGameOver(roomId)) this.startNextNight(roomId);
            return;
        }

        const candidates = Object.entries(tally).filter(([_, v]) => v === maxVotes).map(([id]) => id);

        // Kiểm tra xem có đạt trên 50% không
        if (maxVotes < requiredVotes) {
            this.sysChat(roomId, `🕊️ Không đủ phiếu (cần ${requiredVotes}/${aliveCount}, có ${maxVotes}). Tha!`, '🕊️');
            this.dayState.delete(roomId);
            if (!this.checkGameOver(roomId)) this.startNextNight(roomId);
            return;
        }

        if (candidates.length > 1) {
            this.sysChat(roomId, '⚖️ Hòa phiếu! Không ai bị treo cổ.', '⚖️');
            this.dayState.delete(roomId);
            if (!this.checkGameOver(roomId)) this.startNextNight(roomId);
            return;
        }

        const accusedId = candidates[0];
        ds.accusedId = accusedId;
        const accused = room.players.find(p => p.id === accusedId);

        // Bỏ qua biện minh - đi thẳng vào bỏ phiếu giết/tha
        this.sysChat(roomId, `⚖️ ${accused?.name} bị bỏ phiếu nhiều nhất (${maxVotes}/${aliveCount} phiếu). Giết hay tha?`, '⚖️');
        this.startConfirmHang(roomId);
    }

    private startConfirmHang(roomId: string): void {
        const room = this.roomManager.getRoom(roomId);
        if (!room?.engine) return;
        const config = room.engine.state.config;
        const ds = this.dayState.get(roomId);
        if (!ds?.accusedId) return;

        ds.confirmVotes = {};
        const accused = room.players.find(p => p.id === ds.accusedId);

        this.io.to(roomId).emit('phase_change', { phase: 'DAY_CONFIRM_HANG', round: room.engine.state.round });
        this.sysChat(roomId, `🪢 Xác nhận treo cổ ${accused?.name}? Bỏ phiếu! (${config.timers.confirmHang}s)`, '🪢');
        this.io.to(roomId).emit('sound_effect', { sound: 'tension' });

        // Gửi request cho TẤT CẢ người sống để vote xác nhận (bao gồm cả người bị cáo)
        for (const p of room.players.filter(x => x.alive)) {
            this.emitTo(p.id, 'confirm_hang_request', {
                accusedId: ds.accusedId,
                accusedName: accused?.name,
                timeLimit: config.timers.confirmHang,
                isSelfAccused: p.id === ds.accusedId
            });
        }

        ds.timerId = setTimeout(() => this.resolveConfirmHang(roomId), config.timers.confirmHang * 1000);
    }

    private resolveConfirmHang(roomId: string): void {
        const room = this.roomManager.getRoom(roomId);
        if (!room?.engine) return;
        const ds = this.dayState.get(roomId);
        if (!ds?.accusedId) return;

        const yesVotes = Object.values(ds.confirmVotes).filter(v => v === true).length;
        const noVotes = Object.values(ds.confirmVotes).filter(v => v === false).length;
        const accused = room.players.find(p => p.id === ds.accusedId);

        if (yesVotes > noVotes) {
            // Execute
            this.sysChat(roomId, `☠️ ${accused?.name} bị treo cổ! (${yesVotes} thuận / ${noVotes} chống)`, '☠️');
            this.io.to(roomId).emit('sound_effect', { sound: 'death' });

            // Special check for Jester (if not handled by WinEvaluator/EventBus)
            if (accused?.roleName === 'Jester') {
                // Mark Jester as dead
                const enginePlayer = room.engine.state.players.find(p => p.id === ds.accusedId);
                if (enginePlayer && enginePlayer.alive) {
                    room.engine.eventBus.publish({ type: 'PLAYER_DEATH', target: enginePlayer });
                }
                const gatewayPlayer = room.players.find(p => p.id === ds.accusedId);
                if (gatewayPlayer) gatewayPlayer.alive = false;

                this.sysChat(roomId, `🃏 ${accused.name} là Thằng ngốc! Thằng ngốc thắng!`, '🃏');
                this.io.to(roomId).emit('game_over', {
                    winner: 'JESTER',
                    players: room.players.map(p => ({ id: p.id, name: p.name, role: p.roleName, alive: p.alive })),
                });
                this.clearAllTimers(roomId);
                this.dayState.delete(roomId);
                return;
            }

            // Check if Hunter is being hanged - let them choose revenge target
            if (accused?.roleName === 'Hunter') {
                this.startHunterRevenge(roomId, ds.accusedId!);
                return;
            }

            // Mark as dead in engine (this triggers EventBus and onDeath)
            const enginePlayer = room.engine.state.players.find(p => p.id === ds.accusedId);
            if (enginePlayer && enginePlayer.alive) {
                room.engine.eventBus.publish({ type: 'PLAYER_DEATH', target: enginePlayer });
            }

            // In our SocketGateway room state, also mark as dead
            const gatewayPlayer = room.players.find(p => p.id === ds.accusedId);
            if (gatewayPlayer) gatewayPlayer.alive = false;

            this.broadcastAlive(roomId);
            this.broadcastVisibility(roomId);
        } else {
            this.sysChat(roomId, `🕊️ ${accused?.name} được tha! (${yesVotes} thuận / ${noVotes} chống)`, '🕊️');
        }

        this.clearAllTimers(roomId);
        this.dayState.delete(roomId);

        if (!this.checkGameOver(roomId)) this.startNextNight(roomId);
    }

    private startHunterRevenge(roomId: string, hunterId: string): void {
        const room = this.roomManager.getRoom(roomId);
        if (!room?.engine) return;
        const config = room.engine.state.config;
        const hunter = room.players.find(p => p.id === hunterId);

        this.sysChat(roomId, `🏹 ${hunter?.name} là Thợ Săn! Đang chọn người trả thù...`, '🏹');
        this.io.to(roomId).emit('phase_change', { phase: 'HUNTER_REVENGE', round: room.engine.state.round });

        // Send revenge request to Hunter
        const targets = room.players.filter(p => p.alive && p.id !== hunterId).map(p => ({ id: p.id, name: p.name }));
        this.emitTo(hunterId, 'hunter_revenge_request', {
            players: targets,
            timeLimit: config.timers.nightAction,
            actionTitle: '🏹 Chọn người trả thù trước khi chết!'
        });

        // Store pending revenge state
        const ds = this.dayState.get(roomId);
        if (ds) {
            ds.timerId = setTimeout(() => this.resolveHunterRevenge(roomId, hunterId, null), config.timers.nightAction * 1000);
        }
    }

    private resolveHunterRevenge(roomId: string, hunterId: string, targetId: string | null): void {
        const room = this.roomManager.getRoom(roomId);
        if (!room?.engine) return;

        const ds = this.dayState.get(roomId);
        if (ds?.timerId) {
            clearTimeout(ds.timerId);
            ds.timerId = null;
        }

        const hunter = room.players.find(p => p.id === hunterId);

        // Mark Hunter as dead first
        const engineHunter = room.engine.state.players.find(p => p.id === hunterId);
        if (engineHunter) engineHunter.alive = false;
        if (hunter) hunter.alive = false;

        // If Hunter chose a target, kill them
        if (targetId) {
            const target = room.players.find(p => p.id === targetId);
            const engineTarget = room.engine.state.players.find(p => p.id === targetId);

            if (target && engineTarget && engineTarget.alive) {
                this.sysChat(roomId, `🏹 ${hunter?.name} bắn chết ${target.name} trước khi chết!`, '🏹');
                this.io.to(roomId).emit('sound_effect', { sound: 'death' });

                // Mark target as dead
                room.engine.eventBus.publish({ type: 'PLAYER_DEATH', target: engineTarget, metadata: { reason: 'HUNTER_SHOT' } });
                target.alive = false;
            }
        } else {
            this.sysChat(roomId, `🏹 ${hunter?.name} không bắn ai.`, '🏹');
        }

        this.broadcastAlive(roomId);
        this.broadcastVisibility(roomId);

        this.clearAllTimers(roomId);
        this.dayState.delete(roomId);

        if (!this.checkGameOver(roomId)) this.startNextNight(roomId);
    }

    private startNextNight(roomId: string): void {
        const room = this.roomManager.getRoom(roomId);
        if (!room?.engine) return;
        this.sysChat(roomId, '🌙 Đêm đang đến...', '🌙');
        this.io.to(roomId).emit('sound_effect', { sound: 'night_start' });
        this.startNightFlow(roomId);
    }

    // ================================================================
    //  ACTION HANDLERS
    // ================================================================

    private handleNightAction(roomId: string, playerId: string, input: any): void {
        const ns = this.nightState.get(roomId);
        if (!ns) return;
        const room = this.roomManager.getRoom(roomId);
        if (!room?.engine) return;
        const player = room.players.find(p => p.id === playerId);
        if (!player || !player.alive) return;

        ns.actions[playerId] = input;

        // Cupid pick: immediately resolve, show role, and switch to waiting UI
        if (ns.phase === 'CUPID_PICK' && player.roleName === 'Cupid') {
            this.resolveCupidPairing(roomId, playerId);
            
            // Thông báo cho cả 2 người yêu ngay lập tức
            this.notifyLovers(roomId);
            
            // Gửi action_confirmed trước để client reset actionMode về idle
            this.emitTo(playerId, 'action_confirmed', { message: '💕 Đã chọn người yêu!' });
            
            // Sau đó gửi waiting UI cho Cupid
            const allAlive = room.players.filter(p => p.alive).map(p => ({ id: p.id, name: p.name, alive: p.alive }));
            this.emitTo(playerId, 'cupid_waiting', { players: allAlive });
            return;
        }

        this.emitTo(playerId, 'action_confirmed', { message: '✅ Đã chọn. Bạn có thể đổi trước khi hết giờ.' });
    }

    private handleWolfVote(roomId: string, wolfId: string, targetId: string): void {
        const ns = this.nightState.get(roomId);
        if (!ns || ns.phase !== 'WOLVES') return;
        const room = this.roomManager.getRoom(roomId);
        if (!room) return;
        if (!room.players.find(p => p.id === wolfId && p.roleName === 'Werewolf' && p.alive)) return;

        ns.wolfVotes[wolfId] = targetId;

        const wolves = room.players.filter(p => p.roleName === 'Werewolf' && p.alive);
        const summary = Object.entries(ns.wolfVotes).map(([wid, tid]) => {
            const w = room.players.find(p => p.id === wid);
            const t = room.players.find(p => p.id === tid);
            return { wolfName: w?.name, targetName: t?.name, targetId: tid };
        });
        for (const w of wolves) this.emitTo(w.id, 'wolf_vote_update', { votes: summary });
    }

    private resolveWolfVote(roomId: string): void {
        const ns = this.nightState.get(roomId);
        if (!ns) return;
        const room = this.roomManager.getRoom(roomId);
        if (!room?.engine) return;

        const tally: Record<string, number> = {};
        for (const tid of Object.values(ns.wolfVotes)) tally[tid] = (tally[tid] || 0) + 1;

        let target: string | null = null;
        const maxV = Math.max(0, ...Object.values(tally));
        if (maxV > 0) {
            const cands = Object.entries(tally).filter(([_, v]) => v === maxV).map(([id]) => id);
            target = cands[Math.floor(Math.random() * cands.length)];
        } else {
            const wolves = room.players.filter(p => p.roleName === 'Werewolf' && p.alive);
            const pool = room.players.filter(p => p.alive && !wolves.find(w => w.id === p.id));
            if (pool.length > 0) target = pool[Math.floor(Math.random() * pool.length)].id;
        }

        ns.wolfTarget = target;
        if (target) {
            const attackWolf = room.players.find(p => p.roleName === 'Werewolf' && p.alive);
            if (attackWolf) ns.actions[attackWolf.id] = { targetId: target };
        }
    }

    private handleWitchAction(roomId: string, witchId: string, data: { action: string; targetId?: string }): void {
        const ns = this.nightState.get(roomId);
        if (!ns || ns.phase !== 'WITCH' || ns.witchAction !== null) return;
        const room = this.roomManager.getRoom(roomId);
        if (!room?.players.find(p => p.id === witchId && p.roleName === 'Witch' && p.alive)) return;

        const potionState = this.witchPotionState.get(roomId);
        if (!potionState) return;

        ns.witchAction = data.action;
        if (data.action === 'save' && ns.wolfTarget && potionState.hasHealPotion) {
            // Sử dụng bình cứu
            potionState.hasHealPotion = false;
            const attackWolf = room.players.find(p => p.roleName === 'Werewolf' && p.alive);
            if (attackWolf && ns.actions[attackWolf.id]) { delete ns.actions[attackWolf.id]; ns.wolfTarget = null; }
            this.pvtChat(roomId, witchId, '💊 Đã cứu nạn nhân! (Không còn bình cứu)', '🧪');
        } else if (data.action === 'kill' && data.targetId && potionState.hasPoisonPotion) {
            // Sử dụng bình độc - cần truyền đúng format cho PotionSkill.use()
            potionState.hasPoisonPotion = false;
            ns.actions[witchId] = { poisonTargetId: data.targetId };
            const target = room.players.find(p => p.id === data.targetId);
            this.pvtChat(roomId, witchId, `☠️ Ném bình vào ${target?.name}! (Không còn bình độc)`, '🧪');
        }

        // KHÔNG clear timer và chuyển ngay - phải chờ hết thời gian
        // Timer sẽ tự gọi nightPhaseHunter khi hết giờ
        this.emitTo(witchId, 'action_confirmed', { message: '✅ Đã chọn hành động.' });
    }

    private handleDayVote(roomId: string, playerId: string, targetId: string): void {
        const ds = this.dayState.get(roomId);
        if (!ds) return;
        const room = this.roomManager.getRoom(roomId);
        if (!room) return;
        const player = room.players.find(p => p.id === playerId && p.alive);
        if (!player) return;

        ds.votes[playerId] = targetId;

        // Thông báo ai đã vote ai
        const target = room.players.find(p => p.id === targetId);
        this.sysChat(roomId, `🗳️ ${player.name} đã vote ${target?.name}`, '🗳️');

        // Broadcast vote update với chi tiết ai vote ai
        const voteDetails = Object.entries(ds.votes).map(([voterId, tid]) => {
            const voter = room.players.find(p => p.id === voterId);
            const t = room.players.find(p => p.id === tid);
            return {
                voterId,
                voterName: voter?.name || '???',
                targetId: tid,
                targetName: t?.name || '???'
            };
        });
        this.io.to(roomId).emit('vote_update', { voteDetails });
    }

    private handleConfirmHang(roomId: string, playerId: string, vote: boolean): void {
        const ds = this.dayState.get(roomId);
        if (!ds) return;
        const room = this.roomManager.getRoom(roomId);
        if (!room) return;

        ds.confirmVotes[playerId] = vote;

        // Thông báo ai đã bỏ phiếu
        const player = room.players.find(p => p.id === playerId);
        const accused = room.players.find(p => p.id === ds.accusedId);
        if (vote) {
            this.sysChat(roomId, `👍 ${player?.name} đồng ý treo cổ ${accused?.name}`, '⚖️');
        } else {
            this.sysChat(roomId, `👎 ${player?.name} không đồng ý treo cổ ${accused?.name}`, '⚖️');
        }
    }

    private handleHunterRevenge(roomId: string, hunterId: string, targetId: string): void {
        const ds = this.dayState.get(roomId);
        if (!ds?.accusedId || ds.accusedId !== hunterId) return;

        const room = this.roomManager.getRoom(roomId);
        if (!room) return;

        // Verify the target is valid (alive and not the hunter)
        const target = room.players.find(p => p.id === targetId && p.alive && p.id !== hunterId);
        if (!target) return;

        // Resolve the revenge immediately
        this.resolveHunterRevenge(roomId, hunterId, targetId);
    }

    // ================================================================
    //  HELPERS
    // ================================================================

    private autoRandom(roomId: string, roleName: string, playerId?: string): void {
        if (!playerId) return;
        const ns = this.nightState.get(roomId);
        if (!ns || ns.actions[playerId]) return;
        const room = this.roomManager.getRoom(roomId);
        if (!room) return;
        const alive = room.players.filter(p => p.alive && p.id !== playerId);
        if (alive.length === 0) return;
        const random = alive[Math.floor(Math.random() * alive.length)];
        ns.actions[playerId] = { targetId: random.id };
        this.pvtChat(roomId, playerId, `⏰ Hết giờ! Random: ${random.name}`, '⏰');
        // Seer investigation và Cupid pairing sẽ được xử lý trong resolveSeerInvestigation/resolveCupidPairing
    }

    private clearAllTimers(roomId: string): void {
        const ns = this.nightState.get(roomId);
        if (ns?.timerId) {
            clearTimeout(ns.timerId);
            ns.timerId = null;
        }
        const ds = this.dayState.get(roomId);
        if (ds?.timerId) {
            clearTimeout(ds.timerId);
            ds.timerId = null;
        }
    }

    private checkGameOver(roomId: string): boolean {
        const room = this.roomManager.getRoom(roomId);
        if (!room?.engine) return true;

        // Sync alive status from engine → gateway (important for chain deaths like lovers)
        for (const ep of room.engine.state.players) {
            const gp = room.players.find(p => p.id === ep.id);
            if (gp) {
                gp.alive = ep.alive;
                // Also sync roleName for CursedWolf transformation
                if (ep.role) gp.roleName = ep.role.name;
            }
        }

        // Use engine role.team (not gateway roleName) for accurate wolf detection
        const alive = room.players.filter(p => p.alive);
        let wolves = 0;
        let others = 0;
        for (const p of alive) {
            const ep = room.engine.state.players.find(e => e.id === p.id);
            if (ep?.role?.team === 'WEREWOLF') wolves++;
            else others++;
        }

        let winner: string | null = null;
        if (wolves === 0) winner = 'VILLAGER';
        else if (wolves >= others) winner = 'WEREWOLF';

        // Lover win check
        if (!winner && room.engine.state.loverIds) {
            const { cupidId, partnerId } = room.engine.state.loverIds;
            const cupidAlive = alive.find(p => p.id === cupidId);
            const partnerAlive = alive.find(p => p.id === partnerId);
            if (cupidAlive && partnerAlive && alive.length <= 3) winner = 'LOVER';
        }

        if (winner) {
            const icon = winner === 'WEREWOLF' ? '🐺' : (winner === 'LOVER' ? '💕' : '🏆');
            this.sysChat(roomId, `${icon} Game kết thúc! ${winner} thắng!`, icon);
            this.io.to(roomId).emit('sound_effect', { sound: 'game_over' });
            this.io.to(roomId).emit('game_over', {
                winner,
                players: room.players.map(p => ({ id: p.id, name: p.name, role: p.roleName, alive: p.alive })),
            });
            this.clearAllTimers(roomId);
            this.broadcastVisibility(roomId);
            return true;
        }
        return false;
    }

    private emitTo(pid: string, event: string, data: any): void {
        this.io.sockets.sockets.get(pid)?.emit(event, data);
    }
    /** Send non-active alive players a night_waiting event so they see a vote UI preview */
    private emitNightWaiting(roomId: string, activeIds: string[]): void {
        const room = this.roomManager.getRoom(roomId);
        if (!room) return;
        const activeSet = new Set(activeIds);
        const waitingPlayers = room.players.filter(p => p.alive && !activeSet.has(p.id));
        const allAlive = room.players.filter(p => p.alive).map(p => ({ id: p.id, name: p.name, alive: p.alive }));
        for (const p of waitingPlayers) {
            this.emitTo(p.id, 'night_waiting', { players: allAlive });
        }
    }
    private sysChat(roomId: string, content: string, icon = '📢'): void {
        this.io.to(roomId).emit('chat_message', { type: 'system', content, icon, timestamp: Date.now() });
    }
    private pvtChat(roomId: string, pid: string, content: string, icon = '🔮'): void {
        this.emitTo(pid, 'chat_message', { type: 'role-private', content, icon, timestamp: Date.now() });
    }
    private handlePlayerLeave(socket: Socket, roomId: string): void {
        const name = this.roomManager.getPlayerName(roomId, socket.id);
        this.roomManager.leaveRoom(roomId, socket.id);
        socket.leave(roomId);
        this.io.to(roomId).emit('player_left', { playerId: socket.id, playerName: name || 'Ai đó' });
        this.broadcastPlayerList(roomId);
    }
    private broadcastPlayerList(roomId: string): void {
        const room = this.roomManager.getRoom(roomId);
        if (!room) return;
        this.io.to(roomId).emit('player_list', {
            players: room.players.map(p => ({ id: p.id, name: p.name, isHost: p.id === room.hostId, ready: p.ready, alive: p.alive })),
        });
    }
    private broadcastAlive(roomId: string): void {
        const room = this.roomManager.getRoom(roomId);
        if (!room) return;
        this.io.to(roomId).emit('alive_update', {
            players: room.players.map(p => ({ id: p.id, name: p.name, alive: p.alive })),
        });
    }
    private broadcastVisibility(roomId: string): void {
        const room = this.roomManager.getRoom(roomId);
        if (!room?.engine) return;
        for (const p of room.players) {
            this.emitTo(p.id, 'role_visibility', { knownRoles: room.engine.buildRoleVisibility(p.id) });
        }
    }

    /**
     * Broadcast voice state to all players based on current phase.
     *
     * Voice rules:
     * - DAY: All alive players can speak and hear each other.
     * - NIGHT_CUPID_PICK: Everyone deaf (Cupid chưa chọn partner).
     * - NIGHT_SILENT: Cupid + partner can talk. Everyone else deaf.
     *   (Guard/Seer, Witch, Hunter phases)
     * - NIGHT_WOLVES: Wolves can talk. If partner is NOT a wolf, lovers can also talk.
     *   If partner IS a wolf, wolf talks with wolves, Cupid is deaf.
     * - DEAD: Dead players can speak/hear each other, and hear all alive players.
     */
    private broadcastVoiceState(roomId: string, voicePhase: 'DAY' | 'NIGHT_WOLVES' | 'NIGHT_SILENT' | 'NIGHT_CUPID_PICK'): void {
        const room = this.roomManager.getRoom(roomId);
        if (!room?.engine) return;

        const alivePlayers = room.players.filter(p => p.alive);
        const deadPlayers = room.players.filter(p => !p.alive);
        const allPlayerIds = room.players.map(p => p.id);
        const aliveIds = alivePlayers.map(p => p.id);
        const deadIds = deadPlayers.map(p => p.id);

        // Get wolves and lovers
        const wolves = room.players.filter(p => p.alive && p.roleName === 'Werewolf');
        const wolfIds = wolves.map(w => w.id);
        
        const loverIds: string[] = [];
        if (room.engine.state.loverIds) {
            const { cupidId, partnerId } = room.engine.state.loverIds;
            if (room.players.find(p => p.id === cupidId && p.alive)) loverIds.push(cupidId);
            if (room.players.find(p => p.id === partnerId && p.alive)) loverIds.push(partnerId);
        }

        // Check if partner is a wolf (affects lover voice during wolf phase)
        const partnerIsWolf = loverIds.length === 2 && wolfIds.some(wid => loverIds.includes(wid));

        for (const player of room.players) {
            let voiceState: VoiceState;
            const isLover = loverIds.includes(player.id);
            const isWolf = wolfIds.includes(player.id);

            if (!player.alive) {
                // Dead players: can speak to other dead, can hear everyone (alive + dead)
                voiceState = {
                    canSpeak: true,
                    canHear: allPlayerIds.filter(id => id !== player.id),
                    deafTo: aliveIds, // Alive players appear deaf to dead (dead can hear them but alive can't hear dead)
                    phase: voicePhase,
                };
            } else if (voicePhase === 'DAY') {
                // Day: All alive can speak and hear each other
                voiceState = {
                    canSpeak: true,
                    canHear: aliveIds.filter(id => id !== player.id),
                    deafTo: deadIds, // Dead appear deaf (alive can't hear dead)
                    phase: 'DAY',
                };
            } else if (voicePhase === 'NIGHT_WOLVES') {
                // Wolves phase: Wolves can speak/hear each other
                // If partner is NOT a wolf, lovers can still talk to each other
                if (isWolf) {
                    voiceState = {
                        canSpeak: true,
                        canHear: wolfIds.filter(id => id !== player.id),
                        deafTo: aliveIds.filter(id => !wolfIds.includes(id)),
                        phase: 'NIGHT_WOLVES',
                    };
                } else if (isLover && !partnerIsWolf && loverIds.length === 2) {
                    // Lover (non-wolf) can talk with partner during wolf phase (since partner is also non-wolf)
                    voiceState = {
                        canSpeak: true,
                        canHear: loverIds.filter(id => id !== player.id),
                        deafTo: aliveIds.filter(id => !loverIds.includes(id)),
                        phase: 'NIGHT_WOLVES',
                    };
                } else {
                    // Everyone else is deaf, doesn't know who's talking
                    voiceState = {
                        canSpeak: false,
                        canHear: [],
                        deafTo: aliveIds.filter(id => id !== player.id),
                        phase: 'NIGHT_WOLVES',
                    };
                }
            } else if (voicePhase === 'NIGHT_SILENT') {
                // NIGHT_SILENT: Only Cupid + partner can talk (if pair exists)
                // This applies during Guard/Seer, Witch, Hunter phases
                if (isLover && loverIds.length === 2) {
                    voiceState = {
                        canSpeak: true,
                        canHear: loverIds.filter(id => id !== player.id),
                        deafTo: aliveIds.filter(id => !loverIds.includes(id)),
                        phase: 'NIGHT_LOVERS',
                    };
                } else {
                    // Everyone else is deaf (sleeping)
                    voiceState = {
                        canSpeak: false,
                        canHear: [],
                        deafTo: aliveIds.filter(id => id !== player.id),
                        phase: 'NIGHT_SILENT',
                    };
                }
            } else {
                // Fallback: NIGHT_CUPID_PICK - Everyone is deaf (no partner yet)
                voiceState = {
                    canSpeak: false,
                    canHear: [],
                    deafTo: aliveIds.filter(id => id !== player.id),
                    phase: voicePhase,
                };
            }

            this.emitTo(player.id, 'voice_state', voiceState);
        }
    }
}

interface NightRoomState {
    phase: 'CUPID_PICK' | 'GUARD_SEER' | 'WOLVES' | 'WITCH' | 'HUNTER' | 'RESOLVE';
    actions: Record<string, any>;
    wolfVotes: Record<string, string>;
    witchAction: string | null;
    wolfTarget: string | null;
    timerId: ReturnType<typeof setTimeout> | null;
}

interface DayRoomState {
    votes: Record<string, string>; // playerId → targetId
    confirmVotes: Record<string, boolean>; // playerId → yes/no
    accusedId: string | null;
    timerId: ReturnType<typeof setTimeout> | null;
}

interface WitchPotionState {
    hasHealPotion: boolean;
    hasPoisonPotion: boolean;
}

/**
 * Voice state sent to each player.
 * Describes who can speak and who can hear in current phase.
 */
interface VoiceState {
    canSpeak: boolean;           // Can this player speak?
    canHear: string[];           // List of player IDs this player can hear
    deafTo: string[];            // List of player IDs that appear deaf to this player
    phase: string;               // Current voice phase for context
}
