// ===========================================
// Wolvesville 30/4 — Client Application
// Socket.IO + Chat + Sound + Role Visibility
// ===========================================

const socket = io();

// ---- State ----
const state = {
    playerId: null,
    playerName: '',
    roomId: null,
    isHost: false,
    isReady: false,
    isAlive: true, // Track nếu người chơi còn sống
    players: [],
    phase: 'WAITING',
    round: 0,
    role: null,
    selectedTarget: null,
    // Chế độ hành động hiện tại để điều khiển hành vi click target
    // 'idle' | 'night_role' | 'wolf_vote' | 'day_vote'
    currentActionMode: 'idle',
    timer: null,
    timerSeconds: 10,
    timerMax: 10,
    knownRoles: {}, // Role visibility: { playerId: { roleName, displayName, emoji, team } }
    config: null,
    // Voice state
    voiceState: null, // { canSpeak, canHear, deafTo, phase }
};

// Helper: kiểm tra người chơi còn sống không
function isPlayerAlive() {
    return state.isAlive;
}

// ---- DOM References ----
const $ = (id) => document.getElementById(id);

const screens = {
    join: $('screen-join'),
    lobby: $('screen-lobby'),
    game: $('screen-game'),
    result: $('screen-result'),
};

const els = {
    // Join
    playerName: $('playerName'),
    roomId: $('roomId'),
    joinBtn: $('joinBtn'),
    // Lobby
    leaveBtn: $('leaveBtn'),
    roomCode: $('roomCode'),
    playerCount: $('playerCount'),
    playerGrid: $('playerGrid'),
    roleConfig: $('roleConfig'),
    roleList: $('roleList'),
    roleTotal: $('roleTotal'),
    timerConfig: $('timerConfig'),
    readyBtn: $('readyBtn'),
    autoStartHint: $('autoStartHint'),
    // Game
    phaseIndicator: $('phaseIndicator'),
    timerText: $('timerText'),
    timerCircle: $('timerCircle'),
    aliveCount: $('aliveCount'),
    roleEmoji: $('roleEmoji'),
    roleName: $('roleName'),
    roleDesc: $('roleDesc'),
    actionArea: $('actionArea'),
    actionTitle: $('actionTitle'),
    targetGrid: $('targetGrid'),
    confirmAction: $('confirmAction'),
    // Chat
    chatMessages: $('chatMessages'),
    chatInput: $('chatInput'),
    chatSendBtn: $('chatSendBtn'),
    // Player name display
    playerNameDisplay: $('playerNameDisplay'),
    // Result
    resultIcon: $('resultIcon'),
    resultTitle: $('resultTitle'),
    resultDesc: $('resultDesc'),
    resultRoles: $('resultRoles'),
    backToLobby: $('backToLobby'),
    // Toast
    toast: $('toast'),
    toastMsg: $('toastMsg'),
    // Chat panel (collapsible)
    chatPanel: $('chatPanel'),
};

// Toggle chat panel collapse (mobile)
function toggleChat() {
    els.chatPanel?.classList.toggle('collapsed');
}

// ---- Role Registry (Vietnamese) ----
const ROLES = {
    Werewolf: { emoji: '🐺', name: 'Ma Sói', team: 'wolf', desc: 'Mỗi đêm, chọn 1 người để cắn.' },
    Guard: { emoji: '🛡️', name: 'Bảo Vệ', team: 'villager', desc: 'Chọn 1 người bảo vệ mỗi đêm.' },
    Seer: { emoji: '🔮', name: 'Tiên Tri', team: 'villager', desc: 'Soi 1 người mỗi đêm.' },
    Witch: { emoji: '🧪', name: 'Phù Thủy', team: 'villager', desc: '1 thuốc cứu + 1 thuốc độc.' },
    Villager: { emoji: '👤', name: 'Dân Làng', team: 'villager', desc: 'Suy luận và bỏ phiếu.' },
    Hunter: { emoji: '🏹', name: 'Thợ Săn', team: 'villager', desc: 'Bắn 1 người khi chết. Không bắn nếu bị 2 phép chết cùng lúc.' },
    Cupid: { emoji: '💕', name: 'Cupid', team: 'villager', desc: 'Kết đôi với 1 người. Thắng khi cả 2 sống + chỉ còn 1 người khác.' },
    Jester: { emoji: '🃏', name: 'Thằng ngốc', team: 'solo', desc: 'Thắng khi bị vote treo cổ.' },
    Elder: { emoji: '🧓', name: 'Già Làng', team: 'villager', desc: 'Chống chịu 1 lần sói cắn.' },
    CursedWolf: { emoji: '🌑', name: 'Sói Nguyền', team: 'villager', desc: 'Ban đầu là Dân. Bị sói cắn → không chết, thành Sói đêm sau.' },
};

// ---- Player Color System ----
// Mỗi người chơi có một màu riêng dựa trên index
const PLAYER_COLORS = [
    '#ef4444', // red
    '#f97316', // orange
    '#f59e0b', // amber
    '#84cc16', // lime
    '#22c55e', // green
    '#14b8a6', // teal
    '#06b6d4', // cyan
    '#3b82f6', // blue
    '#6366f1', // indigo
    '#8b5cf6', // violet
    '#a855f7', // purple
    '#d946ef', // fuchsia
    '#ec4899', // pink
    '#f43f5e', // rose
    '#64748b', // slate
    '#78716c', // stone
];

const PLAYER_ICONS = [
    '🐶', // dog
    '🐱', // cat
    '🦊', // fox
    '🐰', // rabbit
    '🐻', // bear
    '🐼', // panda
    '🦁', // lion
    '🐯', // tiger
    '🐮', // cow
    '🐸', // frog
    '🐵', // monkey
    '🐧', // penguin
    '🦉', // owl
    '🦄', // unicorn
    '🐘', // elephant
    '🐴'  // horse
];

// Lưu trữ màu và icon cho mỗi người chơi
const playerColorMap = {};

function getPlayerColor(playerId, playerIndex = 0) {
    if (!playerColorMap[playerId]) {
        playerColorMap[playerId] = {
            color: PLAYER_COLORS[playerIndex % PLAYER_COLORS.length],
            icon: PLAYER_ICONS[playerIndex % PLAYER_ICONS.length]
        };
    }
    return playerColorMap[playerId];
}

// ---- Screen Management ----
function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name]?.classList.add('active');
}

// ---- Toast ----
let toastTimeout;
function showToast(msg, duration = 3000) {
    els.toastMsg.textContent = msg;
    els.toast.classList.remove('hidden');
    els.toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        els.toast.classList.remove('show');
        setTimeout(() => els.toast.classList.add('hidden'), 300);
    }, duration);
}

// ---- Chat ----
function addChatMessage(data) {
    const msgEl = document.createElement('div');
    let cssClass = 'chat-msg';
    let html = '';

    if (data.type === 'system') {
        cssClass += ' chat-system';
        html = `<span class="chat-icon">${data.icon || '📢'}</span>${escapeHtml(data.content)}`;
    } else if (data.type === 'role-private') {
        cssClass += ' chat-role-private';
        html = `<span class="chat-icon">${data.icon || '🔮'}</span>${escapeHtml(data.content)}`;
    } else if (data.type === 'player') {
        cssClass += ' chat-player';
        html = `<span class="chat-sender">${escapeHtml(data.sender || '???')}:</span>${escapeHtml(data.content)}`;
    }

    msgEl.className = cssClass;
    msgEl.innerHTML = html;
    els.chatMessages.appendChild(msgEl);
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

// ---- Sound Effects (Web Audio) ----
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx;

function playSound(soundName) {
    if (!audioCtx) audioCtx = new AudioCtx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    gain.gain.value = 0.15;

    const sounds = {
        night_start: { freq: 220, type: 'sine', dur: 0.8 },
        whisper: { freq: 330, type: 'sine', dur: 0.4 },
        suspense: { freq: 180, type: 'triangle', dur: 0.6 },
        resolve: { freq: 440, type: 'sine', dur: 0.3 },
        day_start: { freq: 523, type: 'sine', dur: 0.5 },
        discussion: { freq: 392, type: 'triangle', dur: 0.3 },
        vote_start: { freq: 349, type: 'square', dur: 0.4 },
        defense: { freq: 294, type: 'sine', dur: 0.5 },
        tension: { freq: 247, type: 'sawtooth', dur: 0.6 },
        death: { freq: 165, type: 'sawtooth', dur: 0.8 },
        game_over: { freq: 523, type: 'sine', dur: 1.0 },
    };

    const s = sounds[soundName] || sounds.resolve;
    osc.frequency.value = s.freq;
    osc.type = s.type;
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + s.dur);
    osc.start();
    osc.stop(audioCtx.currentTime + s.dur);
}

// ---- Timer ----
function startTimer(seconds) {
    state.timerMax = seconds;
    state.timerSeconds = seconds;
    clearInterval(state.timer);
    updateTimerDisplay(seconds);

    state.timer = setInterval(() => {
        state.timerSeconds--;
        updateTimerDisplay(state.timerSeconds);
        if (state.timerSeconds <= 0) {
            clearInterval(state.timer);
            // Hết giờ: khóa lại nút xác nhận để tránh gửi hành động trễ phase.
            els.confirmAction.disabled = true;
            els.confirmAction.onclick = null;
            if (!state.selectedTarget) autoRandomTarget();
        }
    }, 1000);
}

function updateTimerDisplay(sec) {
    els.timerText.textContent = sec;
    // SVG circle circumference = 2π × r = 2π × 16 ≈ 100.53
    const circumference = 2 * Math.PI * 16;
    const pct = (sec / state.timerMax);
    els.timerCircle.style.strokeDasharray = circumference;
    els.timerCircle.style.strokeDashoffset = circumference * (1 - pct);

    const gameTimer = $('gameTimer');
    gameTimer.classList.remove('timer-warning', 'timer-danger');
    if (sec <= 5) gameTimer.classList.add('timer-danger');
    else if (sec <= 10) gameTimer.classList.add('timer-warning');
}

function autoRandomTarget() {
    // Server handles auto-random for Guard/Seer
    showToast('⏰ Hết giờ!');
}

// ---- Render Functions ----
function renderPlayers() {
    els.playerGrid.innerHTML = state.players.map((p, index) => {
        const classes = ['player-card', p.isHost ? 'is-host' : '', p.ready ? 'is-ready' : ''].filter(Boolean).join(' ');
        const playerStyle = getPlayerColor(p.id, index);
        const avatar = p.isHost ? '👑' : playerStyle.icon;
        const hostTag = p.isHost ? '<div class="player-host-tag">Chủ phòng</div>' : '';
        const readyDot = p.ready ? ' ✅' : '';

        // Role visibility tag
        let roleTag = '';
        const known = state.knownRoles[p.id];
        if (known) {
            roleTag = `<span class="role-tag-visible ${known.team === 'WEREWOLF' ? 'wolf' : (known.team === 'SOLO' ? 'solo' : 'villager')}">${known.emoji} ${known.displayName}</span>`;
        }

        return `
            <div class="${classes}" style="--player-color: ${playerStyle.color}">
                <div class="player-avatar" style="background: ${playerStyle.color}20; border: 2px solid ${playerStyle.color}">${known?.emoji || avatar}</div>
                <div>
                    <div class="player-name" style="color: ${playerStyle.color}">${escapeHtml(p.name)}${readyDot}</div>
                    ${hostTag}
                    ${roleTag}
                </div>
            </div>
        `;
    }).join('');

    els.playerCount.textContent = `${state.players.length} người`;
}

function renderRoleConfig() {
    if (!state.isHost) {
        els.roleConfig.classList.add('hidden');
        els.timerConfig.classList.add('hidden');
        return;
    }
    els.roleConfig.classList.remove('hidden');
    els.timerConfig.classList.remove('hidden');

    els.roleList.innerHTML = Object.entries(ROLES).map(([key, r]) => `
        <div class="role-item" data-role="${key}">
            <span class="role-emoji-sm">${r.emoji}</span>
            <div class="role-info">
                <div class="role-info-name">${r.name}</div>
                <div class="role-info-desc">${r.desc}</div>
            </div>
            <div class="role-counter">
                <button onclick="changeRoleCount('${key}', -1)">−</button>
                <span class="role-count" id="count-${key}">0</span>
                <button onclick="changeRoleCount('${key}', 1)">+</button>
            </div>
        </div>
    `).join('');
}

const roleConfig = {};
Object.keys(ROLES).forEach(k => roleConfig[k] = 0);

function changeRoleCount(role, delta) {
    roleConfig[role] = Math.max(0, (roleConfig[role] || 0) + delta);
    const el = $(`count-${role}`);
    if (el) el.textContent = roleConfig[role];

    const total = Object.values(roleConfig).reduce((a, b) => a + b, 0);
    els.roleTotal.textContent = `${total}/${state.players.length}`;

    socket.emit('role_config', { roomId: state.roomId, roles: roleConfig });
    checkAutoStart();
}

function getTimerConfig() {
    return {
        nightAction: parseInt($('cfgNightAction')?.value) || 10,
        wolfDiscussion: parseInt($('cfgWolfDiscussion')?.value) || 30,
        dayDiscussion: parseInt($('cfgDiscussion')?.value) || 120,
        confirmHang: parseInt($('cfgConfirmHang')?.value) || 15,
    };
}

function checkAutoStart() {
    if (!state.isHost) return;
    const total = Object.values(roleConfig).reduce((a, b) => a + b, 0);
    // Yêu cầu TẤT CẢ người chơi (kể cả host) đều sẵn sàng
    const allReady = state.players.every(p => p.ready);
    const canStart = total === state.players.length && state.players.length >= 5 && allReady;

    // Show/hide hint
    const matchRoles = total === state.players.length && state.players.length >= 5;
    if (matchRoles && !allReady) {
        els.autoStartHint.textContent = '⏳ Đang chờ tất cả sẵn sàng...';
        els.autoStartHint.classList.remove('hidden');
    } else if (!matchRoles) {
        els.autoStartHint.textContent = `⚙️ Vai trò: ${total}/${state.players.length} (cần bằng nhau, tối thiểu 5)`;
        els.autoStartHint.classList.remove('hidden');
    } else {
        els.autoStartHint.classList.add('hidden');
    }

    // Auto-start!
    if (canStart) {
        showToast('🎮 Đủ điều kiện — Game tự động bắt đầu!', 2000);
        const timers = getTimerConfig();
        socket.emit('timer_config', { roomId: state.roomId, timers });
        setTimeout(() => {
            socket.emit('start_game', { roomId: state.roomId, roles: roleConfig });
        }, 500);
    }
}

function renderTargets(players, options = {}) {
    const { includeSelf = false, showDeadAsDisabled = false, voterDetails = null } = options;

    els.targetGrid.innerHTML = players.map((p, index) => {
        // Chỉ loại bỏ bản thân khi không cho phép self-target
        if (!includeSelf && p.id === state.playerId) return '';

        // Xử lý người chết: hiển thị nhưng không click được nếu showDeadAsDisabled = true
        const isDead = !p.alive;
        const deadClass = isDead ? (showDeadAsDisabled ? 'dead-disabled' : 'dead') : '';
        const isSelf = p.id === state.playerId;
        const selfClass = isSelf ? 'is-self' : '';
        const known = state.knownRoles[p.id];
        const roleInfo = known ? `<div class="role-tag-visible ${known.team === 'WEREWOLF' ? 'wolf' : 'villager'}">${known.emoji}</div>` : '';

        // Lấy màu và icon cho người chơi
        const playerIndex = state.players.findIndex(sp => sp.id === p.id);
        const playerStyle = getPlayerColor(p.id, playerIndex >= 0 ? playerIndex : index);

        // Hiển thị icon của người đã vote cho người này
        let votersDisplay = '';
        if (voterDetails && voterDetails[p.id] && voterDetails[p.id].length > 0) {
            const voterIcons = voterDetails[p.id].map(v => {
                const voterIndex = state.players.findIndex(sp => sp.id === v.voterId);
                const voterStyle = getPlayerColor(v.voterId, voterIndex);
                return `<span class="voter-icon" title="${escapeHtml(v.voterName)}" style="background: ${voterStyle.color}">${voterStyle.icon}</span>`;
            }).join('');
            votersDisplay = `<div class="voters-row">${voterIcons}</div>`;
        }

        // Onclick handler - không cho click nếu là người chết và showDeadAsDisabled
        const onclickHandler = (isDead && showDeadAsDisabled) ? '' : `onclick="selectTarget('${p.id}')"`;

        // Check deaf state
        const isDeaf = isPlayerDeafToMe(p.id);
        const deafIcon = isDeaf ? '<div class="deaf-icon" title="Không nghe được">🔇</div>' : '';

        return `
            <div class="target-card ${deadClass} ${selfClass} ${isDeaf ? 'is-deaf' : ''}" data-id="${p.id}" ${onclickHandler} style="--player-color: ${playerStyle.color}">
                <div class="target-avatar" style="background: ${playerStyle.color}20; border: 2px solid ${playerStyle.color}">
                    ${known?.emoji || playerStyle.icon}
                    ${deafIcon}
                </div>
                <div class="target-name" style="color: ${playerStyle.color}">${escapeHtml(p.name)}${isSelf ? ' (Bạn)' : ''}</div>
                ${roleInfo}
                ${votersDisplay}
            </div>
        `;
    }).join('');
}

// Helper: Check if a player appears deaf to current player
function isPlayerDeafToMe(playerId) {
    if (!state.voiceState) return false;
    return state.voiceState.deafTo.includes(playerId);
}

// Refresh deaf icons on all visible target cards
function refreshDeafIcons() {
    document.querySelectorAll('.target-card').forEach(card => {
        const playerId = card.dataset.id;
        if (!playerId) return;
        
        const isDeaf = isPlayerDeafToMe(playerId);
        card.classList.toggle('is-deaf', isDeaf);
        
        // Update or add deaf icon in avatar
        const avatar = card.querySelector('.target-avatar');
        if (!avatar) return;
        
        let deafIcon = avatar.querySelector('.deaf-icon');
        if (isDeaf && !deafIcon) {
            deafIcon = document.createElement('div');
            deafIcon.className = 'deaf-icon';
            deafIcon.title = 'Không nghe được';
            deafIcon.textContent = '🔇';
            avatar.appendChild(deafIcon);
        } else if (!isDeaf && deafIcon) {
            deafIcon.remove();
        }
    });
}

function selectTarget(id) {
    // Chọn lần 2 cùng mục tiêu để hủy chọn
    if (state.selectedTarget === id) {
        state.selectedTarget = null;
        document.querySelectorAll('.target-card').forEach(c => c.classList.remove('selected'));
        showToast('❌ Đã hủy chọn', 1500);
        return;
    }

    state.selectedTarget = id;
    document.querySelectorAll('.target-card').forEach(c => c.classList.remove('selected'));
    document.querySelector(`.target-card[data-id="${id}"]`)?.classList.add('selected');

    // Hành vi click mục tiêu phụ thuộc vào chế độ hiện tại
    if (state.currentActionMode === 'night_role') {
        // Guard / Seer / Hunter / Cupid: chỉ cần chọn mục tiêu, server sẽ dùng kết quả cuối cùng khi hết giờ.
        socket.emit('night_action', { roomId: state.roomId, input: { targetId: state.selectedTarget } });
        showToast('✅ Đã chọn mục tiêu. Bạn có thể đổi trước khi hết giờ.', 2000);
    } else if (state.currentActionMode === 'wolf_vote') {
        // Ma Sói: vote ngay khi chọn, có thể đổi phiếu.
        socket.emit('wolf_vote', { roomId: state.roomId, targetId: state.selectedTarget });
        showToast('✅ Đã bỏ phiếu. Bạn có thể đổi trước khi hết giờ.', 2000);
    } else if (state.currentActionMode === 'day_vote') {
        // Ban ngày: bỏ phiếu nghi ngờ ngay khi chọn, có thể đổi.
        socket.emit('day_vote', { roomId: state.roomId, targetId: state.selectedTarget });
        showToast('✅ Đã bỏ phiếu. Bạn có thể đổi trước khi hết giờ.', 2000);
    } else if (state.currentActionMode === 'hunter_revenge') {
        // Thợ Săn trả thù: chọn mục tiêu và bắn ngay
        selectHunterRevenge(state.selectedTarget);
    } else {
        // Mặc định (ít dùng): giữ hành vi cũ
        els.confirmAction.disabled = false;
    }
}

function renderResult(winner, players) {
    const isWolf = winner === 'WEREWOLF';
    const isJester = winner === 'JESTER';
    const isLover = winner === 'LOVER';
    els.resultIcon.textContent = isWolf ? '🐺' : (isJester ? '🃏' : (isLover ? '💕' : '🏆'));
    els.resultTitle.textContent = isWolf ? 'Ma Sói thắng!' : (isJester ? 'Thằng ngốc thắng!' : (isLover ? 'Tình Nhân thắng!' : 'Dân Làng thắng!'));
    els.resultDesc.textContent = isWolf ? 'Sói đã thống trị ngôi làng.'
        : (isJester ? 'Thằng ngốc đã lừa được dân làng!'
            : (isLover ? 'Tình Nhân đã sống sót cùng nhau!' : 'Tất cả Ma Sói đã bị loại.'));

    els.resultRoles.innerHTML = players.map(p => {
        const r = ROLES[p.role] || { emoji: '❓', name: p.role, team: 'villager' };
        const teamClass = r.team;
        const deadClass = p.alive ? '' : 'is-dead';
        return `
            <div class="result-role-item ${deadClass}">
                <span>${r.emoji}</span>
                <span class="player-name">${escapeHtml(p.name)}</span>
                <span class="result-role-tag ${teamClass}">${r.name}</span>
                ${!p.alive ? '<span style="font-size:0.7rem">💀</span>' : ''}
            </div>
        `;
    }).join('');
}

// ---- Actions ----
function submitAction() {
    // Giữ lại cho tương thích nhưng hầu như không còn dùng,
    // vì các vai trò bây giờ auto-gửi khi chọn mục tiêu.
    if (!state.selectedTarget) return;
    socket.emit('night_action', { roomId: state.roomId, input: { targetId: state.selectedTarget } });
}

// ---- Helpers ----
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ============ EVENT LISTENERS ============

// Join
els.joinBtn.addEventListener('click', () => {
    const name = els.playerName.value.trim();
    if (!name) {
        els.playerName.classList.add('shake');
        setTimeout(() => els.playerName.classList.remove('shake'), 400);
        showToast('Vui lòng nhập tên!');
        return;
    }
    state.playerName = name;
    state.roomId = els.roomId.value.trim() || generateRoomId();
    socket.emit('join_room', { roomId: state.roomId, playerName: state.playerName });
});

// Leave
els.leaveBtn.addEventListener('click', () => {
    socket.emit('leave_room', { roomId: state.roomId });
    showScreen('join');
    state.roomId = null;
    state.isHost = false;
    state.isReady = false;
    state.players = [];
});

// Ready
els.readyBtn.addEventListener('click', () => {
    state.isReady = !state.isReady;
    socket.emit('player_ready', { roomId: state.roomId, ready: state.isReady });
    els.readyBtn.querySelector('span').textContent = state.isReady ? '✅ Đã sẵn sàng' : '✋ Sẵn sàng';
    els.readyBtn.classList.toggle('btn-primary', state.isReady);
    els.readyBtn.classList.toggle('btn-secondary', !state.isReady);
});

// Auto-start is handled by checkAutoStart() in player_list event

// Confirm action
els.confirmAction.addEventListener('click', submitAction);

// Chat send
els.chatSendBtn.addEventListener('click', sendChat);
els.chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChat(); });

function sendChat() {
    const msg = els.chatInput.value.trim();
    if (!msg) return;
    socket.emit('player_chat', { roomId: state.roomId, message: msg });
    els.chatInput.value = '';
}

// Back to lobby — fully reset game state
els.backToLobby.addEventListener('click', () => {
    // Reset all game state
    state.phase = 'WAITING';
    state.round = 0;
    state.role = null;
    state.selectedTarget = null;
    state.currentActionMode = 'idle';
    state.isAlive = true;
    state.knownRoles = {};
    state.config = null;
    clearInterval(state.timer);
    state.timer = null;
    state.timerSeconds = 10;
    state.timerMax = 10;
    state.isReady = false;
    // Reset chat
    els.chatMessages.innerHTML = '';
    // Reset ready button
    els.readyBtn.querySelector('span').textContent = '✋ Sẵn sàng';
    els.readyBtn.classList.remove('btn-primary');
    els.readyBtn.classList.add('btn-secondary');
    showScreen('lobby');
    renderRoleConfig();
});

// Input enter handling
els.playerName.addEventListener('keypress', (e) => { if (e.key === 'Enter') els.roomId.focus(); });
els.roomId.addEventListener('keypress', (e) => { if (e.key === 'Enter') els.joinBtn.click(); });

// Timer config inputs — broadcast change to server
document.querySelectorAll('.timer-field input').forEach(input => {
    input.addEventListener('change', () => {
        const timers = getTimerConfig();
        socket.emit('timer_config', { roomId: state.roomId, timers });
    });
});

// ============ SOCKET EVENTS ============

socket.on('connect', () => { state.playerId = socket.id; });

socket.on('room_joined', (data) => {
    state.roomId = data.roomId;
    state.playerId = data.playerId;
    state.isHost = data.isHost;
    els.roomCode.textContent = data.roomId;
    showScreen('lobby');
    renderRoleConfig();
    showToast(`Đã vào phòng ${data.roomId}`);
});

socket.on('player_list', (data) => {
    state.players = data.players;
    // Đồng bộ lại trạng thái \"sẵn sàng\" cục bộ của client theo server,
    // đặc biệt quan trọng với chủ phòng khi server tự reset ready về false.
    const self = state.players.find(p => p.id === state.playerId);
    if (self) {
        state.isHost = !!self.isHost;
        state.isReady = !!self.ready;
        const label = state.isReady ? '✅ Đã sẵn sàng' : '✋ Sẵn sàng';
        els.readyBtn.querySelector('span').textContent = label;
        els.readyBtn.classList.toggle('btn-primary', state.isReady);
        els.readyBtn.classList.toggle('btn-secondary', !state.isReady);
    }

    renderPlayers();
    checkAutoStart();
});

socket.on('player_joined', (data) => {
    showToast(`${data.playerName} đã vào phòng`);
});

socket.on('player_left', (data) => {
    showToast(`${data.playerName} đã rời phòng`);
});

socket.on('game_started', (data) => {
    showScreen('game');
    state.phase = data.phase;
    state.round = data.round || 1;
    state.config = data.config;

    if (data.role) {
        state.role = data.role;
        const r = ROLES[data.role] || { emoji: '❓', name: data.role, desc: '' };
        els.roleEmoji.textContent = r.emoji;
        els.roleName.textContent = r.name;
        els.roleDesc.textContent = r.desc;
    }

    // Hiển thị tên người chơi bên cạnh bộ đếm
    els.playerNameDisplay.textContent = state.playerName || '';

    showToast(`Bạn là ${ROLES[data.role]?.name || data.role}!`, 4000);
    playSound('night_start');
});

socket.on('voice_token', async (data) => {
    console.log('[App] Received voice token');
    try {
        await window.audioClient.connect(data.token, data.wsUrl, data.playerId);
        console.log('[App] Voice chat connected successfully');
    } catch (error) {
        console.error('[App] Failed to connect voice chat:', error);
    }
});

socket.on('phase_change', (data) => {
    state.phase = data.phase;
    state.round = data.round || state.round;
    // Mỗi lần đổi phase, reset chế độ hành động và target
    state.currentActionMode = 'idle';
    state.selectedTarget = null;

    const phaseEl = els.phaseIndicator;
    phaseEl.classList.remove('phase-night', 'phase-day', 'phase-vote');

    // Người chết luôn xem góc nhìn thượng đế
    if (!isPlayerAlive()) {
        showDeadPlayerUI();
    }

    if (data.phase.includes('NIGHT')) {
        phaseEl.classList.add('phase-night');
        phaseEl.innerHTML = `<span class="phase-icon">🌙</span><span class="phase-text">Đêm ${state.round}</span>`;
        // Clear action area khi vào đêm (chỉ cho người sống)
        if (isPlayerAlive()) {
            els.actionTitle.textContent = '🌙 Đêm đang đến...';
            els.targetGrid.innerHTML = '<div class="chat-msg chat-system">Chờ lượt của bạn...</div>';
        }
    } else if (data.phase.includes('DEFENSE')) {
        phaseEl.classList.add('phase-vote');
        phaseEl.innerHTML = `<span class="phase-icon">⚖️</span><span class="phase-text">Biện minh</span>`;
    } else if (data.phase.includes('CONFIRM')) {
        phaseEl.classList.add('phase-vote');
        phaseEl.innerHTML = `<span class="phase-icon">🪢</span><span class="phase-text">Xác nhận</span>`;
    } else if (data.phase.includes('VOTING')) {
        phaseEl.classList.add('phase-vote');
        phaseEl.innerHTML = `<span class="phase-icon">🗳️</span><span class="phase-text">Bỏ phiếu</span>`;
    } else if (data.phase.includes('DAY')) {
        phaseEl.classList.add('phase-day');
        phaseEl.innerHTML = `<span class="phase-icon">☀️</span><span class="phase-text">Ngày ${state.round}</span>`;
    }

    // Khi sang phase mới, nếu có timeLimit cho phase thảo luận ban ngày thì khởi động đếm ngược.
    if (data.phase === 'DAY_DISCUSSION' && data.timeLimit) {
        startTimer(data.timeLimit);
    }
});

socket.on('night_action_request', (data) => {
    // Người chết không xử lý action requests
    if (!isPlayerAlive()) return;

    state.selectedTarget = null;
    state.currentActionMode = 'night_role';
    // Ẩn nút xác nhận cho các vai trò đêm — chỉ cần chọn mục tiêu và chờ hết giờ
    els.confirmAction.classList.add('hidden');
    // Guard và các vai trò đêm có thể chọn bản thân
    if (data.players) renderTargets(data.players, { includeSelf: true });
    if (data.actionTitle) els.actionTitle.textContent = data.actionTitle;
    if (data.timeLimit) startTimer(data.timeLimit);
});

socket.on('night_result', (data) => {
    if (data.message) showToast(data.message);
});

socket.on('player_died', (data) => {
    showToast(`💀 ${data.playerName} đã chết.`);
});

socket.on('alive_update', (data) => {
    // Merge alive status into players
    if (data.players) {
        state.players = data.players;
        els.aliveCount.textContent = `${data.players.filter(p => p.alive).length} sống`;

        // Cập nhật trạng thái sống của bản thân
        const self = data.players.find(p => p.id === state.playerId);
        if (self) {
            const wasPreviouslyAlive = state.isAlive;
            state.isAlive = self.alive;

            // Nếu vừa chết, hiển thị giao diện thượng đế
            if (wasPreviouslyAlive && !state.isAlive) {
                showToast('💀 Bạn đã chết! Giờ bạn là quan sát viên.', 5000);
                showDeadPlayerUI();
            }
        }

        renderPlayers();
    }
});

// Hiển thị giao diện cho người đã chết (quan sát viên)
function showDeadPlayerUI() {
    els.actionTitle.textContent = '👻 Bạn đã chết - Quan sát trò chơi';
    renderDeadPlayerView();
    els.confirmAction.classList.add('hidden');
}

// Render danh sách tất cả người chơi cùng vai trò cho người chết (góc nhìn thượng đế)
// UI giống như dân làng bình thường nhưng hiển thị icon và tên vai trò
function renderDeadPlayerView() {
    if (!state.players || state.players.length === 0) {
        els.targetGrid.innerHTML = '<div class="chat-msg chat-system">Đang tải...</div>';
        return;
    }

    // Sắp xếp: người sống trước, người chết sau (theo index gốc)
    const sortedPlayers = [...state.players].sort((a, b) => {
        const aAlive = a.alive !== false ? 1 : 0;
        const bAlive = b.alive !== false ? 1 : 0;
        return bAlive - aAlive;
    });

    // Render giống như dân làng bình thường, dùng target-grid style
    // Người chết có thể nghe tất cả, nhưng hiển thị deaf icon cho người sống (vì người sống không nghe được người chết)
    els.targetGrid.innerHTML = sortedPlayers.map(p => {
        const roleInfo = state.knownRoles[p.id];
        const roleEmoji = roleInfo?.emoji || '❓';
        const roleName = roleInfo?.displayName || '???';
        const isAlive = p.alive !== false;
        const playerIndex = state.players.findIndex(pl => pl.id === p.id);
        const playerStyle = getPlayerColor(p.id, playerIndex);
        
        // Người sống hiện deaf icon (họ không nghe được người chết)
        const isDeaf = isAlive && isPlayerDeafToMe(p.id);
        const deafIcon = isDeaf ? '<div class="deaf-icon" title="Không nghe được bạn">🔇</div>' : '';

        return `
            <div class="target-card ${isDeaf ? 'is-deaf' : ''}" data-id="${p.id}" style="pointer-events:none;opacity:${isAlive ? 1 : 0.5}">
                <div class="target-avatar" style="background: ${playerStyle.color}20; border: 2px solid ${playerStyle.color}">
                    ${roleEmoji}
                    ${deafIcon}
                </div>
                <div class="target-name" style="color: ${playerStyle.color}">${escapeHtml(p.name)}</div>
                <div class="target-role" style="font-size:0.7rem;color:var(--text-secondary)">${roleName}</div>
            </div>
        `;
    }).join('');
}

socket.on('role_visibility', (data) => {
    state.knownRoles = data.knownRoles || {};
    renderPlayers(); // Re-render with visible role tags
    
    // Nếu đang ở giao diện chờ, re-render để hiện role mới
    if (state.currentActionMode === 'idle' && state.phase.includes('NIGHT')) {
        const allAlive = state.players.filter(p => p.alive !== false);
        showNightWaitingUI({ players: allAlive }, els.actionTitle.textContent);
    }
});

socket.on('voice_state', (data) => {
    state.voiceState = data;
    
    // Update audio client
    if (window.audioClient) {
        window.audioClient.handleVoiceState(data);
    }
    
    // Re-render target grid to show deaf icons
    refreshDeafIcons();
});

socket.on('chat_message', (data) => {
    addChatMessage(data);
});

socket.on('lover_discussion', (data) => {
    addChatMessage({
        type: 'role-private',
        content: `💕 Thời gian thảo luận Tình Nhân (${data.timeLimit}s)`,
        icon: '💕',
    });
});

// === NIGHT WAITING (vote UI preview while waiting for night to end) ===
socket.on('night_waiting', (data) => {
    // Only show if player has no active night action
    if (state.currentActionMode !== 'idle') return;

    showNightWaitingUI(data, '🌙 Đang chờ... (vote khi ban ngày)');
});

// === CUPID WAITING (Cupid đã chọn xong, chờ các vai trò khác) ===
socket.on('cupid_waiting', (data) => {
    // Reset action mode để Cupid có thể thấy giao diện chờ
    state.currentActionMode = 'idle';
    state.selectedTarget = null;
    
    showNightWaitingUI(data, '💕 Đã chọn người yêu! Đang chờ...');
});

// Helper: hiển thị giao diện chờ ban đêm
function showNightWaitingUI(data, title) {
    els.actionTitle.textContent = title;
    els.confirmAction.classList.add('hidden');
    if (data.players) {
        // Render targets as disabled preview — can't interact during night
        els.targetGrid.innerHTML = data.players.map((p, index) => {
            const playerIndex = state.players.findIndex(sp => sp.id === p.id);
            const playerStyle = getPlayerColor(p.id, playerIndex >= 0 ? playerIndex : index);
            const known = state.knownRoles[p.id];
            const isSelf = p.id === state.playerId;
            // Hiển thị role nếu biết (VD: Cupid biết role của partner)
            const roleTag = known ? `<div class="role-tag-visible ${known.team === 'WEREWOLF' ? 'wolf' : 'villager'}" style="font-size:0.7rem;margin-top:4px">${known.emoji} ${known.displayName}</div>` : '';
            // Check deaf state
            const isDeaf = isPlayerDeafToMe(p.id);
            const deafIcon = isDeaf ? '<div class="deaf-icon" title="Không nghe được">🔇</div>' : '';
            return `
                <div class="target-card ${isSelf ? 'is-self' : ''} ${isDeaf ? 'is-deaf' : ''}" data-id="${p.id}" style="--player-color: ${playerStyle.color}; opacity: 0.7; pointer-events: none;">
                    <div class="target-avatar" style="background: ${playerStyle.color}20; border: 2px solid ${playerStyle.color}">
                        ${known?.emoji || playerStyle.icon}
                        ${deafIcon}
                    </div>
                    <div class="target-name" style="color: ${playerStyle.color}">${escapeHtml(p.name)}${isSelf ? ' (Bạn)' : ''}</div>
                    ${roleTag}
                </div>
            `;
        }).join('');
    }
}

socket.on('sound_effect', (data) => {
    if (data.sound) playSound(data.sound);
});

// === WOLF VOTING ===
socket.on('wolf_action_request', (data) => {
    // Người chết không xử lý action requests
    if (!isPlayerAlive()) return;

    state.selectedTarget = null;
    state.currentActionMode = 'wolf_vote';
    els.actionTitle.textContent = data.actionTitle || 'Bỏ phiếu chọn mục tiêu';
    // Sói có thể chọn bất kỳ ai kể cả sói khác hoặc bản thân
    if (data.players) renderTargets(data.players, { includeSelf: true });
    if (data.timeLimit) startTimer(data.timeLimit);
    // Ẩn nút xác nhận — Sói chỉ cần chọn mục tiêu, vote gửi ngay
    els.confirmAction.classList.add('hidden');
});

socket.on('wolf_vote_update', (data) => {
    if (data.votes) {
        const summary = data.votes.map(v => `${v.wolfName} → ${v.targetName}`).join(', ');
        addChatMessage({ type: 'role-private', content: `🐺 Votes: ${summary}`, icon: '🐺' });
    }
});

// === WITCH ACTION ===
socket.on('witch_action_request', (data) => {
    // Người chết không xử lý action requests
    if (!isPlayerAlive()) return;

    clearInterval(state.timer);
    els.actionTitle.textContent = '🧪 Phù Thủy — Quyết định';
    if (data.timeLimit) startTimer(data.timeLimit);

    // Build witch-specific UI
    let html = '';

    // Hiển thị trạng thái bình thuốc
    const healStatus = data.hasHealPotion ? '💊 Còn bình cứu' : '❌ Đã dùng bình cứu';
    const poisonStatus = data.hasPoisonPotion ? '☠️ Còn bình độc' : '❌ Đã dùng bình độc';
    html += `<div class="chat-msg chat-system" style="margin-bottom:8px">${healStatus} | ${poisonStatus}</div>`;

    if (data.victimId && data.hasHealPotion) {
        html += `<div class="chat-msg chat-role-private">💀 Nạn nhân đêm nay: <strong>${escapeHtml(data.victimName)}</strong></div>`;
        html += `<button class="btn btn-primary btn-lg" style="margin:8px 0;width:100%" onclick="witchSave()">💊 Cứu ${escapeHtml(data.victimName)}</button>`;
    } else if (data.victimId && !data.hasHealPotion) {
        html += `<div class="chat-msg chat-role-private">💀 Nạn nhân đêm nay: <strong>${escapeHtml(data.victimName)}</strong> (Không thể cứu - đã dùng bình cứu)</div>`;
    } else {
        html += `<div class="chat-msg chat-system">☀️ Không ai bị cắn đêm nay.</div>`;
    }

    if (data.hasPoisonPotion) {
        html += `<div style="margin-top:8px"><h4 style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px">☠️ Ném bình độc (có thể chọn bản thân):</h4></div>`;

        if (data.players) {
            // Phù thủy có thể đầu độc bất kỳ ai, kể cả bản thân
            html += data.players.map(p => {
                const isSelf = p.id === state.playerId;
                return `
                    <div class="target-card ${isSelf ? 'is-self' : ''}" data-id="${p.id}" onclick="witchSelectKill('${p.id}')">
                        <div class="target-avatar">👤</div>
                        <div class="target-name">${escapeHtml(p.name)}${isSelf ? ' (Bạn)' : ''}</div>
                    </div>
                `;
            }).join('');
        }
    } else {
        html += `<div class="chat-msg chat-system" style="margin-top:8px">❌ Đã dùng hết bình độc</div>`;
    }

    els.targetGrid.innerHTML = html;
    els.confirmAction.classList.add('hidden');
});

let witchKillTarget = null;
function witchSelectKill(id) {
    witchKillTarget = id;
    document.querySelectorAll('.target-card').forEach(c => c.classList.remove('selected'));
    document.querySelector(`.target-card[data-id="${id}"]`)?.classList.add('selected');
    // Auto-send kill
    socket.emit('witch_action', { roomId: state.roomId, action: 'kill', targetId: id });
    showToast('☠️ Đã ném bình!');
}
function witchSave() {
    socket.emit('witch_action', { roomId: state.roomId, action: 'save' });
    showToast('💊 Đã cứu!');
}

// === DAY VOTE ===
// Lưu danh sách người chơi và votes để re-render khi có vote_update
let dayVotePlayers = [];
let currentVoteDetails = {}; // { targetId: [{ voterId, voterName }] }

socket.on('day_vote_request', (data) => {
    // Người chết không xử lý action requests
    if (!isPlayerAlive()) return;

    state.selectedTarget = null;
    state.currentActionMode = 'day_vote';
    currentVoteDetails = {};
    // Thảo luận và bỏ phiếu gộp chung
    els.actionTitle.textContent = '☀️ Thảo luận & Bỏ phiếu - Chọn người nghi ngờ';
    // Ẩn nút xác nhận — click vào người nghi ngờ là gửi vote luôn, hết giờ tự xác nhận
    els.confirmAction.classList.add('hidden');
    if (data.players) {
        dayVotePlayers = data.players;
        // Cho phép vote bản thân trong day vote
        renderTargets(data.players, { includeSelf: true, showDeadAsDisabled: true });
    }
    if (data.timeLimit) startTimer(data.timeLimit);
});

socket.on('vote_update', (data) => {
    if (data.voteDetails) {
        // voteDetails format: [{ voterId, voterName, targetId, targetName }]
        // Thông báo vote đã được gửi từ server qua sysChat(), không cần hiển thị lại

        // Cập nhật voteDetails để hiển thị icon dưới avatar
        if (state.currentActionMode === 'day_vote' && dayVotePlayers.length > 0) {
            // Group votes by target: { targetId: [{ voterId, voterName }] }
            currentVoteDetails = {};
            for (const v of data.voteDetails) {
                if (!currentVoteDetails[v.targetId]) {
                    currentVoteDetails[v.targetId] = [];
                }
                currentVoteDetails[v.targetId].push({ voterId: v.voterId, voterName: v.voterName });
            }

            renderTargets(dayVotePlayers, { includeSelf: true, showDeadAsDisabled: true, voterDetails: currentVoteDetails });

            // Khôi phục selection nếu đã chọn
            if (state.selectedTarget) {
                document.querySelector(`.target-card[data-id="${state.selectedTarget}"]`)?.classList.add('selected');
            }
        }
    }
});

// === DAY DEFENSE ===
socket.on('day_defense', (data) => {
    clearInterval(state.timer);
    if (data.timeLimit) startTimer(data.timeLimit);
    addChatMessage({ type: 'system', content: `⚖️ ${data.accusedName} đang biện minh... (${data.timeLimit}s)`, icon: '⚖️' });
    els.actionTitle.textContent = `⚖️ ${data.accusedName} đang biện minh`;
    els.targetGrid.innerHTML = '';
    els.confirmAction.classList.add('hidden');
});

// === CONFIRM HANG ===
socket.on('confirm_hang_request', (data) => {
    // Người chết không xử lý action requests
    if (!isPlayerAlive()) return;

    clearInterval(state.timer);
    if (data.timeLimit) startTimer(data.timeLimit);

    // Nếu là người bị cáo, hiện thông báo khác nhưng vẫn cho vote
    if (data.isSelfAccused) {
        els.actionTitle.textContent = '⚖️ Bạn bị đưa lên giàn - Chấp nhận hay không?';
    } else {
        els.actionTitle.textContent = `🪢 Treo cổ ${data.accusedName}?`;
    }

    els.targetGrid.innerHTML = `
        <div style="display:flex;gap:12px;width:100%;justify-content:center;padding:16px">
            <button class="btn btn-danger btn-lg" style="flex:1" onclick="confirmHangVote(true)">
                👍
            </button>
            <button class="btn btn-secondary btn-lg" style="flex:1" onclick="confirmHangVote(false)">
                👎
            </button>
        </div>
    `;
    els.confirmAction.classList.add('hidden');
});

function confirmHangVote(vote) {
    socket.emit('confirm_hang', { roomId: state.roomId, vote });
    showToast(vote ? '👍 Đã đồng ý' : '👎 Đã phản đối');
    els.targetGrid.innerHTML = '<div class="chat-msg chat-system">✅ Đã bỏ phiếu</div>';
}

// === HUNTER REVENGE ===
// Hunter đã chết nhưng vẫn được phép bắn trả thù
socket.on('hunter_revenge_request', (data) => {
    state.selectedTarget = null;
    state.currentActionMode = 'hunter_revenge';

    // Override: cho phép Hunter hành động dù đã chết
    els.actionTitle.textContent = data.actionTitle || '🏹 Chọn người trả thù trước khi chết!';
    els.confirmAction.classList.add('hidden');

    if (data.players) {
        // Render targets với onclick handler hoạt động
        els.targetGrid.innerHTML = data.players.map((p, index) => {
            const playerIndex = state.players.findIndex(sp => sp.id === p.id);
            const playerStyle = getPlayerColor(p.id, playerIndex >= 0 ? playerIndex : index);
            const known = state.knownRoles[p.id];

            return `
                <div class="target-card" data-id="${p.id}" onclick="selectTarget('${p.id}')" style="--player-color: ${playerStyle.color}">
                    <div class="target-avatar" style="background: ${playerStyle.color}20; border: 2px solid ${playerStyle.color}">${known?.emoji || playerStyle.icon}</div>
                    <div class="target-name" style="color: ${playerStyle.color}">${escapeHtml(p.name)}</div>
                </div>
            `;
        }).join('');
    }
    if (data.timeLimit) startTimer(data.timeLimit);
});

function selectHunterRevenge(targetId) {
    socket.emit('hunter_revenge', { roomId: state.roomId, targetId });
    const target = state.players.find(p => p.id === targetId);
    showToast(`🏹 Bắn ${target?.name || 'mục tiêu'}!`);
    els.targetGrid.innerHTML = '<div class="chat-msg chat-system">🏹 Đã chọn mục tiêu trả thù!</div>';
    state.currentActionMode = 'idle';
}

socket.on('action_confirmed', (data) => {
    if (data.message) showToast(data.message);
});

socket.on('game_over', (data) => {
    clearInterval(state.timer);
    renderResult(data.winner, data.players);
    showScreen('result');
    playSound('game_over');
});

socket.on('error', (data) => {
    showToast(`❌ ${data.message}`);
});

socket.on('disconnect', () => {
    showToast('Mất kết nối server...');
});

// ---- Init ----
showScreen('join');
els.playerName.focus();
