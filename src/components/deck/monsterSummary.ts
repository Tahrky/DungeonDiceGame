import { DICE_SYMBOL_PRESENTATION } from "../../data/dice";
import { formatCost, formatHitPoints, formatMonsterArmor } from "../../game/monsterDescriptions";
import type { Monster } from "../../types/GameTypes";

export function formatMonsterSummary(monster: Monster): string {
    const cost = formatCost(monster.cost, DICE_SYMBOL_PRESENTATION.invocation.emoji);
    return `${cost} ${formatHitPoints(monster.hp)} · ${formatMonsterArmor(monster)}`;
}
