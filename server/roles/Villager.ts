import { Role } from './Role';

export class Villager extends Role {
    name = 'Villager';
    displayName = 'Dân Làng';
    description = 'Không có kỹ năng đặc biệt. Dựa vào quan sát, suy luận và bỏ phiếu để tìm diệt Ma Sói.';
    team = 'VILLAGER';
}
