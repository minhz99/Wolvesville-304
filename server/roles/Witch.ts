import { Role } from './Role';
import { PotionSkill } from '../skills/PotionSkill';

export class Witch extends Role {
    name = 'Witch';
    displayName = 'Phù Thủy';
    description = 'Có 1 bình thuốc cứu và 1 bình thuốc độc (dùng 1 lần cả game). Hành động sau khi sói cắn — có thể cứu nạn nhân hoặc đầu độc người khác.';
    team = 'VILLAGER';
    actionType: 'independent' | 'reactive' | 'none' = 'reactive';
    nightOrder = 60;

    constructor() {
        super();
        this.skills.push(new PotionSkill());
    }
}
