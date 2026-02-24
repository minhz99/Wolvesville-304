import { GamePhase, Player, GameContext } from '../types/GameTypes';

export class WinEvaluator {
    /**
     * Evaluates the current game state to check if any team has won.
     * By default:
     * - Wolves win if the number of wolves >= number of non-wolves.
     * - Villagers win if the number of wolves == 0.
     * - Roles can add their own checkWinCondition overrides.
     */
    public evaluate(context: GameContext): string | null {
        const alivePlayers = context.getAlivePlayers();

        // Allow roles to override win condition first (e.g. Solo roles, Fools/Jesters)
        for (const player of alivePlayers) {
            if (player.role && player.role.checkWinCondition) {
                const winner = player.role.checkWinCondition(context);
                if (winner) return winner;
            }
        }

        // Default evaluate
        let wolves = 0;
        let others = 0; // All non-wolf players (VILLAGER + SOLO + any other team)

        for (const player of alivePlayers) {
            if (player.role?.team === 'WEREWOLF') {
                wolves++;
            } else {
                others++;
            }
        }

        if (wolves === 0) {
            return 'VILLAGER'; // Villagers eliminated all wolves
        }

        if (wolves >= others) {
            return 'WEREWOLF'; // Wolves equal or outnumber the rest
        }

        // Lover win check
        const loverIds = context.getLoverIds();
        if (loverIds) {
            const { cupidId, partnerId } = loverIds;
            const cupidAlive = alivePlayers.find(p => p.id === cupidId);
            const partnerAlive = alivePlayers.find(p => p.id === partnerId);

            // If both lovers are alive, and there is at most 1 other person alive
            if (cupidAlive && partnerAlive && alivePlayers.length <= 3) {
                // Determine if we should prioritize LOVER win over WEREWOLF win.
                // Usually, if lovers are the only ones left (or 1 other person), lovers win.
                return 'LOVER';
            }
        }

        return null; // Game continues
    }
}
