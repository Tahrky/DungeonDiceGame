import { GameSceneCombat } from "./GameSceneCombat";
import Phaser from "phaser";
import { storeRemainingDice } from "../game/diceResources";
import { isBoardCell } from "../game/boards";
import {
    clearMonsterTurnBuff,
    canUseActionThisTurn,
    applyMonsterMovement,
    getGridDistance,
    getMonsterMovementPath,
    getMovementRange,
    getMovementActionsPerTurn,
    type MovementOptions,
} from "../game/monsterActions";
import { ACTION_LOG_VISIBLE_COUNT } from "./game/hudLayout";
import type { PlacedMonster, Position } from "../types/GameTypes";
import { beginMonsterTurn } from "../game/statusEffects";
import { getMonsterEliminationWinner, opposingPlayer } from "../game/matchRules";
import { createMonsterMovementOptions } from "../game/movementRules";

export abstract class GameSceneMovement extends GameSceneCombat {
    protected handleMovementAction(position: Position, monsterId: string | null): void {
        const clickedMonster = this.getLivingMonsterAt(position);
        const monster = monsterId ? this.getLivingMonster(monsterId) : undefined;
        if (monsterId && (!monster || this.monsterSpriteView.isMoving(monster.id))) return;

        if (
            clickedMonster?.owner === this.currentPlayer &&
            clickedMonster.id !== monster?.id &&
            this.canAffordMovement(clickedMonster)
        ) {
            this.actionMode = { type: "movement", monsterId: clickedMonster.id };
            this.render();
        } else if (monster) {
            this.moveMonster(monster, position);
        }
    }

    private moveMonster(monster: PlacedMonster, position: Position): void {
        if (!this.canAffordMovement(monster)) return;
        const path = getMonsterMovementPath(this.getMovementOptions(monster, position));
        if (path.length < 2) return;
        if (!this.spendCurrentSymbol("movement", this.getMonsterMovementCost(monster))) return;

        const { camouflageCleared } = applyMonsterMovement(monster, path);
        if (camouflageCleared) {
            this.monsterSpriteView.clearCamouflage(monster.id);
        }
        this.monsterSpriteView.moveMonster(monster.id, path.slice(1), monster.facing, () =>
            this.render(),
        );
        this.recordAction({
            type: "movement",
            player: this.currentPlayer,
            monsterName: monster.monster.name,
            distance: path.length - 1,
        });
        if (!this.hasAffordableMovement()) {
            this.actionMode = { type: "idle" };
        }
        this.render();
    }

    protected canMoveTo(monster: PlacedMonster, destination: Position): boolean {
        return (
            this.canAffordMovement(monster) &&
            getMonsterMovementPath(this.getMovementOptions(monster, destination)).length > 1
        );
    }

    protected canAffordMovement(monster: PlacedMonster): boolean {
        return (
            monster.owner === this.currentPlayer &&
            monster.currentHp > 0 &&
            canUseActionThisTurn(
                monster.movementsUsedThisTurn,
                getMovementActionsPerTurn(monster.monster),
            ) &&
            this.getMonsterMovementCost(monster) <= this.getAvailableSymbols("movement")
        );
    }

    protected hasAffordableMovement(): boolean {
        return this.placedMonsters.some((monster) => this.canAffordMovement(monster));
    }

    protected getMovementOptions(monster: PlacedMonster, destination: Position): MovementOptions {
        return createMonsterMovementOptions(
            this.board,
            this.placedMonsters,
            this.getBlockedCells(),
            monster,
            destination,
        );
    }

    protected getMovementCandidates(monsterId: string): Position[] {
        const monster = this.getLivingMonster(monsterId);
        if (!monster) return [];

        const range = this.getMonsterMovementRange(monster);
        const candidates: Position[] = [];
        for (let y = 0; y < this.board.height; y++) {
            for (let x = 0; x < this.board.width; x++) {
                const distance = getGridDistance(monster.position, { x, y });
                if (distance > 0 && distance <= range && isBoardCell(this.board, { x, y })) {
                    candidates.push({ x, y });
                }
            }
        }
        return candidates;
    }

    private getMonsterMovementRange({ monster, turnBuffs }: PlacedMonster): number {
        return getMovementRange(monster, turnBuffs?.movementRangeBonus ?? 0);
    }

    protected cancelBoardAction(): void {
        this.actionMode = { type: "idle" };
        this.render();
    }

    protected scrollActionHistory(offset: number): void {
        this.actionHistoryScrollOffset = Phaser.Math.Clamp(
            offset,
            0,
            Math.max(0, this.actionHistory.length - ACTION_LOG_VISIBLE_COUNT),
        );
        this.render();
    }

    protected finishTurn(): void {
        if (!this.hasRolled || this.winner !== null || this.actionMode.type !== "idle") return;
        storeRemainingDice(this.rolledDice, this.diceReserves[this.currentPlayer]);
        this.endTurn();
    }

    protected endTurn(): void {
        const previousPlayer = this.currentPlayer;
        this.currentPlayer = opposingPlayer(previousPlayer);
        this.lockedPreviewCell = null;
        this.hasLeftLockedPreviewBoard = false;
        if (previousPlayer === 2) this.turnNumber++;
        for (const monster of this.placedMonsters) {
            if (monster.owner === previousPlayer) clearMonsterTurnBuff(monster);
            if (monster.owner !== this.currentPlayer) continue;
            const statusDamage = beginMonsterTurn(monster);
            if (statusDamage > 0) {
                this.monsterSpriteView.takeDamage(monster.id, monster.currentHp, monster.position);
            }
        }
        this.winner ??= getMonsterEliminationWinner(
            this.placedMonsters,
            this.gameConfiguration.monstersKilledForVictory,
        );
        this.hasRolled = false;
        this.rolledDice = [];
        this.selectedMonster = null;
        this.pendingCells = null;
        this.hoveredCell = null;
        this.actionMode = { type: "idle" };
        this.render();
        if (this.computerOpponent && this.currentPlayer === 2 && this.winner === null) {
            this.computerTurnInProgress = true;
            this.time.delayedCall(450, () => this.playComputerTurn());
        } else {
            this.computerTurnInProgress = false;
        }
    }

    protected abstract playComputerTurn(): void;
}
