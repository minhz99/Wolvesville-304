import { Role } from './Role';
import { InvestigateSkill } from '../skills/InvestigateSkill';

export class Seer extends Role {
    name = 'Seer';
    displayName = 'Tiên Tri';
    description = 'Mỗi đêm, chọn 1 người để soi — biết người đó là Ma Sói hay Dân Làng.';
    team = 'VILLAGER';
    actionType: 'independent' | 'reactive' | 'none' = 'independent';
    nightOrder = 10;

    constructor() {
        super();
        this.skills.push(new InvestigateSkill());
    }
}
