import { GameSceneState } from "./GameSceneState";
import Phaser from "phaser";
import { DICE } from "../data/dice";
import { PLACEMENT_PATTERNS } from "../data/placementPatterns";
import { getAvailableSymbolCount, spendSymbols, storeRolledDie } from "../game/diceResources";
import { getInitialAttackCooldowns } from "../game/monsterActions";
import { canPlaceCells, getPatternCells } from "../game/placement";
import type { Position } from "../types/GameTypes";
import { getInvokedMonsterCount, MAX_MONSTERS_PER_PLAYER } from "../game/matchRules";

export abstract class GameSceneInvocation extends GameSceneState {
    protected rollDice(computerInitiated = false): void {
        if (this.hasRolled || this.winner !== null) return;
        if (
            this.computerOpponent &&
            this.currentPlayer === 2 &&
            this.computerTurnInProgress &&
            !computerInitiated
        ) {
            return;
        }

        this.rolledDice = DICE.map((die) => ({
            definitionId: die.id,
            symbol: die.faces[Phaser.Math.Between(0, die.faces.length - 1)],
            status: "available",
        }));
        this.hasRolled = true;
        this.selectedMonster = null;
        this.pendingCells = null;
        this.actionMode = { type: "idle" };
        this.invocationMenuOpen = false;
        this.render();
    }

    protected selectMonster(monsterId: string): void {
        const monster = this.getDeckMonsters(this.currentPlayer).find(
            (candidate) => candidate.id === monsterId,
        );
        if (
            !monster ||
            getInvokedMonsterCount(this.placedMonsters, this.currentPlayer) >=
                MAX_MONSTERS_PER_PLAYER ||
            this.actionMode.type !== "idle" ||
            getAvailableSymbolCount(
                "invocation",
                this.rolledDice,
                this.diceReserves[this.currentPlayer],
            ) < monster.cost
        ) {
            return;
        }

        this.selectedMonster = monster;
        this.pendingCells = null;
        this.render();
    }

    protected cancelInvocation(): void {
        if (!this.selectedMonster && !this.pendingCells) return;

        this.selectedMonster = null;
        this.pendingCells = null;
        this.render();
    }

    protected selectPattern(index: number): void {
        if (this.pendingCells || !PLACEMENT_PATTERNS[index]) return;

        this.selectedPattern = index;
        this.render();
    }

    protected rotatePattern(): void {
        if (this.pendingCells) return;

        this.patternRotation = (this.patternRotation + 1) % 4;
        this.render();
    }

    protected mirrorPattern(): void {
        if (this.pendingCells || this.actionMode.type !== "idle") return;

        this.patternMirrored = !this.patternMirrored;
        this.render();
    }

    protected togglePatternSelector(): void {
        this.patternSelectorExpanded = !this.patternSelectorExpanded;
        this.render();
    }

    protected toggleInvocationMenu(): void {
        this.invocationMenuOpen = !this.invocationMenuOpen;
        this.render();
    }

    protected getMonsterCells(origin: Position): Position[] {
        return getPatternCells(
            PLACEMENT_PATTERNS[this.selectedPattern],
            origin,
            this.patternRotation,
            this.patternMirrored,
        );
    }

    protected canPlaceMonster(origin: Position, player = this.currentPlayer): boolean {
        const cells = this.getMonsterCells(origin);
        const occupiedCells = [
            ...Object.values(this.startingPositions),
            ...this.placedMonsters.flatMap((placed) => placed.cells),
        ];
        const ownedPathCells = this.placedMonsters
            .filter((placed) => placed.owner === player)
            .flatMap((placed) => placed.cells);
        const connectedCells = [this.startingPositions[player], ...ownedPathCells];

        return canPlaceCells(
            cells,
            this.board.width,
            occupiedCells,
            connectedCells,
            ownedPathCells,
            this.board.height,
            this.board.blockedCells,
        );
    }

    protected tryPlaceMonster(position: Position): void {
        if (!this.hasRolled) return;
        if (this.actionMode.type !== "idle") {
            this.handleBoardAction(position);
            return;
        }
        if (
            !this.selectedMonster ||
            getInvokedMonsterCount(this.placedMonsters, this.currentPlayer) >=
                MAX_MONSTERS_PER_PLAYER
        ) {
            return;
        }

        if (this.pendingCells) {
            const isOnDie = this.pendingCells.some(
                (cell) => cell.x === position.x && cell.y === position.y,
            );
            const isOccupied = this.getLivingMonsterAt(position) !== undefined;
            const isStartingCell = Object.values(this.startingPositions).some(
                (start) => start.x === position.x && start.y === position.y,
            );
            if (!isOnDie || isOccupied || isStartingCell) return;

            const didPay = spendSymbols(
                "invocation",
                this.selectedMonster.cost,
                this.rolledDice,
                this.diceReserves[this.currentPlayer],
            );
            if (!didPay) return;

            this.placedMonsters.push({
                id: `monster-${this.nextMonsterId++}`,
                monster: this.selectedMonster,
                owner: this.currentPlayer,
                position: { ...position },
                facing: this.currentPlayer === 1 ? "east" : "west",
                currentHp: this.selectedMonster.hp,
                cells: this.pendingCells,
                attacksUsedThisTurn: 0,
                movementsUsedThisTurn: 0,
                attackCooldowns: getInitialAttackCooldowns(this.selectedMonster),
            });
            this.recordAction({
                type: "invocation",
                player: this.currentPlayer,
                monsterName: this.selectedMonster.name,
                cost: this.selectedMonster.cost,
            });
            this.selectedMonster = null;
            this.pendingCells = null;
            this.render();
            return;
        }

        if (!this.canPlaceMonster(position)) return;

        this.pendingCells = this.getMonsterCells(position);
        this.render();
    }

    protected storeDie(dieIndex: number): void {
        if (!this.hasRolled || this.pendingCells || this.actionMode.type !== "idle") return;
        if (storeRolledDie(this.rolledDice, dieIndex, this.diceReserves[this.currentPlayer])) {
            this.render();
        }
    }

    protected abstract handleBoardAction(position: Position): void;
    protected abstract handleMovementAction(position: Position, monsterId: string | null): void;
}
