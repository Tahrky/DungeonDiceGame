import { GameSceneState } from "./GameSceneState";
import Phaser from "phaser";
import { DICE } from "../data/dice";
import { PLACEMENT_PATTERNS } from "../data/placementPatterns";
import { getRollableDieFaces, storeRemainingDice, storeRolledDie } from "../game/diceResources";
import {
    canPlaceCells,
    createInitialDeploymentProtection,
    getPatternCells,
} from "../game/placement";
import { isBoardCell } from "../game/boards";
import { isSamePosition } from "../game/geometry";
import { getInvokedMonsterCount, opposingPlayer } from "../game/matchRules";
import type {
    BoardCellHeight,
    BoardHeightChange,
    BoardObstacle,
    Monster,
    PlayerId,
    Position,
} from "../types/GameTypes";

type DeploymentProtection = (cells: readonly Position[]) => boolean;

export abstract class GameSceneInvocation extends GameSceneState {
    private firstDeploymentProtectionCache: {
        key: string;
        protection: DeploymentProtection | null;
    } | null = null;

    protected rollDice(computerInitiated = false): void {
        if (this.hasRolled || this.winner !== null || this.actionMode.type !== "idle") return;
        if (
            this.computerOpponent &&
            this.currentPlayer === 2 &&
            this.computerTurnInProgress &&
            !computerInitiated
        ) {
            return;
        }

        const excludeInvocation =
            this.gameConfiguration.removeInvocationDiceWhenNoMonsters &&
            this.hasReachedMonsterLimit();
        this.rolledDice = DICE.slice(0, this.gameConfiguration.diceCount).map((die) => {
            const faces = getRollableDieFaces(die, excludeInvocation);
            return {
                definitionId: die.id,
                symbol: faces[Phaser.Math.Between(0, faces.length - 1)]!,
                status: "available",
            };
        });
        storeRemainingDice(this.rolledDice, this.diceReserves[this.currentPlayer]);
        this.hasRolled = true;
        this.clearInvocationSelection();
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
            this.hasReachedMonsterLimit() ||
            this.actionMode.type !== "idle" ||
            this.getAvailableSymbols("invocation") < monster.cost
        ) {
            return;
        }

        this.selectedMonster = monster;
        this.pendingCells = null;
        this.render();
    }

    protected cancelInvocation(): void {
        if (!this.selectedMonster && !this.pendingCells) return;

        this.clearInvocationSelection();
        this.render();
    }

    private clearInvocationSelection(): void {
        this.selectedMonster = null;
        this.pendingCells = null;
        this.lockedPreviewCell = null;
        this.hasLeftLockedPreviewBoard = false;
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
        const isClosing = this.invocationMenuOpen;
        this.invocationMenuOpen = !this.invocationMenuOpen;
        if (isClosing) this.clearInvocationSelection();
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
        const ownedPathCells = this.getOwnedCells(player);

        return (
            canPlaceCells(
                cells,
                this.board.width,
                this.getOccupiedCells(),
                [this.startingPositions[player], ...ownedPathCells],
                ownedPathCells,
                this.board.height,
                this.getBlockedCells(),
            ) && this.preservesOpponentFirstDeployment(player, cells)
        );
    }

    protected getOpponentFirstDeploymentProtection(player: PlayerId): DeploymentProtection | null {
        if (!this.gameConfiguration.protectFirstDeployment) return null;
        const opponent = opposingPlayer(player);
        if (getInvokedMonsterCount(this.placedMonsters, opponent) > 0) return null;

        const key = JSON.stringify({
            board: this.board.id,
            dimensions: [this.board.width, this.board.height],
            player,
            monsters: this.placedMonsters.map(({ id, owner, cells }) => [id, owner, cells]),
            obstacles: this.obstacles.map(({ position }) => position),
        });
        if (this.firstDeploymentProtectionCache?.key === key) {
            return this.firstDeploymentProtectionCache.protection;
        }

        const protection = createInitialDeploymentProtection({
            patterns: PLACEMENT_PATTERNS,
            boardWidth: this.board.width,
            boardHeight: this.board.height,
            start: this.startingPositions[opponent],
            occupiedCells: this.getOccupiedCells(),
            connectedCells: [this.startingPositions[opponent]],
            blockedCells: this.getBlockedCells(),
        });
        this.firstDeploymentProtectionCache = { key, protection };
        return protection;
    }

    protected preservesOpponentFirstDeployment(
        player: PlayerId,
        candidateCells: readonly Position[],
    ): boolean {
        return this.getOpponentFirstDeploymentProtection(player)?.(candidateCells) ?? true;
    }

    protected changeCellHeight(delta: BoardHeightChange, position: Position): void {
        if (this.winner !== null || !isBoardCell(this.board, position)) return;

        const isAtPosition = (obstacle: BoardObstacle) =>
            isSamePosition(obstacle.position, position);
        const currentHeight = this.obstacles.find(isAtPosition)?.height ?? 0;
        const nextHeight: BoardCellHeight =
            delta > 0 ? (currentHeight === -1 ? 0 : 1) : currentHeight === 1 ? 0 : -1;
        if (nextHeight === currentHeight) return;

        this.obstacles = this.obstacles.filter((obstacle) => !isAtPosition(obstacle));
        if (nextHeight !== 0) {
            this.obstacles.push({ height: nextHeight, position: { ...position } });
        }
        this.render();
    }

    protected tryPlaceMonster(position: Position): void {
        if (!this.hasRolled) return;
        if (this.actionMode.type !== "idle") {
            this.handleBoardAction(position);
            return;
        }
        if (!this.selectedMonster || this.hasReachedMonsterLimit()) return;

        if (this.pendingCells) {
            this.confirmPlacement(this.selectedMonster, this.pendingCells, position);
            return;
        }

        if (!this.canPlaceMonster(position)) return;

        this.pendingCells = this.getMonsterCells(position);
        this.render();
    }

    private confirmPlacement(monster: Monster, cells: Position[], position: Position): void {
        const isValidPosition =
            cells.some((cell) => isSamePosition(cell, position)) &&
            !this.getLivingMonsterAt(position) &&
            !Object.values(this.startingPositions).some((start) =>
                isSamePosition(start, position),
            ) &&
            !cells.some((cell) =>
                this.obstacles.some((obstacle) => isSamePosition(obstacle.position, cell)),
            );
        if (!isValidPosition || !this.spendCurrentSymbol("invocation", monster.cost)) return;

        this.placedMonsters.push(
            this.createPlacedMonster(monster, this.currentPlayer, position, cells),
        );
        this.recordAction({
            type: "invocation",
            player: this.currentPlayer,
            monsterName: monster.name,
            cost: monster.cost,
        });
        this.clearInvocationSelection();
        if (this.getAvailableSymbols("invocation") === 0) this.invocationMenuOpen = false;
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
