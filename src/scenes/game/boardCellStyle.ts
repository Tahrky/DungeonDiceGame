import { PLACEMENT_PATTERNS } from "../../data/placementPatterns";
import { isSamePosition } from "../../game/geometry";
import { getPatternCells } from "../../game/placement";
import type { PlayerId, Position } from "../../types/GameTypes";
import type { GameViewState } from "./GameViewState";

export interface CellStyle {
    color: number;
    fillAlpha: number;
}

export interface BoardActions {
    canPlace: (origin: Position) => boolean;
    canMove: (monsterId: string, destination: Position) => boolean;
    getMovementCandidates: (monsterId: string) => Position[];
    canAttack: (attackerId: string, attackIndex: number | null, target: Position) => boolean;
    getAttackCandidates: (attackerId: string, attackIndex: number) => Position[];
    getAttackRange: (attackerId: string, attackIndex: number) => Position[];
    getAttackPreview: (attackerId: string, attackIndex: number, target: Position) => Position[];
}

export interface CellRenderContext {
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

const PENDING_COLORS: Record<PlayerId, number> = {
    1: 0xc36a60,
    2: 0x5d91bd,
};

const PREVIEW_COLORS: Record<PlayerId, { valid: number; invalid: number }> = {
    1: { valid: 0xff6655, invalid: 0x914d49 },
    2: { valid: 0x55aaff, invalid: 0x416e9a },
};

function hasCell(cells: readonly Position[] | null, target: Position): boolean {
    return cells?.some((cell) => isSamePosition(cell, target)) ?? false;
}

function isHoveredCell(cell: Position, state: GameViewState): boolean {
    return state.hoveredCell !== null && isSamePosition(state.hoveredCell, cell);
}

function getActiveAttack(state: GameViewState): { attackerId: string; attackIndex: number } | null {
    const { actionMode } = state;
    if (actionMode.type !== "attack" || !actionMode.attackerId || actionMode.attackIndex === null) {
        return null;
    }
    return { attackerId: actionMode.attackerId, attackIndex: actionMode.attackIndex };
}

function getPlacementPreviewCells(state: GameViewState): Position[] {
    if (state.pendingCells) return state.pendingCells;
    if ((state.onlineGame && !state.isLocalTurn) || !state.selectedMonster || !state.hasRolled) {
        return [];
    }

    const previewOrigin = state.lockedPreviewCell ?? state.hoveredCell;
    return previewOrigin
        ? getPatternCells(
              PLACEMENT_PATTERNS[state.selectedPattern],
              previewOrigin,
              state.patternRotation,
              state.patternMirrored,
          )
        : [];
}

export function createCellRenderContext(
    state: GameViewState,
    actions: BoardActions,
): CellRenderContext {
    const attack = getActiveAttack(state);
    const { hoveredCell, actionMode } = state;
    return {
        state,
        actions,
        previewCells: getPlacementPreviewCells(state),
        attackRange: attack ? actions.getAttackRange(attack.attackerId, attack.attackIndex) : [],
        attackCandidates: attack
            ? actions.getAttackCandidates(attack.attackerId, attack.attackIndex)
            : [],
        attackPreview:
            attack &&
            hoveredCell &&
            actions.canAttack(attack.attackerId, attack.attackIndex, hoveredCell)
                ? actions.getAttackPreview(attack.attackerId, attack.attackIndex, hoveredCell)
                : [],
        movementCandidates:
            actionMode.type === "movement" && actionMode.monsterId
                ? actions.getMovementCandidates(actionMode.monsterId)
                : [],
    };
}

function getBaseCellColor(cell: Position, state: GameViewState): number {
    for (const player of [1, 2] as const) {
        if (isSamePosition(state.startingPositions[player], cell)) return OWNER_COLORS[player];
    }

    const owner = state.placedMonsters.find((monster) =>
        monster.cells.some((occupied) => isSamePosition(occupied, cell)),
    )?.owner;
    if (owner !== undefined) return OWNER_COLORS[owner];

    return (cell.x + cell.y) % 2 === 0 ? 0x667b61 : 0x71866a;
}

function getAttackCellStyle(cell: Position, context: CellRenderContext): CellStyle | null {
    if (hasCell(context.attackPreview, cell)) return { color: ACTION_HOVER_COLOR, fillAlpha: 1 };
    if (hasCell(context.attackRange, cell)) return { color: VALID_ACTION_COLOR, fillAlpha: 1 };
    if (hasCell(context.attackCandidates, cell)) {
        return { color: INVALID_MOVE_COLOR, fillAlpha: 0.8 };
    }
    return null;
}

function getMovementCellStyle(cell: Position, context: CellRenderContext): CellStyle | null {
    const { state, actions, movementCandidates } = context;
    if (state.actionMode.type !== "movement" || !state.actionMode.monsterId) return null;
    if (!hasCell(movementCandidates, cell)) return null;

    const canMove = actions.canMove(state.actionMode.monsterId, cell);
    if (!canMove) return { color: INVALID_MOVE_COLOR, fillAlpha: 0.8 };
    return {
        color: isHoveredCell(cell, state) ? ACTION_HOVER_COLOR : VALID_ACTION_COLOR,
        fillAlpha: 1,
    };
}

function getPlacementCellStyle(cell: Position, context: CellRenderContext): CellStyle {
    const { state, previewCells, actions } = context;
    const isPendingCell = hasCell(state.pendingCells, cell);
    if (isPendingCell && isHoveredCell(cell, state)) {
        return { color: VALID_ACTION_COLOR, fillAlpha: 1 };
    }
    if (isPendingCell) return { color: PENDING_COLORS[state.currentPlayer], fillAlpha: 1 };

    const previewOrigin = state.lockedPreviewCell ?? state.hoveredCell;
    if (previewOrigin && hasCell(previewCells, cell)) {
        const isValid = actions.canPlace(previewOrigin);
        const colors = PREVIEW_COLORS[state.currentPlayer];
        return { color: isValid ? colors.valid : colors.invalid, fillAlpha: isValid ? 1 : 0.7 };
    }

    return { color: getBaseCellColor(cell, state), fillAlpha: 1 };
}

export function getCellStyle(cell: Position, context: CellRenderContext): CellStyle {
    return (
        getAttackCellStyle(cell, context) ??
        getMovementCellStyle(cell, context) ??
        getPlacementCellStyle(cell, context)
    );
}
