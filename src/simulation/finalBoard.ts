import { getStartingPositions, type BoardDefinition } from "../game/boards";
import { positionKey } from "../game/geometry";
import { getMonsterSymbol } from "../game/monsterSymbols";
import type { PlacedMonster, PlayerId } from "../types/GameTypes";
import type { MatchState } from "./matchState";
import type { FinalBoard } from "./types";

const TERRITORY_SYMBOLS: Record<PlayerId, string> = { 1: "a", 2: "b" };

export function buildMatchBoard(
    board: BoardDefinition,
    state: MatchState,
    monsterSymbols: ReadonlyMap<string, string>,
    monsterDefinitions: readonly { id: string; name: string }[],
): FinalBoard {
    const starts = getStartingPositions(board);
    const livingMonstersByPosition = new Map<string, PlacedMonster>();
    const territoryOwnerByCell = new Map<string, PlayerId>();
    for (const monster of state.monsters) {
        for (const cell of monster.cells) {
            const key = positionKey(cell);
            if (!territoryOwnerByCell.has(key)) territoryOwnerByCell.set(key, monster.owner);
        }
        if (monster.currentHp > 0) {
            const key = positionKey(monster.position);
            if (!livingMonstersByPosition.has(key)) livingMonstersByPosition.set(key, monster);
        }
    }
    const blockedCells = new Set(board.blockedCells.map(positionKey));
    const rows = Array.from({ length: board.height }, (_, y) =>
        Array.from({ length: board.width }, (_, x) => {
            const key = positionKey({ x, y });
            const placed = livingMonstersByPosition.get(key);
            if (placed) return getMonsterSymbol(monsterSymbols, placed.monster.id);
            if (blockedCells.has(key)) return "#";
            if (starts[1].x === x && starts[1].y === y) return "1";
            if (starts[2].x === x && starts[2].y === y) return "2";
            const territoryOwner = territoryOwnerByCell.get(key);
            return territoryOwner ? TERRITORY_SYMBOLS[territoryOwner] : ".";
        }).join(""),
    );
    return {
        width: board.width,
        height: board.height,
        rows,
        legend: [
            { symbol: ".", meaning: "Case libre" },
            { symbol: "#", meaning: "Case bloquée" },
            { symbol: "1", meaning: "Départ joueur 1" },
            { symbol: "2", meaning: "Départ joueur 2" },
            { symbol: "a", meaning: "Territoire déployé joueur 1" },
            { symbol: "b", meaning: "Territoire déployé joueur 2" },
            ...monsterDefinitions.map((monster) => ({
                symbol: getMonsterSymbol(monsterSymbols, monster.id),
                meaning: monster.name,
            })),
        ],
    };
}
