import Phaser from "phaser";

import { GAME_CONFIG } from "../../config";
import { MONSTER_SPRITES } from "../../data/monsterSprites";
import { PLACEMENT_PATTERNS } from "../../data/placementPatterns";
import { getPatternCells } from "../../game/placement";

import type { GameViewState } from "./GameViewState";
import type { PlayerId, Position } from "../../types/GameTypes";

interface CellStyle {
    color: number;
    fillAlpha: number;
}

interface BoardActions {
    canPlace: (origin: Position) => boolean;
    canMove: (monsterId: string, destination: Position) => boolean;
    getMovementCandidates: (monsterId: string) => Position[];
    canAttack: (attackerId: string, attackIndex: number | null, target: Position) => boolean;
    getAttackCandidates: (attackerId: string, attackIndex: number) => Position[];
    getAttackRange: (attackerId: string, attackIndex: number) => Position[];
    getAttackPreview: (attackerId: string, attackIndex: number, target: Position) => Position[];
}

interface CellRenderContext {
    state: GameViewState;
    previewCells: readonly Position[];
    actions: BoardActions;
    attackRange: readonly Position[];
    attackCandidates: readonly Position[];
    attackPreview: readonly Position[];
    movementCandidates: readonly Position[];
}

const VALID_ACTION_COLOR = 0xf1cf65;
const INVALID_MOVE_COLOR = 0x555d68;
const ACTION_HOVER_COLOR = 0x54c8c0;

const OWNER_COLORS: Record<PlayerId, number> = {
    1: 0x914d49,
    2: 0x416e9a,
};

const PREVIEW_COLORS: Record<PlayerId, { valid: number; invalid: number }> = {
    1: { valid: 0xff6655, invalid: 0x914d49 },
    2: { valid: 0x55aaff, invalid: 0x416e9a },
};

function toGrayscale(color: number): number {
    const red = (color >> 16) & 0xff;
    const green = (color >> 8) & 0xff;
    const blue = color & 0xff;
    const gray = Math.round(red * 0.299 + green * 0.587 + blue * 0.114);
    return (gray << 16) | (gray << 8) | gray;
}

export class BoardView {
    private readonly graphics: Phaser.GameObjects.Graphics;
    private readonly toScreen: (position: Position) => Position;

    constructor(graphics: Phaser.GameObjects.Graphics, toScreen: (position: Position) => Position) {
        this.graphics = graphics;
        this.toScreen = toScreen;
    }

    screenToGrid(position: Position): Position {
        const { tileWidth, tileHeight, boardOffsetX, boardOffsetY } = GAME_CONFIG;
        const dx = position.x - boardOffsetX;
        const dy = position.y - boardOffsetY;

        return {
            x: Math.round(dx / tileWidth + dy / tileHeight),
            y: Math.round(-dx / tileWidth + dy / tileHeight),
        };
    }

    isInsideBoard(position: Position): boolean {
        return (
            position.x >= 0 &&
            position.y >= 0 &&
            position.x < GAME_CONFIG.boardSize &&
            position.y < GAME_CONFIG.boardSize
        );
    }

    draw(state: GameViewState, actions: BoardActions): void {
        this.graphics.clear();
        const { boardSize } = GAME_CONFIG;
        const previewCells = this.getPreviewCells(state);
        const attackRange = this.getAttackRange(state, actions);
        const attackCandidates = this.getAttackCandidates(state, actions);
        const attackPreview = this.getAttackPreview(state, actions);
        const movementCandidates = this.getMovementCandidates(state, actions);
        const context: CellRenderContext = {
            state,
            previewCells,
            actions,
            attackRange,
            attackCandidates,
            attackPreview,
            movementCandidates,
        };

        for (let y = 0; y < boardSize; y++) {
            for (let x = 0; x < boardSize; x++) {
                this.drawCell({ x, y }, context);
            }
        }

        this.drawStartingPositions(state);
        this.drawMonsters(state);
    }

    private drawCell(cell: Position, context: CellRenderContext): void {
        const { tileWidth, tileHeight } = GAME_CONFIG;
        const center = this.toScreen(cell);
        const style = this.getCellStyle(cell, context);

        const color = context.state.winner === null ? style.color : toGrayscale(style.color);
        const borderColor = context.state.winner === null ? 0x35443a : toGrayscale(0x35443a);
        this.graphics.fillStyle(color, style.fillAlpha);
        this.graphics.lineStyle(1, borderColor, 0.8);

        const points = [
            new Phaser.Math.Vector2(center.x, center.y - tileHeight / 2),
            new Phaser.Math.Vector2(center.x + tileWidth / 2, center.y),
            new Phaser.Math.Vector2(center.x, center.y + tileHeight / 2),
            new Phaser.Math.Vector2(center.x - tileWidth / 2, center.y),
        ];
        this.graphics.fillPoints(points, true);
        this.graphics.strokePoints(points, true);
    }

    private getCellStyle(cell: Position, context: CellRenderContext): CellStyle {
        const { state, previewCells, actions } = context;
        const actionStyle = this.getActionCellStyle(cell, context);
        if (actionStyle) return actionStyle;

        let color = this.getBaseCellColor(cell, state);
        let fillAlpha = 1;

        if (this.hasCell(state.pendingCells, cell)) {
            color = state.currentPlayer === 1 ? 0xc36a60 : 0x5d91bd;
        } else if (this.hasCell(previewCells, cell) && state.hoveredCell) {
            const isValid = actions.canPlace(state.hoveredCell);
            color = this.getPreviewColor(state.currentPlayer, isValid);
            fillAlpha = isValid ? 1 : 0.7;
        }

        if (this.isHoveredPendingCell(cell, state)) {
            color = VALID_ACTION_COLOR;
        }

        return { color, fillAlpha };
    }

    private getActionCellStyle(cell: Position, context: CellRenderContext): CellStyle | null {
        if (context.state.actionMode.type === "attack") {
            return this.getAttackCellStyle(cell, context);
        }
        if (context.state.actionMode.type === "movement") {
            return this.getMovementCellStyle(cell, context);
        }
        return null;
    }

    private getAttackCellStyle(cell: Position, context: CellRenderContext): CellStyle | null {
        const { state, attackPreview, attackRange, attackCandidates } = context;
        if (state.actionMode.type !== "attack") return null;
        const { attackerId, attackIndex } = state.actionMode;
        if (!attackerId || attackIndex === null) return null;
        if (this.hasCell(attackPreview, cell)) {
            return { color: ACTION_HOVER_COLOR, fillAlpha: 1 };
        }
        if (this.hasCell(attackRange, cell)) {
            return { color: VALID_ACTION_COLOR, fillAlpha: 1 };
        }
        if (this.hasCell(attackCandidates, cell)) {
            return { color: INVALID_MOVE_COLOR, fillAlpha: 0.8 };
        }
        return null;
    }

    private getMovementCellStyle(cell: Position, context: CellRenderContext): CellStyle | null {
        const { state, actions, movementCandidates } = context;
        if (state.actionMode.type !== "movement") return null;
        const { monsterId } = state.actionMode;
        if (!monsterId || !this.hasCell(movementCandidates, cell)) return null;

        const canMove = actions.canMove(monsterId, cell);
        let color = canMove ? VALID_ACTION_COLOR : INVALID_MOVE_COLOR;
        if (canMove && this.isHoveredCell(cell, state)) color = ACTION_HOVER_COLOR;
        return { color, fillAlpha: canMove ? 1 : 0.8 };
    }

    private getMovementCandidates(state: GameViewState, actions: BoardActions): Position[] {
        if (state.actionMode.type !== "movement" || !state.actionMode.monsterId) return [];
        return actions.getMovementCandidates(state.actionMode.monsterId);
    }

    private getAttackCandidates(state: GameViewState, actions: BoardActions): Position[] {
        if (
            state.actionMode.type !== "attack" ||
            !state.actionMode.attackerId ||
            state.actionMode.attackIndex === null
        ) {
            return [];
        }
        return actions.getAttackCandidates(
            state.actionMode.attackerId,
            state.actionMode.attackIndex,
        );
    }

    private getAttackRange(state: GameViewState, actions: BoardActions): Position[] {
        if (
            state.actionMode.type !== "attack" ||
            !state.actionMode.attackerId ||
            state.actionMode.attackIndex === null
        ) {
            return [];
        }
        return actions.getAttackRange(state.actionMode.attackerId, state.actionMode.attackIndex);
    }

    private getAttackPreview(state: GameViewState, actions: BoardActions): Position[] {
        if (
            state.actionMode.type !== "attack" ||
            !state.actionMode.attackerId ||
            state.actionMode.attackIndex === null ||
            !state.hoveredCell ||
            !actions.canAttack(
                state.actionMode.attackerId,
                state.actionMode.attackIndex,
                state.hoveredCell,
            )
        ) {
            return [];
        }
        return actions.getAttackPreview(
            state.actionMode.attackerId,
            state.actionMode.attackIndex,
            state.hoveredCell,
        );
    }

    private getBaseCellColor(cell: Position, state: GameViewState): number {
        const owner = this.getCellOwner(cell, state);
        if (owner !== null) return OWNER_COLORS[owner];

        return (cell.x + cell.y) % 2 === 0 ? 0x667b61 : 0x71866a;
    }

    private getPreviewColor(player: PlayerId, isValid: boolean): number {
        return isValid ? PREVIEW_COLORS[player].valid : PREVIEW_COLORS[player].invalid;
    }

    private isHoveredPendingCell(cell: Position, state: GameViewState): boolean {
        const hoveredCell = state.hoveredCell;
        if (hoveredCell?.x !== cell.x || hoveredCell?.y !== cell.y) return false;

        return this.hasCell(state.pendingCells, cell);
    }

    private hasCell(cells: readonly Position[] | null, target: Position): boolean {
        return cells?.some((cell) => cell.x === target.x && cell.y === target.y) ?? false;
    }

    private isHoveredCell(cell: Position, state: GameViewState): boolean {
        return state.hoveredCell?.x === cell.x && state.hoveredCell.y === cell.y;
    }

    private getPreviewCells(state: GameViewState): Position[] {
        if (state.pendingCells) return state.pendingCells;
        if (!state.selectedMonster || !state.hoveredCell || !state.hasRolled) return [];

        return this.getMonsterCells(state.hoveredCell, state);
    }

    private getMonsterCells(origin: Position, state: GameViewState): Position[] {
        return getPatternCells(
            PLACEMENT_PATTERNS[state.selectedPattern],
            origin,
            state.patternRotation,
            state.patternMirrored,
        );
    }

    private getCellOwner(cell: Position, state: GameViewState): PlayerId | null {
        for (const player of [1, 2] as PlayerId[]) {
            const start = state.startingPositions[player];
            if (start.x === cell.x && start.y === cell.y) return player;
        }

        const placed = state.placedMonsters.find((monster) =>
            monster.cells.some((occupied) => occupied.x === cell.x && occupied.y === cell.y),
        );
        return placed?.owner ?? null;
    }

    private drawStartingPositions(state: GameViewState): void {
        for (const player of [1, 2] as PlayerId[]) {
            const start = state.startingPositions[player];
            const center = this.toScreen(start);
            const fillColor = player === 1 ? 0xff6655 : 0x55aaff;
            const outlineColor = player === 1 ? 0x000000 : 0xffffff;
            this.graphics.fillStyle(state.winner === null ? fillColor : toGrayscale(fillColor), 1);
            this.graphics.fillCircle(center.x, center.y, 9);
            this.graphics.lineStyle(
                3,
                state.winner === null ? outlineColor : toGrayscale(outlineColor),
                1,
            );
            this.graphics.strokeCircle(center.x, center.y, 9);
        }
    }

    private drawMonsters(state: GameViewState): void {
        for (const placed of state.placedMonsters) {
            if (placed.currentHp <= 0) continue;
            if (MONSTER_SPRITES[placed.monster.id]) continue;

            const center = this.toScreen(placed.position);
            this.graphics.fillStyle(
                state.winner === null ? placed.monster.color : toGrayscale(placed.monster.color),
                1,
            );
            this.graphics.fillCircle(center.x, center.y - 3, 6);
            const ownerOutlineColor = placed.owner === 1 ? 0x000000 : 0xffffff;
            const outlineColor =
                state.winner === null ? ownerOutlineColor : toGrayscale(ownerOutlineColor);
            this.graphics.lineStyle(1.5, outlineColor, 1);
            this.graphics.strokeCircle(center.x, center.y - 3, 6);
            const facingOffset = {
                north: { x: 0, y: -1 },
                east: { x: 1, y: 0 },
                south: { x: 0, y: 1 },
                west: { x: -1, y: 0 },
            }[placed.facing];
            const facingPoint = this.toScreen({
                x: placed.position.x + facingOffset.x,
                y: placed.position.y + facingOffset.y,
            });
            const directionLength = Phaser.Math.Distance.Between(
                center.x,
                center.y,
                facingPoint.x,
                facingPoint.y,
            );
            const markerX = center.x + ((facingPoint.x - center.x) / directionLength) * 9;
            const markerY = center.y + ((facingPoint.y - center.y) / directionLength) * 9;
            this.graphics.lineStyle(2, outlineColor, 1);
            this.graphics.lineBetween(center.x, center.y - 3, markerX, markerY - 3);
        }
    }
}
