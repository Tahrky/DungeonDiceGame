import { GameSceneCombat } from "./GameSceneCombat";
import Phaser from "phaser";
import { getAvailableSymbolCount, storeRemainingDice } from "../game/diceResources";
import { isBoardCell } from "../game/boards";
import {
    advanceAttackCooldowns,
    clearMonsterTurnBuff,
    canPassHostileMonsters,
    canUseActionThisTurn,
    getFacingFromMovement,
    getGridDistance,
    getInitialAttackUses,
    getMonsterMovementPath,
    getMovementRange,
    getMovementActionsPerTurn,
    getMovementCost,
    type MovementOptions,
} from "../game/monsterActions";
import { ACTION_LOG_VISIBLE_COUNT } from "./game/GameHudBase";
import type { PlacedMonster, Position } from "../types/GameTypes";
import { applyStatusEffectsAtTurnStart } from "../game/statusEffects";
import { getMonsterEliminationWinner } from "../game/matchRules";

export abstract class GameSceneMovement extends GameSceneCombat {
    protected handleMovementAction(position: Position, monsterId: string | null): void {
        const clickedMonster = this.getLivingMonsterAt(position);
        if (!monsterId) {
            if (
                clickedMonster?.owner === this.currentPlayer &&
                this.canAffordMovement(clickedMonster)
            ) {
                this.actionMode = { type: "movement", monsterId: clickedMonster.id };
                this.render();
            }
            return;
        }

        const monster = this.getLivingMonster(monsterId);
        if (!monster || this.monsterSpriteView.isMoving(monster.id)) return;

        if (
            clickedMonster?.owner === this.currentPlayer &&
            clickedMonster.id !== monster.id &&
            this.canAffordMovement(clickedMonster)
        ) {
            this.actionMode = { type: "movement", monsterId: clickedMonster.id };
            this.render();
            return;
        }

        if (!this.canMoveTo(monster, position)) return;
        const path = getMonsterMovementPath(this.getMovementOptions(monster, position));
        if (path.length < 2) return;
        if (
            !this.spendCurrentSymbol(
                "movement",
                getMovementCost(
                    monster.monster,
                    monster.turnBuffs?.movementCostReduction ?? 0,
                ),
            )
        ) {
            return;
        }
        monster.movementsUsedThisTurn++;

        const distance = path.length - 1;
        monster.facing = getFacingFromMovement(monster.position, position, monster.facing);
        monster.position = { ...position };
        this.monsterSpriteView.moveMonster(monster.id, path.slice(1), monster.facing, () =>
            this.render(),
        );
        this.recordAction({
            type: "movement",
            player: this.currentPlayer,
            monsterName: monster.monster.name,
            distance,
        });
        if (!this.hasAffordableMovement()) {
            this.actionMode = { type: "idle" };
        }
        this.render();
    }

    protected canMoveTo(monster: PlacedMonster, destination: Position): boolean {
        if (!this.canAffordMovement(monster)) return false;
        return getMonsterMovementPath(this.getMovementOptions(monster, destination)).length > 1;
    }

    protected canAffordMovement(monster: PlacedMonster): boolean {
        return (
            monster.owner === this.currentPlayer &&
            monster.currentHp > 0 &&
            canUseActionThisTurn(
                monster.movementsUsedThisTurn,
                getMovementActionsPerTurn(monster.monster),
            ) &&
            getMovementCost(
                monster.monster,
                monster.turnBuffs?.movementCostReduction ?? 0,
            ) <=
                getAvailableSymbolCount(
                    "movement",
                    this.rolledDice,
                    this.diceReserves[this.currentPlayer],
                )
        );
    }

    protected hasAffordableMovement(): boolean {
        return this.placedMonsters.some((monster) => this.canAffordMovement(monster));
    }

    protected getMovementOptions(monster: PlacedMonster, destination: Position): MovementOptions {
        const deployedCells = this.placedMonsters.flatMap((placed) => placed.cells);
        const occupiedCells = this.placedMonsters
            .filter((placed) => placed.currentHp > 0 && placed.id !== monster.id)
            .map((placed) => placed.position);
        const hostileCells = this.placedMonsters
            .filter(
                (placed) =>
                    placed.currentHp > 0 &&
                    placed.owner !== monster.owner &&
                    placed.id !== monster.id,
            )
            .map((placed) => placed.position);
        const startingCells = Object.values(this.startingPositions);

        return {
            source: monster.position,
            destination,
            deployedCells,
            occupiedCells,
            blockedCells: [
                ...startingCells,
                ...this.board.blockedCells,
                ...this.obstacles.map(({ position }) => position),
            ],
            range: getMovementRange(
                monster.monster,
                monster.turnBuffs?.movementRangeBonus ?? 0,
            ),
            hostileCells,
            canPassHostiles: canPassHostileMonsters(monster.monster),
            canPassUndeployedCells: monster.monster.flying === true,
            boardWidth: this.board.width,
            boardHeight: this.board.height,
        };
    }

    protected getMovementCandidates(monsterId: string): Position[] {
        const monster = this.getLivingMonster(monsterId);
        if (!monster) return [];

        const candidates: Position[] = [];
        for (let y = 0; y < this.board.height; y++) {
            for (let x = 0; x < this.board.width; x++) {
                if (!isBoardCell(this.board, { x, y })) continue;
                if (
                    getGridDistance(monster.position, { x, y }) > 0 &&
                    getGridDistance(monster.position, { x, y }) <=
                        getMovementRange(
                            monster.monster,
                            monster.turnBuffs?.movementRangeBonus ?? 0,
                        )
                ) {
                    candidates.push({ x, y });
                }
            }
        }
        return candidates;
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
        this.currentPlayer = previousPlayer === 1 ? 2 : 1;
        this.lockedPreviewCell = null;
        this.hasLeftLockedPreviewBoard = false;
        if (previousPlayer === 2) this.turnNumber++;
        for (const monster of this.placedMonsters) {
            if (monster.owner === previousPlayer) clearMonsterTurnBuff(monster);
            if (monster.owner !== this.currentPlayer) continue;
            const statusDamage = applyStatusEffectsAtTurnStart(monster);
            if (statusDamage > 0) {
                this.monsterSpriteView.takeDamage(monster.id, monster.currentHp, monster.position);
            }
            monster.attacksUsedThisTurn = 0;
            monster.attackUsesThisTurn = getInitialAttackUses(monster.monster);
            monster.movementsUsedThisTurn = 0;
            monster.attackCooldowns = advanceAttackCooldowns(monster.attackCooldowns);
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
