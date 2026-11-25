import {
    canAttackEnemyBase,
    findLivingMonsterAt,
    getEnemyStart,
    getJumpLanding,
    type AttackContext,
} from "../../game/attackRules";
import type { BoardDefinition } from "../../game/boards";
import { getFacingFromMovement, isBehind, isSamePosition } from "../../game/geometry";
import { getMonsterEliminationWinner, opposingPlayer } from "../../game/matchRules";
import {
    applyMonsterTurnBuff,
    canAttackMonster,
    getBuffedAttackCost,
    getBuffedAttackDamage,
    isAreaAttack,
    reduceAttackCooldowns,
    registerAttackUse,
} from "../../game/monsterActions";
import { clearStatusEffects, healMonster } from "../../game/statusEffects";
import type {
    MonsterAttack,
    PlacedMonster,
    PlayerId,
    StatusEffectDefinition,
} from "../../types/GameTypes";
import { spend, type MatchState } from "../matchState";
import { createAttackContext, type AttackChoice } from "./attackChoices";
import { createOutcome, recordAttackEvents, type AttackOutcome } from "./attackOutcome";

function applyStatusEffect(
    target: PlacedMonster,
    effect: StatusEffectDefinition | undefined,
    source: PlacedMonster,
): void {
    if (target.currentHp <= 0) {
        clearStatusEffects(target);
    } else if (effect) {
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
}

function damageBase(state: MatchState, player: PlayerId): void {
    const opponent = opposingPlayer(player);
    state.health[opponent]--;
    state.statistics[player].baseDamage++;
    if (state.health[opponent] <= 0) {
        state.health[opponent] = 0;
        state.winner = player;
        state.finishReason = "baseDestroyed";
    }
}

function hitBase(state: MatchState, outcome: AttackOutcome): void {
    const player = state.currentPlayer;
    damageBase(state, player);
    outcome.target = `base J${opposingPlayer(player)}`;
    outcome.damage++;
    outcome.damageToBase = 1;
}

function hitMonster(
    state: MatchState,
    attacker: PlacedMonster,
    attack: MonsterAttack,
    victim: PlacedMonster,
    damage: number,
    outcome: AttackOutcome,
): void {
    const player = state.currentPlayer;
    const damageBeforeHit = victim.currentHp;
    const effectiveDamage = Math.min(damage, damageBeforeHit);
    if (victim.isCamouflaged) {
        victim.isCamouflaged = false;
        outcome.camouflageSuppressed = true;
    }
    victim.currentHp -= damage;
    outcome.damage += damage;
    if (victim.owner === player) {
        outcome.damageToAllies += effectiveDamage;
    } else {
        outcome.damageToEnemies += effectiveDamage;
    }
    outcome.overkillDamage += damage - effectiveDamage;
    outcome.targetsHit++;
    state.statistics[player].damageDealt += damage;
    state.statistics[victim.owner].damageReceived += damage;
    applyStatusEffect(victim, attack.statusEffect, attacker);
    outcome.target = `${victim.monster.name} (J${victim.owner})`;
    if (victim.currentHp <= 0 && victim.owner !== player) {
        state.statistics[player].monstersKilled++;
        state.statistics[victim.owner].monstersLost++;
        outcome.target += " éliminé";
        if (attacker.monster.id === "thief") {
            attacker.isCamouflaged = true;
            outcome.camouflageTriggered = true;
        }
    }
}

function applySupportAttack(
    attack: MonsterAttack,
    ally: PlacedMonster,
    outcome: AttackOutcome,
): void {
    outcome.target = `${ally.monster.name} (J${ally.owner})`;
    if (attack.healAmount !== undefined) {
        const { healed, clearedEffects } = healMonster(
            ally,
            attack.healAmount,
            attack.clearsStatusEffects,
        );
        outcome.healingDone = healed;
        outcome.healingWaste = attack.healAmount - healed;
        outcome.effectsCleared = clearedEffects;
        outcome.supportEffect = `soigne ${healed} PV${clearedEffects ? " et dissipe les effets" : ""}`;
    } else if (attack.cooldownReduction !== undefined) {
        const reduction = attack.cooldownReduction;
        outcome.effectsCleared = ally.statusEffects.length;
        if (attack.clearsStatusEffects) clearStatusEffects(ally);
        reduceAttackCooldowns(ally, reduction);
        outcome.cooldownReductionUsed = reduction;
        outcome.supportEffect = "réduit les recharges";
    } else {
        applyMonsterTurnBuff(ally, attack);
        outcome.buffsApplied = 1;
        outcome.supportEffect = "applique un bonus temporaire";
    }
}

function applyAreaAttack(
    state: MatchState,
    context: AttackContext,
    choice: AttackChoice,
    attack: MonsterAttack,
    damage: number,
    outcome: AttackOutcome,
): void {
    const { attacker, cells } = choice;
    const player = state.currentPlayer;
    if (attack.movesToZone) {
        const landing = getJumpLanding(context, attacker, cells);
        if (landing) {
            attacker.facing = getFacingFromMovement(attacker.position, landing, attacker.facing);
            attacker.position = { ...landing };
        }
    }
    for (const victim of state.monsters) {
        if (
            victim.currentHp > 0 &&
            victim.id !== attacker.id &&
            cells.some((cell) => isSamePosition(cell, victim.position)) &&
            (attack.hitsAllies || victim.owner !== player) &&
            canAttackMonster(attacker.monster, attack, victim.monster)
        ) {
            hitMonster(state, attacker, attack, victim, damage, outcome);
        }
    }
    const enemyStart = getEnemyStart(context);
    if (
        canAttackEnemyBase(context, attacker) &&
        cells.some((cell) => isSamePosition(cell, enemyStart))
    ) {
        hitBase(state, outcome);
    }
}

function applySingleTargetAttack(
    state: MatchState,
    attacker: PlacedMonster,
    attack: MonsterAttack,
    victim: PlacedMonster,
    damage: number,
    outcome: AttackOutcome,
): void {
    const backstabBonus = attacker.monster.bonusDamageFromBehind ?? 0;
    if (backstabBonus > 0 && isBehind(victim.position, attacker.position, victim.facing)) {
        outcome.criticalDamageBonus = backstabBonus;
    }
    hitMonster(state, attacker, attack, victim, damage + outcome.criticalDamageBonus, outcome);
}

export function executeAttack(
    state: MatchState,
    board: BoardDefinition,
    choice: AttackChoice,
): void {
    const { attacker, attackIndex, target } = choice;
    const attack = attacker.monster.attacks[attackIndex];
    if (!attack) return;
    const player = state.currentPlayer;
    const damage = getBuffedAttackDamage(attacker, attack);
    const cost = getBuffedAttackCost(attacker, attack);
    if (!spend(state, player, "attack", cost)) return;

    const context = createAttackContext(state, board);
    const targetMonster = findLivingMonsterAt(state.monsters, target);
    registerAttackUse(attacker, attackIndex, target);
    state.statistics[player].attacks++;

    const outcome = createOutcome();
    if (attack.targetsAlliesOnly && targetMonster?.owner === player) {
        applySupportAttack(attack, targetMonster, outcome);
    } else if (isAreaAttack(attack)) {
        applyAreaAttack(state, context, choice, attack, damage, outcome);
    } else if (targetMonster && targetMonster.owner !== player) {
        applySingleTargetAttack(state, attacker, attack, targetMonster, damage, outcome);
    } else if (
        isSamePosition(target, getEnemyStart(context)) &&
        canAttackEnemyBase(context, attacker)
    ) {
        hitBase(state, outcome);
    }

    recordAttackEvents(state, choice, attack, cost, outcome);
    state.winner ??= getMonsterEliminationWinner(state.monsters, state.monstersKilledForVictory);
    if (state.winner !== null && state.finishReason !== "baseDestroyed") {
        state.finishReason = "monstersEliminated";
    }
}
