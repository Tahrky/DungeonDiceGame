import { DICE_SYMBOL_PRESENTATION } from "../data/dice";
import {
    getAttackActionsPerTurn,
    getMovementActionsPerTurn,
    getMovementCost,
} from "./monsterActions";

import type {
    AttackPattern,
    Monster,
    MonsterAttack,
    MonsterStatusEffect,
} from "../types/GameTypes";

export function describeMonsterStatusEffect(effect: MonsterStatusEffect): string {
    if (effect.type === "damageOverTime") return `-${effect.damagePerTurn} PV / Tour`;
    return "";
}

export function formatCost(cost: number, symbol: string): string {
    return `${cost} ${symbol}`;
}

export function formatHitPoints(hitPoints: number): string {
    return `${hitPoints} PV`;
}

export function describeMonsterTraits(monster: Monster): string[] {
    const traits: string[] = [];
    if (monster.canPassHostiles) traits.push("Fantomatique");
    if (monster.flying) traits.push("Volant");
    const attacksPerTurn = getAttackActionsPerTurn(monster);
    if (attacksPerTurn > 1) traits.push(`${attacksPerTurn} attaques par tour`);
    return traits;
}

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
    const initialCooldown =
        attack.initialCooldownTurns !== undefined &&
        attack.initialCooldownTurns !== attack.cooldownTurns
            ? ` (${attack.initialCooldownTurns} tour${attack.initialCooldownTurns === 1 ? "" : "s"} à l'apparition)`
            : "";
    const cooldown =
        attack.cooldownTurns !== undefined
            ? `, recharge : ${attack.cooldownTurns} tour${attack.cooldownTurns === 1 ? "" : "s"} du joueur${initialCooldown}`
            : "";
    const usesPerTurn =
        attack.usesPerTurn !== undefined
            ? `, ${attack.usesPerTurn} utilisation${attack.usesPerTurn === 1 ? "" : "s"} par tour`
            : "";
    const friendlyFire = attack.hitsAllies ? ", touche aussi les alliés" : "";
    const targetRestriction = attack.targetsAlliesOnly ? ", cible uniquement les alliés" : "";
    const effect =
        attack.healAmount !== undefined
            ? `soigne ${attack.healAmount} PV`
            : attack.cooldownReduction !== undefined
              ? `réduit les recharges de ${attack.cooldownReduction} tour${attack.cooldownReduction === 1 ? "" : "s"}`
              : attack.statusEffect?.type === "damageOverTime"
                ? `${attack.damage} dégât initial, puis ${attack.statusEffect.damagePerTurn} dégâts au début du tour de la cible (${attack.statusEffect.duration === "untilDeath" ? "jusqu'à sa mort" : `${attack.statusEffect.duration} tour${attack.statusEffect.duration === 1 ? "" : "s"}`})`
                : `${attack.damage} dégâts`;
    return `${formatCost(attack.cost, DICE_SYMBOL_PRESENTATION.attack.emoji)} ${attack.name} : ${effect} (${getAttackPatternDescription(
        attack.pattern,
    )}${special}${friendlyFire}${targetRestriction}${usesPerTurn})${cooldown}`;
}

export function describeMonsterMovement(monster: Monster): string {
    const actionsPerTurn = getMovementActionsPerTurn(monster);
    const actionCount =
        actionsPerTurn === 1 ? "" : `, ${actionsPerTurn} déplacements par tour`;
    const cost = formatCost(
        getMovementCost(monster),
        DICE_SYMBOL_PRESENTATION.movement.emoji,
    );
    return `${cost} Déplacement : ${monster.movementRange} cases${actionCount}`;
}
