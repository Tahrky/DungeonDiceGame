import type { PlacedMonster, StatusEffectColor } from "../types/GameTypes";

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
