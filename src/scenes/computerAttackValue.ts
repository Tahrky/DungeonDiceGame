import {
    canAttackMonster,
    canTargetMonsterOwner,
    getAttackDamage,
    isAreaAttack,
    isBehind,
} from "../game/monsterActions";
import { isSamePosition } from "../game/geometry";
import { createTacticalAttackValue, type TacticalAttackValue } from "../game/botStrategy";
import type { RoleAssignment } from "../game/ai";
import type { MonsterAttack, PlacedMonster, Position } from "../types/GameTypes";

const COMPUTER_PLAYER = 2;
const STATUS_DAMAGE_TURNS_CAP = 2;

interface AttackValueContext {
    enemyStart: Position;
    getLivingMonsterAt: (position: Position) => PlacedMonster | undefined;
}

function getStatusDamage(attack: MonsterAttack, victim: PlacedMonster): number {
    const { statusEffect } = attack;
    if (!statusEffect || victim.statusEffects.some(({ type }) => type === statusEffect.type)) {
        return 0;
    }
    const duration = typeof statusEffect.duration === "number" ? statusEffect.duration : 2;
    return statusEffect.damagePerTurn * Math.min(STATUS_DAMAGE_TURNS_CAP, duration);
}

function getAllyAttackValue(attack: MonsterAttack, ally: PlacedMonster): TacticalAttackValue {
    return createTacticalAttackValue({
        healing: Math.min(attack.healAmount ?? 0, ally.monster.hp - ally.currentHp),
        clearedEffects: attack.clearsStatusEffects ? ally.statusEffects.length : 0,
        cooldownsReduced: attack.cooldownReduction
            ? ally.attackCooldowns.filter((cooldown) => cooldown > 0).length
            : 0,
        buffs:
            (attack.movementRangeBonus ?? 0) +
            (attack.movementCostReduction ?? 0) +
            (attack.attackDamageBonus ?? 0) * 2 +
            (attack.attackCostReduction ?? 0),
    });
}

function getBackstabBonus(
    attacker: PlacedMonster,
    attack: MonsterAttack,
    victim: PlacedMonster,
): number {
    const bonus = attacker.monster.bonusDamageFromBehind ?? 0;
    const isBackstab =
        !isAreaAttack(attack) &&
        victim.owner !== COMPUTER_PLAYER &&
        isBehind(victim.position, attacker.position, victim.facing);
    return bonus > 0 && isBackstab ? bonus : 0;
}

function canHitVictim(
    attacker: PlacedMonster,
    attack: MonsterAttack,
    victim: PlacedMonster | undefined,
): victim is PlacedMonster {
    return (
        victim !== undefined &&
        victim.id !== attacker.id &&
        (victim.owner !== COMPUTER_PLAYER || attack.hitsAllies === true) &&
        canTargetMonsterOwner(attack, victim.owner, COMPUTER_PLAYER) &&
        canAttackMonster(attacker.monster, attack, victim.monster)
    );
}

function getHostileAttackValue(
    attacker: PlacedMonster,
    attack: MonsterAttack,
    target: Position,
    cells: readonly Position[],
    { enemyStart, getLivingMonsterAt }: AttackValueContext,
): TacticalAttackValue {
    const value = createTacticalAttackValue();
    const affectedCells = isAreaAttack(attack) ? cells : [target];
    for (const cell of affectedCells) {
        if (isSamePosition(cell, enemyStart)) {
            value.baseDamage = 1;
            continue;
        }
        const victim = getLivingMonsterAt(cell);
        if (!canHitVictim(attacker, attack, victim)) continue;

        const damage =
            getAttackDamage(attack, attacker.turnBuffs?.attackDamageBonus ?? 0) +
            getBackstabBonus(attacker, attack, victim);
        const effectiveDamage = Math.min(victim.currentHp, damage);
        if (victim.owner === COMPUTER_PLAYER) {
            value.friendlyDamage += effectiveDamage;
            continue;
        }
        value.damage += effectiveDamage;
        if (damage >= victim.currentHp) value.kills++;
        value.statusDamage += getStatusDamage(attack, victim);
    }
    return value;
}

export function getComputerAttackValue(
    attacker: PlacedMonster,
    attack: MonsterAttack,
    target: Position,
    cells: readonly Position[],
    context: AttackValueContext,
): TacticalAttackValue | null {
    if (!attack.targetsAlliesOnly) {
        return getHostileAttackValue(attacker, attack, target, cells, context);
    }
    const ally = context.getLivingMonsterAt(target);
    return ally?.owner === COMPUTER_PLAYER ? getAllyAttackValue(attack, ally) : null;
}

export function getRoleBonus(value: TacticalAttackValue, role?: RoleAssignment): number {
    switch (role?.role) {
        case "advance":
            return value.baseDamage * 8;
        case "intercept":
            return value.kills * 6;
        case "support":
            return (value.healing + value.buffs) * 6;
        default:
            return value.damage;
    }
}
