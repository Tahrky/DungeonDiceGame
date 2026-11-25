import type { MonsterAttack, PlacedMonster, StatusEffectColor } from "../types/GameTypes";
import {
    applyMonsterTurnBuff,
    hasTurnBuff,
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
    if (!effect) return;
    target.statusEffects = [
        ...target.statusEffects.filter((existing) => existing.type !== effect.type),
        {
            ...effect,
            remainingTurns: effect.duration,
            source: {
                id: source.id,
                monsterId: source.monster.id,
                name: source.monster.name,
                owner: source.owner,
            },
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
        if (effect.type === "damageOverTime") damage += effect.damagePerTurn;

        if (effect.remainingTurns === "untilDeath") {
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
