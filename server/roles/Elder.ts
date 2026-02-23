import { Role } from './Role';
import { ElderShieldSkill } from '../skills/ElderShieldSkill';

export class Elder extends Role {
    name = 'Elder';
    displayName = 'Già Làng';
    description = 'Chống chịu được 1 lần bị sói cắn (có 2 mạng với sói). Nếu bị bỏ phiếu treo cổ hoặc bị đầu độc thì chết bình thường.';
    team = 'VILLAGER';
    actionType: 'independent' | 'reactive' | 'none' = 'reactive';

    // No active night action — shield is passive

    constructor() {
        super();
        this.skills.push(new ElderShieldSkill());
    }
}
