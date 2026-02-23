import { Role } from './Role';
import { AttackSkill } from '../skills/AttackSkill';

export class Werewolf extends Role {
    name = 'Werewolf';
    displayName = 'Ma Sói';
    description = 'Mỗi đêm, bầy sói cùng thức dậy và chọn 1 người để cắn. Phe sói thắng khi số sói ≥ số dân còn sống.';
    team = 'WEREWOLF';
    actionType: 'independent' | 'reactive' | 'none' = 'independent';
    nightOrder = 50;

    constructor() {
        super();
        this.skills.push(new AttackSkill());
    }
}
