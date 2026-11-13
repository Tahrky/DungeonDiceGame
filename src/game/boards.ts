import { GAME_CONFIG } from "../config";
import type { Position, PlayerId } from "../types/GameTypes";

export const MIN_BOARD_DIMENSION = 7;
export const MAX_BOARD_DIMENSION = 23;
export const DEFAULT_BOARD_PRESET_ID = "wide-arena";

export interface BoardDefinition {
    readonly id: string;
    readonly width: number;
    readonly height: number;
    readonly blockedCells: readonly Position[];
}

export type BoardSelection =
    | { readonly type: "random" }
    | { readonly type: "preset"; readonly presetId: string }
    | {
          readonly type: "custom";
          readonly width: number;
          readonly height: number;
          readonly blockedCells?: readonly Position[];
      };

function createCornerMask(width: number, height: number, cut: number): Position[] {
    const cells: Position[] = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const nearLeft = x < cut;
            const nearRight = x >= width - cut;
            const nearTop = y < cut;
            const nearBottom = y >= height - cut;
            if ((nearLeft || nearRight) && (nearTop || nearBottom)) {
                cells.push({ x, y });
            }
        }
    }
    return cells;
}

const BOARD_PRESETS: readonly BoardDefinition[] = [
    {
        id: DEFAULT_BOARD_PRESET_ID,
        width: GAME_CONFIG.boardWidth,
        height: GAME_CONFIG.boardHeight,
        blockedCells: [],
    },
    {
        id: "tall-arena",
        width: 15,
        height: 19,
        blockedCells: [],
    },
    {
        id: "square-arena",
        width: 17,
        height: 17,
        blockedCells: [],
    },
    {
        id: "bastion",
        width: 19,
        height: 15,
        blockedCells: createCornerMask(19, 15, 2),
    },
];

const MIN_PLAYABLE_CELLS = 14;

function cloneBoard(board: BoardDefinition): BoardDefinition {
    return {
        ...board,
        blockedCells: board.blockedCells.map((cell) => ({ ...cell })),
    };
}

export function getBoardPresets(): BoardDefinition[] {
    return BOARD_PRESETS.map(cloneBoard);
}

export function getDefaultBoard(): BoardDefinition {
    const board = BOARD_PRESETS.find(({ id }) => id === DEFAULT_BOARD_PRESET_ID);
    if (!board) throw new Error("Le plateau par défaut est introuvable.");
    return cloneBoard(board);
}

export function getTestBoard(): BoardDefinition {
    return createCustomBoard(11, 7);
}

export function getBoardPreset(presetId: string): BoardDefinition {
    const board = BOARD_PRESETS.find(({ id }) => id === presetId);
    if (!board) throw new Error(`Plateau prédéfini inconnu : ${presetId}`);
    return cloneBoard(board);
}

export function getRandomBoard(random: () => number = Math.random): BoardDefinition {
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
        throw new RangeError("Le générateur aléatoire doit retourner une valeur entre 0 et 1.");
    }
    return cloneBoard(BOARD_PRESETS[Math.floor(sample * BOARD_PRESETS.length)]);
}

export function createCustomBoard(
    width: number,
    height: number,
    blockedCells: readonly Position[] = [],
): BoardDefinition {
    const board = parseBoardDefinition({ id: "custom", width, height, blockedCells });
    if (!board) throw new RangeError("La définition personnalisée du plateau est invalide.");
    return board;
}

export function parseBoardDefinition(value: unknown): BoardDefinition | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    if (!("id" in value) || typeof value.id !== "string" || value.id.length === 0) return null;
    if (!("width" in value) || !isValidDimension(value.width)) return null;
    if (!("height" in value) || !isValidDimension(value.height)) return null;
    if (!("blockedCells" in value) || !Array.isArray(value.blockedCells)) return null;

    const blockedCells: Position[] = [];
    const keys = new Set<string>();
    for (const cell of value.blockedCells) {
        if (
            typeof cell !== "object" ||
            cell === null ||
            !("x" in cell) ||
            !("y" in cell) ||
            !Number.isInteger(cell.x) ||
            !Number.isInteger(cell.y) ||
            cell.x < 0 ||
            cell.y < 0 ||
            cell.x >= value.width ||
            cell.y >= value.height
        ) {
            return null;
        }
        const key = `${cell.x},${cell.y}`;
        if (keys.has(key)) return null;
        keys.add(key);
        blockedCells.push({ x: cell.x, y: cell.y });
    }

    const board = { id: value.id, width: value.width, height: value.height, blockedCells };
    return getStartingPositionsOrNull(board) ? board : null;
}

function isValidDimension(value: unknown): value is number {
    return (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= MIN_BOARD_DIMENSION &&
        value <= MAX_BOARD_DIMENSION
    );
}

function getStartingPositionsOrNull(
    board: BoardDefinition,
): Record<PlayerId, Position> | null {
    const blocked = new Set(board.blockedCells.map(({ x, y }) => `${x},${y}`));
    const openCells: Position[] = [];
    for (let y = 0; y < board.height; y++) {
        for (let x = 0; x < board.width; x++) {
            if (!blocked.has(`${x},${y}`)) openCells.push({ x, y });
        }
    }
    if (openCells.length < MIN_PLAYABLE_CELLS) return null;
    const visited = new Set([`${openCells[0].x},${openCells[0].y}`]);
    const pending = [openCells[0]];
    for (const cell of pending) {
        for (const neighbor of [
            { x: cell.x + 1, y: cell.y },
            { x: cell.x - 1, y: cell.y },
            { x: cell.x, y: cell.y + 1 },
            { x: cell.x, y: cell.y - 1 },
        ]) {
            const key = `${neighbor.x},${neighbor.y}`;
            if (
                neighbor.x >= 0 &&
                neighbor.y >= 0 &&
                neighbor.x < board.width &&
                neighbor.y < board.height &&
                !blocked.has(key) &&
                !visited.has(key)
            ) {
                visited.add(key);
                pending.push(neighbor);
            }
        }
    }
    if (visited.size !== openCells.length) return null;

    const centerY = Math.floor(board.height / 2);
    const leftToRight = [...openCells].sort(
        (first, second) =>
            first.x - second.x ||
            Math.abs(first.y - centerY) - Math.abs(second.y - centerY),
    );
    const rightToLeft = [...openCells].sort(
        (first, second) =>
            second.x - first.x ||
            Math.abs(first.y - centerY) - Math.abs(second.y - centerY),
    );
    const first = leftToRight[0];
    const second = rightToLeft[0];
    if (first.x === second.x && first.y === second.y) return null;
    return { 1: first, 2: second };
}

export function getStartingPositions(board: BoardDefinition): Record<PlayerId, Position> {
    const positions = getStartingPositionsOrNull(board);
    if (!positions) throw new Error("Le plateau doit contenir deux cases de départ distinctes.");
    return positions;
}

export function getBoardOrigin(board: BoardDefinition): Position {
    const centerX =
        GAME_CONFIG.boardOffsetX +
        ((GAME_CONFIG.boardWidth - GAME_CONFIG.boardHeight) * GAME_CONFIG.tileWidth) / 4;
    const centerY =
        GAME_CONFIG.boardOffsetY +
        ((GAME_CONFIG.boardWidth + GAME_CONFIG.boardHeight - 2) * GAME_CONFIG.tileHeight) / 4;
    return {
        x: centerX - ((board.width - board.height) * GAME_CONFIG.tileWidth) / 4,
        y:
            centerY -
            ((board.width + board.height - 2) * GAME_CONFIG.tileHeight) / 4,
    };
}

export function isBoardCell(board: BoardDefinition, position: Position): boolean {
    return (
        position.x >= 0 &&
        position.y >= 0 &&
        position.x < board.width &&
        position.y < board.height &&
        !board.blockedCells.some(
            (cell) => cell.x === position.x && cell.y === position.y,
        )
    );
}

export function resolveBoardSelection(selection: BoardSelection): BoardDefinition {
    switch (selection.type) {
        case "random":
            return getRandomBoard();
        case "preset":
            return getBoardPreset(selection.presetId);
        case "custom":
            return createCustomBoard(
                selection.width,
                selection.height,
                selection.blockedCells,
            );
    }
}
