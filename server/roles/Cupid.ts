import { Role } from './Role';
import { GameContext, GameEvent, Player } from '../types/GameTypes';
import { CupidLinkSkill } from '../skills/CupidLinkSkill';

export class Cupid extends Role {
    name = 'Cupid';
    displayName = 'Cupid';
    description = 'Đêm đầu tiên, chọn 1 người để kết đôi. Cả 2 cùng chết nếu 1 người bị giết. Thắng khi cả 2 còn sống và chỉ còn 1 người khác. Biết vai trò của đối phương.';
    team = 'VILLAGER';
    actionType: 'independent' | 'reactive' | 'none' = 'independent';
    nightOrder = 1; // Acts first — discuss and link on night 1

    private cupidSkill: CupidLinkSkill;

    constructor() {
        super();
        this.cupidSkill = new CupidLinkSkill();
        this.skills.push(this.cupidSkill);
    }

    /**
     * Lover win condition: both alive + only 1 other person left.
     */
    checkWinCondition(ctx: GameContext): string | null {
        return this.cupidSkill.checkLoverWin(ctx);
    }
}
