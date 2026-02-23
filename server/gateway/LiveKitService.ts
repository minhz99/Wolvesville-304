import { AccessToken } from 'livekit-server-sdk';

export class LiveKitService {
    private apiKey: string;
    private apiSecret: string;
    private wsUrl: string;

    constructor() {
        this.apiKey = process.env.LIVEKIT_API_KEY || '';
        this.apiSecret = process.env.LIVEKIT_API_SECRET || '';
        this.wsUrl = process.env.LIVEKIT_URL || '';

        if (!this.apiKey || !this.apiSecret || !this.wsUrl) {
            console.warn('[LiveKitService] Missing LIVEKIT_API_KEY, LIVEKIT_API_SECRET, or LIVEKIT_URL environment variables');
        } else {
            console.log(`[LiveKitService] Initialized with URL: ${this.wsUrl}`);
        }
    }

    /**
     * Get LiveKit WebSocket URL
     */
    public getWsUrl(): string {
        return this.wsUrl;
    }

    /**
     * Check if LiveKit is configured
     */
    public isConfigured(): boolean {
        return !!(this.apiKey && this.apiSecret && this.wsUrl);
    }

    /**
     * Generate a LiveKit access token for a participant
     * @param roomId - The game room ID (used as LiveKit room name)
     * @param participantId - The player's socket ID (used as identity)
     * @param participantName - The player's display name
     */
    public async generateToken(roomId: string, participantId: string, participantName: string): Promise<string> {
        if (!this.isConfigured()) {
            console.warn('[LiveKitService] Not configured, returning empty token');
            return '';
        }

        const token = new AccessToken(this.apiKey, this.apiSecret, {
            identity: participantId,
            name: participantName,
            ttl: '24h', // Token valid for 24 hours
        });

        token.addGrant({
            roomJoin: true,
            room: roomId,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
        });

        const jwt = await token.toJwt();
        console.log(`[LiveKitService] Generated token for ${participantName} (${participantId}) in room ${roomId}`);
        return jwt;
    }
}
