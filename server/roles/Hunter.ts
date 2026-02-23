import { Role } from './Role';
import { GameContext, GameEvent, Player } from '../types/GameTypes';
import { ShootSkill } from '../skills/ShootSkill';

export class Hunter extends Role {
    name = 'Hunter';
    displayName = 'Thợ Săn';
    description = 'Mỗi đêm, chọn 1 mục tiêu trả thù. Khi bị giết, Thợ Săn bắn chết mục tiêu đã chọn. Nếu bị 2 phép chết cùng lúc (vừa bị cắn + ném bình) thì không thể bắn.';
    team = 'VILLAGER';
    actionType: 'independent' | 'reactive' | 'none' = 'independent';
    nightOrder = 70; // Acts after Witch

    private shootSkill: ShootSkill;

    constructor() {
        super();
        this.shootSkill = new ShootSkill();
        this.skills.push(this.shootSkill);
    }

    /**
     * Mark that Hunter received multiple death effects.
     * Called by EventBus when detecting multi-death.
     */
    markMultiDeath(): void {
        this.shootSkill.markMultiDeath();
    }

    onDeath(ctx: GameContext, player: Player): GameEvent[] {
        return this.shootSkill.onTriggerDeath(ctx, player);
    }
}
