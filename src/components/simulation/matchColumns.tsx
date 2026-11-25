import { getMonsterSymbol } from "../../game/monsterSymbols";
import type { MatchMonsterAnalysis } from "../../simulation/analysis";
import type { SimulationEvent } from "../../simulation/types";
import { attackUsageColumn, attacksColumn, nameColumn, totalDamageColumn } from "./monsterColumns";
import type { SortableColumn } from "./SortableTable";

export interface MatchHistoryEntry {
    readonly event: SimulationEvent;
    readonly index: number;
}

export const HISTORY_COLUMNS: SortableColumn<MatchHistoryEntry>[] = [
    { key: "turn", label: "Tour", getValue: ({ event }) => event.turn },
    { key: "player", label: "Joueur", getValue: ({ event }) => event.player },
    { key: "type", label: "Type", getValue: ({ event }) => event.type },
    { key: "description", label: "Action / stratégie", getValue: ({ event }) => event.description },
];

function formatPosition({ position }: MatchMonsterAnalysis): string {
    return `${position.x}, ${position.y}`;
}

export function getMatchMonsterColumns(
    monsterSymbols: ReadonlyMap<string, string>,
    hasDetailedHistory: boolean,
): SortableColumn<MatchMonsterAnalysis>[] {
    const columns: SortableColumn<MatchMonsterAnalysis>[] = [
        {
            key: "symbol",
            label: "Symbole",
            getValue: (monster) =>
                monster.symbol ?? getMonsterSymbol(monsterSymbols, monster.monsterId),
        },
        nameColumn(),
        {
            key: "owner",
            label: "Joueur",
            getValue: (monster) => monster.owner,
            render: (monster) => (
                <span
                    className={`simulation-player-label simulation-player-label--${monster.owner}`}
                >
                    J{monster.owner}
                </span>
            ),
        },
        {
            key: "hp",
            label: "PV",
            getValue: (monster) => monster.hp,
            render: (monster) =>
                monster.hp <= 0 ? (
                    "Mort"
                ) : (
                    <>
                        {monster.hp < monster.maxHp ? (
                            <span className="simulation-damaged-hp">{monster.hp}</span>
                        ) : (
                            monster.hp
                        )}
                        /{monster.maxHp}
                    </>
                ),
        },
        {
            key: "position",
            label: "Position",
            getValue: formatPosition,
            render: formatPosition,
        },
    ];
    return hasDetailedHistory
        ? [...columns, attacksColumn(), totalDamageColumn("Dégâts infligés"), attackUsageColumn()]
        : columns;
}
