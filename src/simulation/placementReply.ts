import type { BoardDefinition } from "../game/boards";
import { getFacingFromMovement, isBehind, isSamePosition } from "../game/geometry";
import { getMonsterEliminationWinner, opposingPlayer } from "../game/matchRules";
import {
    canUseActionThisTurn,
    clearCamouflageForMovement,
    consumeMovementTurnBuff,
    getMovementActionsPerTurn,
    getMovementPathMap,
    isAreaAttack,
} from "../game/monsterActions";
import {
    beginMonsterTurn,
    getMonsterMovementCost,
    isMonsterAsleep,
} from "../game/statusEffects";
import { DEFEAT_REPLY_PENALTY, scoreReplyThreat } from "../game/replyThreat";
import type { PlayerId } from "../types/GameTypes";
import { getAvailableAttackChoices } from "./combat/attackChoices";
import { cloneMatchState, type MatchState } from "./matchState";
import { createMovementOptions } from "./movementOptions";

export function getPlacementReplyPenalty(
    state: MatchState,
    board: BoardDefinition,
    player: PlayerId,
): number {
    const reply = cloneMatchState(state);
    const opponent = opposingPlayer(player);
    reply.currentPlayer = opponent;
    if (state.startingPlayer !== undefined && state.currentPlayer !== state.startingPlayer) {
        reply.turn++;
    }
    for (const monster of reply.monsters) {
        if (monster.owner !== opponent || monster.currentHp <= 0) continue;
        beginMonsterTurn(monster);
    }
    if (getMonsterEliminationWinner(reply.monsters, reply.monstersKilledForVictory) !== null) {
        return 0;
    }

    const attackPenalty = (attackerId: string): number => {
        let penalty = 0;
        for (const choice of getAvailableAttackChoices(reply, board, attackerId, false, true)) {
            const attack = choice.attacker.monster.attacks[choice.attackIndex];
            const victim = reply.monsters.find(
                (monster) =>
                    monster.owner === player &&
                    monster.currentHp > 0 &&
                    isSamePosition(monster.position, choice.target),
            );
            const backstab =
                attack &&
                !isAreaAttack(attack) &&
                victim &&
                (choice.attacker.monster.bonusDamageFromBehind ?? 0) > 0 &&
                isBehind(victim.position, choice.attacker.position, victim.facing);
            penalty = Math.max(
                penalty,
                scoreReplyThreat(
                    choice.features.baseDamage,
                    reply.health[player],
                    backstab ? choice.features.damage : 0,
                    backstab ? choice.features.kills : 0,
                ),
            );
        }
        return penalty;
    };

    let worst = 0;
    for (const monster of reply.monsters) {
        if (monster.owner !== opponent || monster.currentHp <= 0) continue;
        worst = Math.max(worst, attackPenalty(monster.id));
        if (worst >= DEFEAT_REPLY_PENALTY) return worst;
        if (isMonsterAsleep(monster)) continue;
        const cost = getMonsterMovementCost(monster);
        if (
            !canUseActionThisTurn(0, getMovementActionsPerTurn(monster.monster)) ||
            reply.reserves[opponent].movement < cost
        ) {
            continue;
        }
        const paths = getMovementPathMap(createMovementOptions(reply, board, monster));
        for (const path of paths.values()) {
            const moved = {
                ...monster,
                position: path[path.length - 1]!,
                facing: getFacingFromMovement(
                    monster.position,
                    path[path.length - 1]!,
                    monster.facing,
                ),
                ...(monster.turnBuffs ? { turnBuffs: { ...monster.turnBuffs } } : {}),
            };
            clearCamouflageForMovement(moved, path);
            consumeMovementTurnBuff(moved);
            const index = reply.monsters.indexOf(monster);
            reply.monsters[index] = moved;
            worst = Math.max(worst, attackPenalty(moved.id));
            reply.monsters[index] = monster;
            if (worst >= DEFEAT_REPLY_PENALTY) return worst;
        }
    }
    return worst;
}
