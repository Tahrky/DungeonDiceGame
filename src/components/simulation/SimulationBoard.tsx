import type { CSSProperties } from "react";
import { GAME_CONFIG } from "../../data/configuration";
import { getMonsterSymbol, getUniqueMonsterSymbols } from "../../game/monsterSymbols";
import type { AnalyzableMatch, SimulationAnalysisConfiguration } from "../../simulation/analysis";
import type { PlayerId } from "../../types/GameTypes";
import { getCellLabel, getMonsterSpriteStyle, getTileClass } from "./simulationBoardStyles";

type FinalMonster = AnalyzableMatch["finalMonsters"][number];

interface SimulationBoardProps {
    readonly match: AnalyzableMatch;
    readonly configuration: SimulationAnalysisConfiguration;
}

interface BoardCellProps {
    readonly x: number;
    readonly y: number;
    readonly marker: string;
    readonly boardHeight: number;
    readonly monster: FinalMonster | undefined;
    readonly monsterSymbols: ReadonlyMap<string, string>;
    readonly monsterColors: ReadonlyMap<string, number>;
}

interface LegendItemProps {
    readonly code: string;
    readonly label: string;
    readonly className?: string;
}

const TERRITORY_MARKERS: Record<PlayerId, string> = { 1: "a", 2: "b" };

const LEGEND_ITEMS: readonly LegendItemProps[] = [
    { code: ".", label: "Case libre" },
    { code: "#", label: "Case bloquée" },
    { code: "1", label: "Base joueur 1" },
    { code: "2", label: "Base joueur 2" },
    { code: "a", label: "Territoire joueur 1" },
    { code: "b", label: "Territoire joueur 2" },
    { code: "J1", label: "Monstres joueur 1", className: "simulation-board-owner-1" },
    { code: "J2", label: "Monstres joueur 2", className: "simulation-board-owner-2" },
];

function LegendItem({ code, label, className }: LegendItemProps) {
    return (
        <li>
            <code className={className}>{code}</code> {label}
        </li>
    );
}

function BoardCell({
    x,
    y,
    marker,
    boardHeight,
    monster,
    monsterSymbols,
    monsterColors,
}: BoardCellProps) {
    const tileMarker = monster ? TERRITORY_MARKERS[monster.owner] : marker;
    const positionStyle: CSSProperties = {
        left: ((x - y + boardHeight - 1) * GAME_CONFIG.tileWidth) / 2,
        top: ((x + y) * GAME_CONFIG.tileHeight) / 2,
    };
    const symbol = monster ? getMonsterSymbol(monsterSymbols, monster.monsterId) : "";

    return (
        <div
            className="simulation-board-cell"
            role="gridcell"
            aria-label={
                monster
                    ? `J${monster.owner}, ${monster.name}, symbole ${symbol}, case ${x}, ${y}`
                    : getCellLabel(marker, x, y)
            }
            title={monster ? `J${monster.owner} · ${monster.name} (${symbol})` : undefined}
            style={positionStyle}
        >
            <span
                className={`simulation-board-tile ${getTileClass(tileMarker, x, y)}`}
                aria-hidden="true"
                style={{ zIndex: 1 }}
            />
            {monster && (
                <span
                    className="simulation-board-sprite"
                    aria-hidden="true"
                    style={getMonsterSpriteStyle(
                        monster.monsterId,
                        monster.owner,
                        monsterColors.get(monster.monsterId),
                        x + y + 2,
                    )}
                />
            )}
            {!monster && (marker === "1" || marker === "2") && (
                <span
                    className={`simulation-board-base simulation-board-base--player-${marker}`}
                    aria-hidden="true"
                    style={{ zIndex: x + y + 2 }}
                />
            )}
        </div>
    );
}

export function SimulationBoard({ match, configuration }: SimulationBoardProps) {
    const { finalBoard } = match;
    const monsterSymbols = getUniqueMonsterSymbols(configuration.monsters);
    const monsterColors = new Map(
        configuration.monsters.map((monster) => [monster.id, monster.color]),
    );
    const monstersByPosition = new Map(
        match.finalMonsters
            .filter((monster) => monster.hp > 0)
            .map((monster) => [`${monster.position.x},${monster.position.y}`, monster]),
    );
    const boardWidth = ((finalBoard.width + finalBoard.height) * GAME_CONFIG.tileWidth) / 2;
    const boardHeight =
        ((finalBoard.width + finalBoard.height - 2) * GAME_CONFIG.tileHeight) / 2 +
        GAME_CONFIG.tileHeight;

    return (
        <div className="simulation-board-view">
            <div
                className="simulation-isometric-board"
                role="grid"
                aria-label={`Plateau final du match ${match.id}`}
                style={{ width: boardWidth, height: boardHeight }}
            >
                {finalBoard.rows.flatMap((row, y) =>
                    Array.from({ length: finalBoard.width }, (_, x) => (
                        <BoardCell
                            key={`${x}-${y}`}
                            x={x}
                            y={y}
                            marker={row[x] ?? "."}
                            boardHeight={finalBoard.height}
                            monster={monstersByPosition.get(`${x},${y}`)}
                            monsterSymbols={monsterSymbols}
                            monsterColors={monsterColors}
                        />
                    )),
                )}
            </div>
            <ul className="simulation-board-legend" aria-label="Légende du plateau">
                {LEGEND_ITEMS.map((item) => (
                    <LegendItem key={item.code} {...item} />
                ))}
                {configuration.monsters.map((monster) => (
                    <LegendItem
                        key={monster.id}
                        code={getMonsterSymbol(monsterSymbols, monster.id)}
                        label={monster.name}
                    />
                ))}
            </ul>
        </div>
    );
}
