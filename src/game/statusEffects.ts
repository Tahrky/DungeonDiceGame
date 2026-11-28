import type { MonsterAttack, PlacedMonster, StatusEffectColor } from "../types/GameTypes";
import {
    applyMonsterTurnBuff,
    hasTurnBuff,
    getMovementCost,
    getMovementRange,
    reduceAttackCooldowns,
    resetAttackTurnState,
} from "./monsterActions";

export const STATUS_EFFECT_COLORS: Record<StatusEffectColor, number> = {
    green: 0x00ff00,
    red: 0xff0000,
    blue: 0x0000ff,
    yellow: 0xffff00,
    white: 0xffffff,
    violet: 0x8a2be2,
    gray: 0x808080,
};

export function isStatusEffectColor(value: unknown): value is StatusEffectColor {
    return (
        typeof value === "string" &&
        Object.prototype.hasOwnProperty.call(STATUS_EFFECT_COLORS, value)
    );
}

export function clearStatusEffects(monster: PlacedMonster): number {
    const clearedCount = monster.statusEffects.length;
    monster.statusEffects = [];
    return clearedCount;
}

export function applyAttackStatusEffect(
    target: PlacedMonster,
    attack: MonsterAttack,
    source: PlacedMonster,
): void {
    if (target.currentHp <= 0) {
        clearStatusEffects(target);
        return;
    }
    if (attack.clearsStatusEffects) clearStatusEffects(target);
    const effect = attack.statusEffect;
    const sourceInfo = {
        id: source.id,
        monsterId: source.monster.id,
        name: source.monster.name,
        owner: source.owner,
    };
    if (effect) {
        target.statusEffects = [
            ...target.statusEffects.filter((existing) => existing.type !== effect.type),
            {
                ...effect,
                remainingTurns: effect.type === "movementSlow" ? "untilMove" : effect.duration,
                source: sourceInfo,
            },
        ];
    }

    const rangeSlow = Math.min(0, attack.movementRangeBonus ?? 0);
    const costSlow = Math.min(0, attack.movementCostReduction ?? 0);
    if (rangeSlow === 0 && costSlow === 0) return;
    const movementRangeBonus =
        target.monster.movementRange === 1
            ? 0
            : rangeSlow !== 0
              ? rangeSlow
              : costSlow;
    const movementCostReduction =
        target.monster.movementRange === 1
            ? costSlow !== 0
                ? costSlow
                : rangeSlow
            : 0;
    target.statusEffects = [
        ...target.statusEffects.filter((existing) => existing.type !== "movementSlow"),
        {
            type: "movementSlow",
            movementRangeBonus,
            movementCostReduction,
            color: "violet",
            remainingTurns: "untilMove",
            source: sourceInfo,
        },
    ];
}

export function healMonster(
    monster: PlacedMonster,
    healAmount: number,
    clearsStatusEffects = false,
): { healed: number; clearedEffects: number } {
    const healed = Math.min(healAmount, Math.max(0, monster.monster.hp - monster.currentHp));
    monster.currentHp += healed;
    const clearedEffects = clearsStatusEffects ? clearStatusEffects(monster) : 0;
    return { healed, clearedEffects };
}

export type SupportEffectResult =
    | { type: "heal"; amount: number; healed: number; clearedEffects: number }
    | { type: "cooldown"; reduction: number; reducedCooldowns: number; clearedEffects: number }
    | { type: "buff" };

export function applySupportEffect(
    attack: MonsterAttack,
    target: PlacedMonster,
): SupportEffectResult | null {
    if (attack.healAmount !== undefined) {
        return {
            type: "heal",
            amount: attack.healAmount,
            ...healMonster(target, attack.healAmount, attack.clearsStatusEffects),
        };
    }
    if (attack.cooldownReduction !== undefined) {
        const clearedEffects = attack.clearsStatusEffects ? clearStatusEffects(target) : 0;
        return {
            type: "cooldown",
            reduction: attack.cooldownReduction,
            reducedCooldowns: reduceAttackCooldowns(target, attack.cooldownReduction),
            clearedEffects,
        };
    }
    if (!hasTurnBuff(attack)) return null;
    applyMonsterTurnBuff(target, attack);
    return { type: "buff" };
}

export function applyStatusEffectsAtTurnStart(monster: PlacedMonster): number {
    if (monster.currentHp <= 0) {
        monster.statusEffects = [];
        return 0;
    }

    let damage = 0;
    const activeEffects = [];
    for (const effect of monster.statusEffects) {
        if (effect.type === "sleep") {
            activeEffects.push(effect);
            continue;
        }
        if (effect.type === "damageOverTime") damage += effect.damagePerTurn;

        if (effect.remainingTurns === "untilDeath") {
            activeEffects.push(effect);
        } else if (effect.remainingTurns === "untilMove" || effect.remainingTurns === "untilTurnEnd") {
            activeEffects.push(effect);
        } else if (effect.remainingTurns > 1) {
            activeEffects.push({ ...effect, remainingTurns: effect.remainingTurns - 1 });
        }
    }

    monster.statusEffects = activeEffects;
    monster.currentHp -= damage;
    if (monster.currentHp <= 0) monster.statusEffects = [];
    return damage;
}

export function beginMonsterTurn(monster: PlacedMonster): number {
    const damage = applyStatusEffectsAtTurnStart(monster);
    resetAttackTurnState(monster);
    monster.movementsUsedThisTurn = 0;
    return damage;
}

export function isMonsterAsleep(monster: Pick<PlacedMonster, "statusEffects">): boolean {
    return monster.statusEffects.some((effect) => effect.type === "sleep");
}

export function finishMonsterTurn(monster: PlacedMonster): void {
    const activeEffects = [];
    for (const effect of monster.statusEffects) {
        if (effect.type !== "sleep") {
            activeEffects.push(effect);
        } else if (typeof effect.remainingTurns === "number" && effect.remainingTurns > 1) {
            activeEffects.push({ ...effect, remainingTurns: effect.remainingTurns - 1 });
        }
    }
    monster.statusEffects = activeEffects;
}

function getMovementStatusBonuses(monster: Pick<PlacedMonster, "statusEffects">) {
    return monster.statusEffects.reduce(
        (bonuses, effect) => {
            if (effect.type !== "movementSlow") return bonuses;
            bonuses.movementRangeBonus += effect.movementRangeBonus;
            bonuses.movementCostReduction += effect.movementCostReduction;
            return bonuses;
        },
        { movementRangeBonus: 0, movementCostReduction: 0 },
    );
}

export function getMonsterMovementRange(
    monster: Pick<PlacedMonster, "monster" | "turnBuffs" | "statusEffects">,
): number {
    const statusBonuses = getMovementStatusBonuses(monster);
    return getMovementRange(
        monster.monster,
        (monster.turnBuffs?.movementRangeBonus ?? 0) + statusBonuses.movementRangeBonus,
    );
}

export function getMonsterMovementCost(
    monster: Pick<PlacedMonster, "monster" | "turnBuffs" | "statusEffects">,
): number {
    const statusBonuses = getMovementStatusBonuses(monster);
    return getMovementCost(
        monster.monster,
        (monster.turnBuffs?.movementCostReduction ?? 0) + statusBonuses.movementCostReduction,
    );
}
