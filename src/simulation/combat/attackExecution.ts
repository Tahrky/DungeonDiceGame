import {
    resolveAttack,
    validateAttackResolution,
    type AttackResolution,
    type ResolvedHit,
} from "../../game/combatResolution";
import type { BoardDefinition } from "../../game/boards";
import { getMonsterEliminationWinner, opposingPlayer } from "../../game/matchRules";
import { getBuffedAttackCost } from "../../game/monsterActions";
import type { SupportEffectResult } from "../../game/statusEffects";
import type { MonsterAttack, PlacedMonster, PlayerId } from "../../types/GameTypes";
import { spend, type MatchState } from "../matchState";
import { createAttackContext, type AttackChoice } from "./attackChoices";
import { createOutcome, recordAttackEvents, type AttackOutcome } from "./attackOutcome";

function damageBase(state: MatchState, player: PlayerId): void {
    const opponent = opposingPlayer(player);
    state.health[opponent]--;
    if (state.health[opponent] <= 0) {
        state.health[opponent] = 0;
        state.winner = player;
        state.finishReason = "baseDestroyed";
    }
}

function hitBase(state: MatchState, outcome: AttackOutcome): void {
    const player = state.currentPlayer;
    state.statistics[player].baseDamage++;
    outcome.target = `base J${opposingPlayer(player)}`;
    outcome.damage++;
    outcome.damageToBase = 1;
}

function recordHit(state: MatchState, hit: ResolvedHit, outcome: AttackOutcome): void {
    const player = state.currentPlayer;
    const { target: victim, damage, effectiveDamage } = hit;
    if (hit.camouflageSuppressed) outcome.camouflageSuppressed = true;
    if (hit.camouflageTriggered) outcome.camouflageTriggered = true;
    outcome.criticalDamageBonus = hit.criticalDamageBonus;
    outcome.damage += damage;
    if (victim.owner === player) {
        outcome.damageToAllies += effectiveDamage;
    } else {
        outcome.damageToEnemies += effectiveDamage;
    }
    outcome.overkillDamage += hit.overkillDamage;
    outcome.targetsHit++;
    state.statistics[player].damageDealt += damage;
    state.statistics[victim.owner].damageReceived += damage;
    outcome.target = `${victim.monster.name} (J${victim.owner})`;
    if (victim.currentHp <= 0 && victim.owner !== player) {
        state.statistics[player].monstersKilled++;
        state.statistics[victim.owner].monstersLost++;
        outcome.target += " éliminé";
    }
}

function applySupportAttack(
    ally: PlacedMonster,
    effect: SupportEffectResult,
    outcome: AttackOutcome,
): void {
    outcome.target = `${ally.monster.name} (J${ally.owner})`;
    if (effect.type === "heal") {
        outcome.healingDone = effect.healed;
        outcome.healingWaste = effect.amount - effect.healed;
        outcome.effectsCleared = effect.clearedEffects;
        outcome.supportEffect = `soigne ${effect.healed} PV${effect.clearedEffects ? " et dissipe les effets" : ""}`;
    } else if (effect.type === "cooldown") {
        outcome.effectsCleared = effect.clearedEffects;
        outcome.cooldownReductionUsed = effect.reduction;
        outcome.supportEffect = "réduit les recharges";
    } else {
        outcome.buffsApplied = 1;
        outcome.supportEffect = "applique un bonus temporaire";
    }
}

export function recordResolvedAttack(
    state: MatchState,
    choice: AttackChoice,
    attack: MonsterAttack,
    cost: number,
    resolution: AttackResolution,
): void {
    const player = state.currentPlayer;
    state.statistics[player].attacks++;

    const outcome = createOutcome();
    if (resolution.support) {
        applySupportAttack(resolution.support.target, resolution.support.effect, outcome);
    }
    for (const hit of resolution.hits) recordHit(state, hit, outcome);
    if (resolution.baseHit) hitBase(state, outcome);

    recordAttackEvents(state, choice, attack, cost, outcome);
}

export function executeAttack(
    state: MatchState,
    board: BoardDefinition,
    choice: AttackChoice,
): void {
    const { attacker, attackIndex, target } = choice;
    const context = createAttackContext(state, board);
    const attack = validateAttackResolution(context, attacker, attackIndex, target);
    const player = state.currentPlayer;
    const cost = getBuffedAttackCost(attacker, attack);
    if (!spend(state, player, "attack", cost)) return;
    const resolution = resolveAttack(context, attacker, attackIndex, target, choice.cells);
    if (resolution.baseHit) damageBase(state, player);
    recordResolvedAttack(state, choice, attack, cost, resolution);
    state.winner ??= getMonsterEliminationWinner(state.monsters, state.monstersKilledForVictory);
    if (state.winner !== null && state.finishReason !== "baseDestroyed") {
        state.finishReason = "monstersEliminated";
    }
}
