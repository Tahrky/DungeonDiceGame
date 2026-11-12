import { DICE_SYMBOL_PRESENTATION } from "../data/dice";
import { getMovementActionsPerTurn, getMovementCost } from "./monsterActions";

import type { AttackPattern, Monster, MonsterAttack } from "../types/GameTypes";

export function getAttackPatternDescription(pattern: AttackPattern): string {
    switch (pattern.type) {
        case "line":
            if (pattern.allDirections) {
                const minRange = pattern.minRange ?? 1;
                const range =
                    minRange === 1
                        ? `portée maximale ${pattern.range}`
                        : `portée ${minRange}–${pattern.range}`;
                return `ligne ${pattern.length ?? 1} cases, ${range}`;
            }
            return `ligne ${pattern.range} cases`;
        case "area":
            return `zone ${pattern.width}×${pattern.depth}, portée ${pattern.range}`;
        case "directionalArea":
            return `zone ${pattern.width}×${pattern.depth} autour de lui`;
        case "jumpArea":
            return `saut 2×2, portée ${pattern.range} cases`;
        case "radius":
            return `zone circulaire, portée ${pattern.range}`;
        case "selfRadius":
            return `zone circulaire autour de lui, portée ${pattern.range}`;
        case "adjacent":
            return "corps à corps";
    }
}

export function describeMonsterAttack(attack: MonsterAttack): string {
    const special = attack.movesToZone && attack.pattern.type !== "jumpArea" ? ", saut" : "";
    const cooldown =
        attack.cooldownTurns !== undefined
            ? `, recharge : ${attack.cooldownTurns} tour${attack.cooldownTurns === 1 ? "" : "s"} du joueur`
            : "";
    const friendlyFire = attack.hitsAllies ? ", touche aussi les alliés" : "";
    return `${attack.name} : ${attack.damage} dégâts, ${attack.cost} ⚔️ (${getAttackPatternDescription(attack.pattern)}${special}${friendlyFire})${cooldown}`;
}

export function describeMonsterMovement(monster: Monster): string {
    const actionsPerTurn = getMovementActionsPerTurn(monster);
    const actionCount =
        actionsPerTurn === 1 ? "" : `, ${actionsPerTurn} déplacements par tour`;
    return `Déplacement : ${monster.movementRange} cases, coût : ${getMovementCost(monster)} ${DICE_SYMBOL_PRESENTATION.movement.emoji}${actionCount}`;
}
