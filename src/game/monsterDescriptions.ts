import { DICE_SYMBOL_PRESENTATION } from "../data/dice";
import {
    getAttackActionsPerTurn,
    getMovementActionsPerTurn,
    getMovementCost,
    getMonsterArmor,
} from "./monsterActions";

import type {
    AttackPattern,
    Monster,
    MonsterAttack,
    MonsterStatusEffect,
} from "../types/GameTypes";

export function describeMonsterStatusEffect(effect: MonsterStatusEffect): string {
    if (effect.type === "damageOverTime") return `-${effect.damagePerTurn} PV / Tour`;
    if (effect.type === "sleep") {
        return typeof effect.remainingTurns === "number"
            ? `Endormi (${effect.remainingTurns} tour${effect.remainingTurns === 1 ? "" : "s"})`
            : "Endormi";
    }
    if (effect.type === "movementSlow") return "Déplacement ralenti";
    return "";
}

export function formatCost(cost: number, symbol: string): string {
    return `${cost} ${symbol}`;
}

export function formatHitPoints(hitPoints: number): string {
    return `${hitPoints} PV`;
}

export { getMonsterArmor } from "./monsterActions";

export function formatMonsterArmor(monster: Monster): string {
    return `Armure : ${getMonsterArmor(monster)}`;
}

export function describeMonsterTraits(monster: Monster): string[] {
    const traits: string[] = [];
    if (monster.canPassHostiles) traits.push("Fantomatique");
    if (monster.flying) traits.push("Volant");
    if (monster.highAltitude) traits.push("Haute altitude");
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

function describeTurnBuff(attack: MonsterAttack): string | undefined {
    const effects: string[] = [];
    const actions: string[] = [];
    if (attack.movementRangeBonus !== undefined) {
        effects.push(
            `déplacement +${attack.movementRangeBonus} case${attack.movementRangeBonus === 1 ? "" : "s"}`,
        );
        actions.push("le prochain déplacement");
    }
    if (attack.movementCostReduction !== undefined) {
        effects.push(`-${attack.movementCostReduction}${DICE_SYMBOL_PRESENTATION.movement.emoji}`);
        if (!actions.includes("le prochain déplacement")) actions.push("le prochain déplacement");
    }
    if (attack.attackDamageBonus !== undefined) {
        effects.push(`dégâts +${attack.attackDamageBonus}`);
        actions.push("la prochaine attaque");
    }
    if (attack.attackCostReduction !== undefined) {
        effects.push(`-${attack.attackCostReduction}${DICE_SYMBOL_PRESENTATION.attack.emoji}`);
        if (!actions.includes("la prochaine attaque")) actions.push("la prochaine attaque");
    }
    return effects.length > 0
        ? `${effects.join(" et ")} pour ${actions.join(" et ")} ce tour`
        : undefined;
}

function describeAttackEffect(attack: MonsterAttack): string {
    if (attack.healAmount !== undefined) return `soigne ${attack.healAmount} PV`;
    if (attack.cooldownReduction !== undefined) {
        return `réduit les recharges de ${attack.cooldownReduction} tour${attack.cooldownReduction === 1 ? "" : "s"}`;
    }
    if (
        (attack.movementRangeBonus ?? 0) < 0 ||
        (attack.movementCostReduction ?? 0) < 0
    ) {
        return `${attack.damage} dégâts, ralentit la cible jusqu'à son prochain déplacement`;
    }
    if (attack.statusEffect?.type === "sleep") {
        const { duration } = attack.statusEffect;
        return `${attack.damage} dégâts et endort la cible pendant ${duration} tour${duration === 1 ? "" : "s"}`;
    }

    const turnBuff = describeTurnBuff(attack);
    if (turnBuff) return turnBuff;
    const effect = attack.statusEffect;
    if (effect?.type === "damageOverTime") {
        const duration =
            effect.duration === "untilDeath"
                ? "jusqu'à sa mort"
                : `${effect.duration} tour${effect.duration === 1 ? "" : "s"}`;
        return `${attack.damage} dégât initial, puis ${effect.damagePerTurn} dégâts au début du tour de la cible (${duration})`;
    }
    return `${attack.damage} dégâts`;
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
    const statusCleanup = attack.clearsStatusEffects ? ", dissipe les effets de statut" : "";
    const targetRestriction = attack.targetsAlliesOnly
        ? `, cible uniquement les alliés${attack.targetsSelf ? " (peut se cibler)" : ""}`
        : "";
    const effect = describeAttackEffect(attack);
    return `${formatCost(attack.cost, DICE_SYMBOL_PRESENTATION.attack.emoji)} ${attack.name} : ${effect} (${getAttackPatternDescription(
        attack.pattern,
    )}${special}${friendlyFire}${statusCleanup}${targetRestriction}${usesPerTurn})${cooldown}`;
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
