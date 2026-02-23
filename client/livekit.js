// LiveKit Voice Client Integration
// Manages audio connections and mute/unmute based on game phase

class AudioClient {
    constructor() {
        this.room = null; // LiveKit Room instance
        this.localParticipant = null;
        this.isConnected = false;
        this.currentVoiceState = null;
        this.playerId = null;
    }

    /**
     * Connect to LiveKit audio room
     * @param {string} token - JWT token from server
     * @param {string} wsUrl - LiveKit server WebSocket URL
     * @param {string} playerId - Current player's ID
     */
    async connect(token, wsUrl, playerId) {
        this.playerId = playerId;
        
        if (!token || !wsUrl) {
            console.warn('[AudioClient] No token or wsUrl provided, voice chat disabled');
            return;
        }
        
        try {
            // Create LiveKit room instance
            this.room = new LivekitClient.Room({
                adaptiveStream: true,
                dynacast: true,
                audioCaptureDefaults: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                }
            });
            
            // Set up event listeners before connecting
            this.setupRoomListeners();
            
            // Connect to LiveKit server
            await this.room.connect(wsUrl, token);
            this.localParticipant = this.room.localParticipant;
            this.isConnected = true;
            
            console.log(`[AudioClient] Connected to LiveKit for player ${playerId}`);
            
            // Enable microphone (will be controlled by voice state)
            await this.localParticipant.setMicrophoneEnabled(true);
            
        } catch (error) {
            console.error('[AudioClient] Failed to connect:', error);
            this.isConnected = false;
        }
    }

    /**
     * Set up LiveKit room event listeners
     */
    setupRoomListeners() {
        if (!this.room) return;
        
        this.room.on(LivekitClient.RoomEvent.ParticipantConnected, (participant) => {
            console.log(`[AudioClient] Participant joined: ${participant.identity}`);
        });
        
        this.room.on(LivekitClient.RoomEvent.ParticipantDisconnected, (participant) => {
            console.log(`[AudioClient] Participant left: ${participant.identity}`);
        });
        
        this.room.on(LivekitClient.RoomEvent.TrackSubscribed, (track, publication, participant) => {
            if (track.kind === LivekitClient.Track.Kind.Audio) {
                console.log(`[AudioClient] Subscribed to audio from: ${participant.identity}`);
                // Attach audio track to play
                const audioElement = track.attach();
                audioElement.id = `audio-${participant.identity}`;
                document.body.appendChild(audioElement);
            }
        });
        
        this.room.on(LivekitClient.RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
            if (track.kind === LivekitClient.Track.Kind.Audio) {
                console.log(`[AudioClient] Unsubscribed from audio: ${participant.identity}`);
                track.detach().forEach(el => el.remove());
            }
        });
        
        this.room.on(LivekitClient.RoomEvent.Disconnected, (reason) => {
            console.log(`[AudioClient] Disconnected: ${reason}`);
            this.isConnected = false;
        });
        
        this.room.on(LivekitClient.RoomEvent.Reconnecting, () => {
            console.log('[AudioClient] Reconnecting...');
        });
        
        this.room.on(LivekitClient.RoomEvent.Reconnected, () => {
            console.log('[AudioClient] Reconnected');
        });
    }

    /**
     * Disconnect from audio room
     */
    async disconnect() {
        if (this.room) {
            await this.room.disconnect();
        }
        this.room = null;
        this.localParticipant = null;
        this.isConnected = false;
        this.currentVoiceState = null;
        console.log('[AudioClient] Disconnected');
    }

    /**
     * Handle voice state update from server
     * @param {Object} voiceState - Voice state from server
     * @param {boolean} voiceState.canSpeak - Can this player speak?
     * @param {string[]} voiceState.canHear - List of player IDs this player can hear
     * @param {string[]} voiceState.deafTo - List of player IDs that appear deaf to this player
     * @param {string} voiceState.phase - Current voice phase
     */
    handleVoiceState(voiceState) {
        this.currentVoiceState = voiceState;
        console.log(`[AudioClient] Voice state update: phase=${voiceState.phase}, canSpeak=${voiceState.canSpeak}`);
        
        // Update local microphone state
        this.setLocalMicEnabled(voiceState.canSpeak);
        
        // Update which remote participants we can hear
        this.updateRemoteAudioSubscriptions(voiceState.canHear);
        
        // Dispatch event for UI to update deaf icons
        window.dispatchEvent(new CustomEvent('voice_state_changed', { 
            detail: voiceState 
        }));
    }

    /**
     * Enable/disable local microphone
     * @param {boolean} enabled 
     */
    async setLocalMicEnabled(enabled) {
        if (!this.isConnected || !this.localParticipant) {
            console.log(`[AudioClient] Mic ${enabled ? 'enabled' : 'disabled'} (not connected)`);
            return;
        }
        
        try {
            await this.localParticipant.setMicrophoneEnabled(enabled);
            console.log(`[AudioClient] Mic ${enabled ? 'enabled' : 'disabled'}`);
        } catch (error) {
            console.error('[AudioClient] Failed to set mic state:', error);
        }
    }

    /**
     * Update which remote participants we subscribe to (hear)
     * @param {string[]} canHearIds - List of player IDs we can hear
     */
    updateRemoteAudioSubscriptions(canHearIds) {
        if (!this.isConnected || !this.room) {
            console.log(`[AudioClient] Can hear: ${canHearIds?.length || 0} players (not connected)`);
            return;
        }
        
        const canHearSet = new Set(canHearIds || []);
        
        // Iterate through all remote participants and mute/unmute their audio
        for (const participant of this.room.remoteParticipants.values()) {
            const shouldHear = canHearSet.has(participant.identity);
            
            for (const publication of participant.audioTrackPublications.values()) {
                if (publication.track) {
                    // Mute/unmute the audio element
                    const audioElements = publication.track.attachedElements;
                    audioElements.forEach(el => {
                        el.muted = !shouldHear;
                    });
                }
            }
        }
        
        console.log(`[AudioClient] Subscribing to ${canHearIds?.length || 0} audio streams`);
    }

    /**
     * Get current voice state
     * @returns {Object|null}
     */
    getVoiceState() {
        return this.currentVoiceState;
    }

    /**
     * Check if a specific player appears deaf to current player
     * @param {string} playerId 
     * @returns {boolean}
     */
    isPlayerDeaf(playerId) {
        if (!this.currentVoiceState) return false;
        return this.currentVoiceState.deafTo.includes(playerId);
    }

    /**
     * Check if current player can speak
     * @returns {boolean}
     */
    canSpeak() {
        if (!this.currentVoiceState) return false;
        return this.currentVoiceState.canSpeak;
    }

    /**
     * Get current voice phase
     * @returns {string}
     */
    getPhase() {
        return this.currentVoiceState?.phase || 'UNKNOWN';
    }
    
    /**
     * Get list of speaking participants (for UI indicator)
     * @returns {string[]} Array of participant IDs who are currently speaking
     */
    getSpeakingParticipants() {
        if (!this.room) return [];
        
        const speaking = [];
        for (const participant of this.room.remoteParticipants.values()) {
            if (participant.isSpeaking) {
                speaking.push(participant.identity);
            }
        }
        if (this.localParticipant?.isSpeaking) {
            speaking.push(this.playerId);
        }
        return speaking;
    }
}

// Global audio client instance
const audioClient = new AudioClient();

// Export for use in app.js
window.audioClient = audioClient;
