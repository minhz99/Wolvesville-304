import { GameEngine } from './server/engine/GameEngine';
import { GamePhase, DEFAULT_CONFIG } from './server/types/GameTypes';
import { Werewolf } from './server/roles/Werewolf';
import { Villager } from './server/roles/Villager';
import { Guard } from './server/roles/Guard';
import { Seer } from './server/roles/Seer';

const engine = new GameEngine();
const p1 = { id: 'p1', name: 'Wolf', alive: true, role: new Werewolf(), roleName: 'Werewolf' };
const p2 = { id: 'p2', name: 'Guard', alive: true, role: new Guard(), roleName: 'Guard' };
const p3 = { id: 'p3', name: 'Seer', alive: true, role: new Seer(), roleName: 'Seer' };
const p4 = { id: 'p4', name: 'Victim', alive: true, role: new Villager(), roleName: 'Villager' };

engine.startGame([p1, p2, p3, p4] as any);

// Wolf targets Victim
engine.handleNightAction('p1', { targetId: 'p4' });
// Guard protects Seer
engine.handleNightAction('p2', { targetId: 'p3' });
// Seer inspects Wolf
engine.handleNightAction('p3', { targetId: 'p1' });

console.log("Before resolve night, alive:", engine.state.players.map(p => `${(p as any).name}: ${p.alive}`).join(', '));
engine.resolveNight();
console.log("After resolve night, alive:", engine.state.players.map(p => `${(p as any).name}: ${p.alive}`).join(', '));
