import { getStartingPositions, isBoardCell, type BoardDefinition } from "../../game/boards";
import {
    canAttackEnemyBase,
    canTargetMonster,
    findLivingMonsterAt,
    getEnemyStart,
    isAttackZoneUsable,
    type AttackContext,
} from "../../game/attackRules";
import {
    createTacticalAttackValue,
    DEFAULT_BOT_STRATEGY_WEIGHTS,
    scoreTacticalAttack,
    type TacticalAttackValue,
} from "../../game/botStrategy";
import { hasLineOfSight, isBehind, isSamePosition } from "../../game/geometry";
import { opposingPlayer } from "../../game/matchRules";
import {
    canUseActionThisTurn,
    canUseMonsterAttackThisTurn,
    getAttackActionsPerTurn,
    getAttackZoneOptions,
    getBuffedAttackCost,
    getBuffedAttackDamage,
    isAreaAttack,
} from "../../game/monsterActions";
import type { MonsterAttack, PlacedMonster, Position } from "../../types/GameTypes";
import { canSpend, getPlayerMonsters, type MatchState } from "../matchState";

export interface AttackChoice {
    attacker: PlacedMonster;
    attackIndex: number;
    target: Position;
    cells: Position[];
    score: number;
    features: TacticalAttackValue;
}

export function createAttackContext(state: MatchState, board: BoardDefinition): AttackContext {
    return {
        board,
        startingPositions: getStartingPositions(board),
        monsters: state.monsters,
        currentPlayer: state.currentPlayer,
        turn: state.turn,
        allowBaseAttackOnSummonTurn: state.allowBaseAttackOnSummonTurn,
    };
}

function evaluateAllyAttack(
    context: AttackContext,
    attack: MonsterAttack,
    target: Position,
    value: TacticalAttackValue,
): TacticalAttackValue {
    const ally = context.monsters.find(
        (monster) =>
            monster.currentHp > 0 &&
            monster.owner === context.currentPlayer &&
            isSamePosition(monster.position, target),
    );
    if (!ally) return value;
    value.healing = Math.min(attack.healAmount ?? 0, ally.monster.hp - ally.currentHp);
    value.clearedEffects = attack.clearsStatusEffects ? ally.statusEffects.length : 0;
    value.cooldownsReduced = attack.cooldownReduction
        ? ally.attackCooldowns.filter((cooldown) => cooldown > 0).length
        : 0;
    value.buffs =
        (attack.movementRangeBonus ?? 0) +
        (attack.movementCostReduction ?? 0) +
        (attack.attackDamageBonus ?? 0) * 2 +
        (attack.attackCostReduction ?? 0);
    return value;
}

function evaluateAttack(
    context: AttackContext,
    attacker: PlacedMonster,
    attack: MonsterAttack,
    target: Position,
    cells: readonly Position[],
): TacticalAttackValue {
    const value = createTacticalAttackValue();
    if (attack.targetsAlliesOnly) return evaluateAllyAttack(context, attack, target, value);

    const enemyStart = getEnemyStart(context);
    const canHitBase = canAttackEnemyBase(context, attacker);
    const isArea = isAreaAttack(attack);
    const baseDamage = getBuffedAttackDamage(attacker, attack);
    const backstabBonus = attacker.monster.bonusDamageFromBehind ?? 0;
    for (const cell of isArea ? cells : [target]) {
        if (!isBoardCell(context.board, cell)) continue;
        if (canHitBase && isSamePosition(cell, enemyStart)) {
            value.baseDamage = 1;
            continue;
        }
        const victim = findLivingMonsterAt(context.monsters, cell);
        if (!victim || !canTargetMonster(context, attacker, attack, victim)) continue;

        const isBackstab =
            !isArea &&
            isSamePosition(cell, target) &&
            victim.owner !== context.currentPlayer &&
            backstabBonus > 0 &&
            isBehind(victim.position, attacker.position, victim.facing);
        const damage = baseDamage + (isBackstab ? backstabBonus : 0);
        const effectiveDamage = Math.min(victim.currentHp, damage);
        if (victim.owner === context.currentPlayer) {
            if (attack.hitsAllies) value.friendlyDamage += effectiveDamage;
            continue;
        }
        value.damage += effectiveDamage;
        if (damage >= victim.currentHp) value.kills++;
        const effect = attack.statusEffect;
        if (effect && !victim.statusEffects.some((existing) => existing.type === effect.type)) {
            value.statusDamage +=
                effect.damagePerTurn *
                Math.min(2, typeof effect.duration === "number" ? effect.duration : 2);
        }
    }
    return value;
}

function getLegalAttackOptions(
    context: AttackContext,
    attacker: PlacedMonster,
    attack: MonsterAttack,
) {
    const enemyStart = getEnemyStart(context);
    const canHitBase = canAttackEnemyBase(context, attacker);
    const needsLineOfSight = !isAreaAttack(attack);
    const blockers = needsLineOfSight
        ? context.monsters
              .filter((monster) => monster.currentHp > 0 && monster.id !== attacker.id)
              .map((monster) => monster.position)
        : [];

    return getAttackZoneOptions(
        attacker.position,
        attacker.facing,
        attack.pattern,
        attack.targetsSelf,
    ).filter(({ target, cells }) => {
        if (!isBoardCell(context.board, target)) return false;
        if (isSamePosition(target, enemyStart) && !canHitBase) return false;
        if (needsLineOfSight && !hasLineOfSight(attacker.position, target, blockers)) return false;
        return isAttackZoneUsable(context, attacker, attack, cells);
    });
}

function getReadyAttacks(attacker: PlacedMonster) {
    if (
        !canUseActionThisTurn(
            attacker.attacksUsedThisTurn,
            getAttackActionsPerTurn(attacker.monster),
        )
    ) {
        return [];
    }
    return attacker.monster.attacks.flatMap((attack, attackIndex) =>
        (attacker.attackCooldowns[attackIndex] ?? 0) <= 0 &&
        canUseMonsterAttackThisTurn(attack, attacker.attackUsesThisTurn[attackIndex] ?? 0)
            ? [{ attack, attackIndex }]
            : [],
    );
}

function getAttackChoices(
    state: MatchState,
    context: AttackContext,
    attacker: PlacedMonster,
    attack: MonsterAttack,
    attackIndex: number,
    includeNonPositive: boolean,
): AttackChoice[] {
    const player = state.currentPlayer;
    const weights = state.strategyWeights?.[player] ?? DEFAULT_BOT_STRATEGY_WEIGHTS;
    const cost = getBuffedAttackCost(attacker, attack);
    const score = (features: TacticalAttackValue, scoreWeights: typeof weights) =>
        scoreTacticalAttack(
            features,
            cost,
            state.tactics[player],
            state.health[opposingPlayer(player)],
            state.profiles[player],
            scoreWeights,
        );

    const choices: AttackChoice[] = [];
    for (const option of getLegalAttackOptions(context, attacker, attack)) {
        const features = evaluateAttack(context, attacker, attack, option.target, option.cells);
        const choiceScore = score(features, weights);
        const defaultScore =
            weights === DEFAULT_BOT_STRATEGY_WEIGHTS
                ? choiceScore
                : score(features, DEFAULT_BOT_STRATEGY_WEIGHTS);
        if (includeNonPositive || defaultScore > 0) {
            choices.push({ attacker, attackIndex, ...option, features, score: choiceScore });
        }
    }
    return choices;
}

function compareText(first: string, second: string): number {
    if (first < second) return -1;
    return first > second ? 1 : 0;
}

export function getAvailableAttackChoices(
    state: MatchState,
    board: BoardDefinition,
    attackerId?: string,
    recordStatistics = true,
    includeNonPositive = false,
): AttackChoice[] {
    const context = createAttackContext(state, board);
    const player = state.currentPlayer;
    const choices: AttackChoice[] = [];
    for (const attacker of getPlayerMonsters(state, player)) {
        if (attackerId !== undefined && attacker.id !== attackerId) continue;
        for (const { attack, attackIndex } of getReadyAttacks(attacker)) {
            if (canSpend(state, player, "attack", getBuffedAttackCost(attacker, attack))) {
                choices.push(
                    ...getAttackChoices(
                        state,
                        context,
                        attacker,
                        attack,
                        attackIndex,
                        includeNonPositive,
                    ),
                );
            }
        }
    }
    if (recordStatistics) {
        state.statistics[player].positionsExplored += choices.length;
        state.statistics[player].branchesExplored += choices.length;
    }
    return choices.sort(
        (first, second) =>
            second.score - first.score ||
            compareText(first.attacker.id, second.attacker.id) ||
            first.attackIndex - second.attackIndex ||
            first.target.y - second.target.y ||
            first.target.x - second.target.x,
    );
}

export function getBestAvailableAttackScore(
    state: MatchState,
    board: BoardDefinition,
    attackerId: string,
): number {
    return getAvailableAttackChoices(state, board, attackerId, false)[0]?.score ?? 0;
}

export function getLegalAttackCosts(state: MatchState, board: BoardDefinition): number[] {
    const context = createAttackContext(state, board);
    const costs: number[] = [];
    for (const attacker of getPlayerMonsters(state, state.currentPlayer)) {
        for (const { attack } of getReadyAttacks(attacker)) {
            if (getLegalAttackOptions(context, attacker, attack).length > 0) {
                costs.push(getBuffedAttackCost(attacker, attack));
            }
        }
    }
    return costs;
}
