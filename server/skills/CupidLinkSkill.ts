import { Skill } from './Skill';
import { GameContext, GameEvent, Player } from '../types/GameTypes';

/**
 * CupidLinkSkill — Used by Cupid.
 * Night 1: Cupid pairs with ONE target (self + target = lovers).
 * - Cupid knows the partner's role.
 * - Both die if one dies (chain death).
 * - Win condition: both lovers alive + only 1 other person left.
 * - Lovers can discuss together at night (handled by LiveKit).
 */
export class CupidLinkSkill extends Skill {
    name = 'CupidLink';

    private cupidId: string | null = null;
    private partnerId: string | null = null;
    private hasLinked = false;

    use(ctx: GameContext, source: Player, input?: { targetId: string }): GameEvent[] {
        // Only usable once (night 1)
        if (this.hasLinked) return [];
        if (!input?.targetId) return [];
        if (input.targetId === source.id) return []; // Can't pair with self directly via input

        const partner = ctx.getPlayer(input.targetId);
        if (!partner) return [];

        this.cupidId = source.id;
        this.partnerId = partner.id;
        this.hasLinked = true;

        // Reveal partner's role to Cupid
        const partnerRoleName = partner.role?.displayName || partner.role?.name || 'Không rõ';

        return [{
            type: 'LOVER_LINKED',
            source: source,
            target: partner,
            metadata: {
                cupidId: source.id,
                partnerId: partner.id,
                partnerRole: partnerRoleName,
            }
        }];
    }

    onEvent(ctx: GameContext, player: Player, event: GameEvent): GameEvent[] {
        if (event.type !== 'PLAYER_DEATH') return [];
        if (!this.cupidId || !this.partnerId) return [];

        const deadId = event.target?.id;
        if (!deadId) return [];

        // Check if the dead person is one of the lovers
        let survivingLoverId: string | null = null;
        if (deadId === this.cupidId) survivingLoverId = this.partnerId;
        else if (deadId === this.partnerId) survivingLoverId = this.cupidId;

        if (!survivingLoverId) return [];

        const survivor = ctx.getPlayer(survivingLoverId);
        if (!survivor || !survivor.alive) return [];

        // Clear link to prevent infinite loop
        this.cupidId = null;
        this.partnerId = null;

        return [{
            type: 'PLAYER_DEATH',
            target: survivor,
            metadata: { reason: 'LOVER_HEARTBREAK' }
        }];
    }

    /**
     * Custom win condition for lovers:
     * Both alive + only 1 other person left = lovers win.
     */
    checkLoverWin(ctx: GameContext): string | null {
        if (!this.cupidId || !this.partnerId) return null;

        const cupid = ctx.getPlayer(this.cupidId);
        const partner = ctx.getPlayer(this.partnerId);

        if (!cupid?.alive || !partner?.alive) return null;

        const alivePlayers = ctx.getAlivePlayers();
        // Both lovers alive + exactly 1 other person = 3 total alive
        if (alivePlayers.length === 3) {
            return 'LOVER';
        }

        // Edge case: only 2 left and both are lovers = instant win
        if (alivePlayers.length === 2) {
            const ids = alivePlayers.map(p => p.id);
            if (ids.includes(this.cupidId) && ids.includes(this.partnerId)) {
                return 'LOVER';
            }
        }

        return null;
    }

    public getCupidId(): string | null { return this.cupidId; }
    public getPartnerId(): string | null { return this.partnerId; }
    public isLinked(): boolean { return this.hasLinked; }
}
