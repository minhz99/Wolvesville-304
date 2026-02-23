import { Role } from './Role';
import { ProtectSkill } from '../skills/ProtectSkill';

export class Guard extends Role {
    name = 'Guard';
    displayName = 'Bảo Vệ';
    description = 'Mỗi đêm, chọn 1 người để bảo vệ khỏi bị sói cắn. Không được bảo vệ cùng 1 người 2 đêm liên tiếp.';
    team = 'VILLAGER';
    actionType: 'independent' | 'reactive' | 'none' = 'independent';
    nightOrder = 5;

    constructor() {
        super();
        this.skills.push(new ProtectSkill());
    }
}
