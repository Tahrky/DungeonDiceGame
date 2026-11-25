import type { MonsterAttack, PlacedMonster, PlayerId, Position } from "../types/GameTypes";
import { isBoardCell, type BoardDefinition } from "./boards";
import { getGridDistance, isSamePosition } from "./geometry";
import { opposingPlayer } from "./matchRules";
import {
    canAttackBaseThisTurn,
    canAttackMonster,
    canDirectlyTargetMonster,
    canTargetMonsterOwner,
} from "./monsterActions";

export interface AttackContext {
    readonly board: BoardDefinition;
    readonly startingPositions: Readonly<Record<PlayerId, Position>>;
    readonly monsters: readonly PlacedMonster[];
    readonly currentPlayer: PlayerId;
    readonly turn: number;
    readonly allowBaseAttackOnSummonTurn: boolean;
}

export function findLivingMonsterAt(
    monsters: readonly PlacedMonster[],
    cell: Position,
): PlacedMonster | undefined {
    return monsters.find(
        (monster) => monster.currentHp > 0 && isSamePosition(monster.position, cell),
    );
}

export function getEnemyStart(context: AttackContext): Position {
    return context.startingPositions[opposingPlayer(context.currentPlayer)];
}

export function canAttackEnemyBase(context: AttackContext, attacker: PlacedMonster): boolean {
    return canAttackBaseThisTurn(
        attacker.summonedOnTurn,
        context.turn,
        context.allowBaseAttackOnSummonTurn,
    );
}

export function isAttackCellInRange(
    attackerPosition: Position,
    attack: MonsterAttack,
    cell: Position,
): boolean {
    return (
        attack.pattern.type !== "jumpArea" ||
        getGridDistance(attackerPosition, cell) <= attack.pattern.range
    );
}

export function canTargetMonster(
    context: AttackContext,
    attacker: PlacedMonster,
    attack: MonsterAttack,
    victim: PlacedMonster,
): boolean {
    return (
        (victim.id !== attacker.id || attack.targetsSelf === true) &&
        canDirectlyTargetMonster(attack, victim) &&
        canTargetMonsterOwner(attack, victim.owner, context.currentPlayer) &&
        canAttackMonster(attacker.monster, attack, victim.monster)
    );
}

// Nearest deployed (road) cell of the zone where a jumping attacker can land.
export function getJumpLanding(
    context: AttackContext,
    attacker: PlacedMonster,
    zone: readonly Position[],
): Position | undefined {
    const starts = Object.values(context.startingPositions);
    let landing: Position | undefined;
    for (const cell of zone) {
        if (
            !context.monsters.some((monster) =>
                monster.cells.some((deployed) => isSamePosition(deployed, cell)),
            ) ||
            context.monsters.some(
                (monster) =>
                    monster.currentHp > 0 &&
                    monster.id !== attacker.id &&
                    isSamePosition(monster.position, cell),
            ) ||
            starts.some((start) => isSamePosition(start, cell))
        ) {
            continue;
        }
        if (
            !landing ||
            getGridDistance(attacker.position, cell) < getGridDistance(attacker.position, landing)
        ) {
            landing = cell;
        }
    }
    return landing;
}

function isAttackCellUsable(
    context: AttackContext,
    attacker: PlacedMonster,
    attack: MonsterAttack,
    cell: Position,
): boolean {
    if (!isBoardCell(context.board, cell)) return false;
    if (!isAttackCellInRange(attacker.position, attack, cell)) return false;
    if (isSamePosition(cell, getEnemyStart(context))) {
        return !attack.targetsAlliesOnly && canAttackEnemyBase(context, attacker);
    }

    const target = findLivingMonsterAt(context.monsters, cell);
    if (!target || !canTargetMonster(context, attacker, attack, target)) return false;
    if (
        attack.healAmount !== undefined &&
        target.currentHp >= target.monster.hp &&
        (!attack.clearsStatusEffects || target.statusEffects.length === 0)
    ) {
        return false;
    }
    return (
        attack.cooldownReduction === undefined ||
        target.attackCooldowns.some((cooldown) => cooldown > 0)
    );
}

export function isAttackZoneUsable(
    context: AttackContext,
    attacker: PlacedMonster,
    attack: MonsterAttack,
    zone: readonly Position[],
): boolean {
    if (attack.movesToZone && !getJumpLanding(context, attacker, zone)) return false;
    return zone.some((cell) => isAttackCellUsable(context, attacker, attack, cell));
}
