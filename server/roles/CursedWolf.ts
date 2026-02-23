import { Role } from './Role';
import { CursedTransformSkill } from '../skills/CursedTransformSkill';

export class CursedWolf extends Role {
    name = 'CursedWolf';
    displayName = 'Sói Nguyền';
    description = 'Ban đầu là Dân Làng. Nếu bị sói cắn, sẽ không chết mà trở thành Ma Sói ở đêm tiếp theo.';
    team = 'VILLAGER'; // Starts as villager, transforms after being bitten
    actionType: 'independent' | 'reactive' | 'none' = 'reactive';
    nightOrder = 80; // Processes last — checks transformation

    constructor() {
        super();
        this.skills.push(new CursedTransformSkill());
    }
}
