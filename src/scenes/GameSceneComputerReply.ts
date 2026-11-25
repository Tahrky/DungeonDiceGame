import { GameSceneMovement } from "./GameSceneMovement";
import { getFacingFromMovement, isBehind, isSamePosition } from "../game/geometry";
import { getMonsterEliminationWinner } from "../game/matchRules";
import {
    canAttackMonster,
    clearCamouflageForMovement,
    consumeMovementTurnBuff,
    createPlacedMonster,
    getBuffedAttackDamage,
    getMovementPathMap,
    isAreaAttack,
    resetAttackTurnState,
} from "../game/monsterActions";
import type { PatternPlacement } from "../game/placement";
import { DEFEAT_REPLY_PENALTY, scoreReplyThreat } from "../game/replyThreat";
import { applyStatusEffectsAtTurnStart } from "../game/statusEffects";
import type { Monster, PlacedMonster, Position } from "../types/GameTypes";

export abstract class GameSceneComputerReply extends GameSceneMovement {
    protected getComputerPlacementReplyPenalty(
        monster: Monster,
        placement: PatternPlacement,
    ): number {
        const candidate = createPlacedMonster(
            `monster-${this.nextMonsterId}`,
            monster,
            2,
            placement.position,
            placement.cells,
            this.turnNumber,
        );
        return this.getComputerReplyPenalty([...this.placedMonsters, candidate]);
    }

    protected getComputerMovementReplyPenalty(monster: PlacedMonster, path: Position[]): number {
        const destination = path[path.length - 1]!;
        const moved: PlacedMonster = {
            ...monster,
            position: destination,
            facing: getFacingFromMovement(monster.position, destination, monster.facing),
            ...(monster.turnBuffs ? { turnBuffs: { ...monster.turnBuffs } } : {}),
        };
        clearCamouflageForMovement(moved, path);
        consumeMovementTurnBuff(moved);
        return this.getComputerReplyPenalty(
            this.placedMonsters.map((placed) => (placed.id === monster.id ? moved : placed)),
        );
    }

    protected getComputerReplyPenalty(monsters: readonly PlacedMonster[]): number {
        if (!monsters.some((monster) => monster.owner === 1 && monster.currentHp > 0)) return 0;
        const previous = {
            currentPlayer: this.currentPlayer,
            turnNumber: this.turnNumber,
            rolledDice: this.rolledDice,
            placedMonsters: this.placedMonsters,
        };
        this.placedMonsters = monsters.map((placed) => ({
            ...placed,
            attackUsesThisTurn: [...placed.attackUsesThisTurn],
            attackCooldowns: [...placed.attackCooldowns],
            statusEffects: [...placed.statusEffects],
            ...(placed.turnBuffs ? { turnBuffs: { ...placed.turnBuffs } } : {}),
        }));
        this.currentPlayer = 1;
        this.turnNumber++;
        this.rolledDice = [];
        try {
            for (const opponent of this.getLivingMonsters(1)) {
                applyStatusEffectsAtTurnStart(opponent);
                resetAttackTurnState(opponent);
                opponent.movementsUsedThisTurn = 0;
            }
            if (
                getMonsterEliminationWinner(
                    this.placedMonsters,
                    this.gameConfiguration.monstersKilledForVictory,
                ) !== null
            ) {
                return 0;
            }
            return this.getWorstComputerReply();
        } finally {
            this.currentPlayer = previous.currentPlayer;
            this.turnNumber = previous.turnNumber;
            this.rolledDice = previous.rolledDice;
            this.placedMonsters = previous.placedMonsters;
        }
    }

    private getWorstComputerReply(): number {
        let worst = 0;
        for (const opponent of this.getLivingMonsters(1)) {
            worst = Math.max(worst, this.getComputerReplyAttackPenalty(opponent));
            if (worst >= DEFEAT_REPLY_PENALTY) return worst;
            if (!this.canAffordMovement(opponent)) continue;
            const paths = getMovementPathMap(this.getMovementOptions(opponent, opponent.position));
            const index = this.placedMonsters.indexOf(opponent);
            for (const path of paths.values()) {
                const destination = path[path.length - 1]!;
                const moved: PlacedMonster = {
                    ...opponent,
                    position: destination,
                    facing: getFacingFromMovement(opponent.position, destination, opponent.facing),
                    ...(opponent.turnBuffs ? { turnBuffs: { ...opponent.turnBuffs } } : {}),
                };
                clearCamouflageForMovement(moved, path);
                consumeMovementTurnBuff(moved);
                this.placedMonsters[index] = moved;
                worst = Math.max(worst, this.getComputerReplyAttackPenalty(moved));
                this.placedMonsters[index] = opponent;
                if (worst >= DEFEAT_REPLY_PENALTY) return worst;
            }
        }
        return worst;
    }

    private getComputerReplyAttackPenalty(attacker: PlacedMonster): number {
        let worst = 0;
        for (const [index, attack] of attacker.monster.attacks.entries()) {
            if (attack.targetsAlliesOnly || !this.canUseMonsterAttack(attacker, index)) continue;
            for (const target of this.getAttackCandidateCells(attacker.id, index)) {
                if (!this.canAttackTarget(attacker.id, index, target)) continue;
                const cells = this.getAttackPreviewCells(attacker.id, index, target);
                const baseDamage = Number(
                    cells.some((cell) => isSamePosition(cell, this.startingPositions[2])),
                );
                const victim = this.getLivingMonsterAt(target);
                const backstab =
                    !isAreaAttack(attack) &&
                    victim?.owner === 2 &&
                    canAttackMonster(attacker.monster, attack, victim.monster) &&
                    (attacker.monster.bonusDamageFromBehind ?? 0) > 0 &&
                    isBehind(victim.position, attacker.position, victim.facing);
                const damage =
                    backstab && victim
                        ? Math.min(
                              victim.currentHp,
                              getBuffedAttackDamage(attacker, attack) +
                                  (attacker.monster.bonusDamageFromBehind ?? 0),
                          )
                        : 0;
                worst = Math.max(
                    worst,
                    scoreReplyThreat(
                        baseDamage,
                        this.playerHealth[2],
                        damage,
                        Number(!!victim && damage >= victim.currentHp),
                    ),
                );
            }
        }
        return worst;
    }
}
