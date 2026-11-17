import type { CSSProperties } from "react";
import { GAME_CONFIG } from "../../config";
import { GRID_FACING_TO_SPRITE_FACING, MONSTER_SPRITES } from "../../data/monsterSprites";
import { getMonsterSymbol, getUniqueMonsterSymbols } from "../../game/monsterSymbols";
import type { GameConfiguration } from "../../game/gameConfiguration";
import type { AnalyzableMatch } from "../../simulation/analysis";
import type { Facing, PlayerId } from "../../types/GameTypes";

interface SimulationBoardProps {
    readonly match: AnalyzableMatch;
    readonly configuration: GameConfiguration;
}

function getSpriteStyle(monsterId: string, owner: PlayerId): CSSProperties {
    const definition = MONSTER_SPRITES[monsterId];
    const idle = definition?.animations.idle;
    const glow = owner === 1 ? "drop-shadow(0 0 5px #ff6470)" : "drop-shadow(0 0 5px #70bdff)";
    if (!definition || !idle) {
        return {
            width: 32,
            height: 32,
            left: (GAME_CONFIG.tileWidth - 32) / 2,
            top: (GAME_CONFIG.tileHeight - 32) / 2,
            filter: glow,
        };
    }

    const facing: Facing = owner === 1 ? "east" : "west";
    const scale = definition.scale;
    const frameWidth = definition.frameWidth * scale;
    const frameHeight = definition.frameHeight * scale;
    const position: CSSProperties = {
        width: frameWidth,
        height: frameHeight,
        left: GAME_CONFIG.tileWidth / 2 - frameWidth * definition.originX,
        top:
            GAME_CONFIG.tileHeight / 2 -
            3 +
            (definition.facingOffsetY?.[facing] ?? 0) -
            frameHeight * definition.originY,
    };
    if ("spriteSheet" in idle) {
        const rowCount = Object.keys(idle.rows).length;
        const row = idle.rows[GRID_FACING_TO_SPRITE_FACING[facing]];
        return {
            ...position,
            backgroundImage: `url("${idle.spriteSheet}")`,
            backgroundSize: `${idle.framesPerRow * 100}% ${rowCount * 100}%`,
            backgroundPosition: `0% ${rowCount > 1 ? (row / (rowCount - 1)) * 100 : 0}%`,
            filter: glow,
        };
    }

    return {
        ...position,
        backgroundImage: `url("${idle.files[facing]}")`,
        filter: glow,
    };
}

function getTileClass(marker: string, x: number, y: number): string {
    switch (marker) {
        case "#":
            return "simulation-board-tile--blocked";
        case "1":
        case "a":
            return "simulation-board-tile--player-one";
        case "2":
        case "b":
            return "simulation-board-tile--player-two";
        default:
            return (x + y) % 2 === 0
                ? "simulation-board-tile--ground-even"
                : "simulation-board-tile--ground-odd";
    }
}

function getCellLabel(marker: string, x: number, y: number): string {
    if (marker === "1" || marker === "2") return `Base J${marker}, case ${x}, ${y}`;
    if (marker === "#") return `Case bloquée, ${x}, ${y}`;
    if (marker === "a" || marker === "b") {
        return `Territoire joueur ${marker === "a" ? "1" : "2"}, case ${x}, ${y}`;
    }
    return `Case libre, ${x}, ${y}`;
}

export function SimulationBoard({ match, configuration }: SimulationBoardProps) {
    const monsterSymbols = getUniqueMonsterSymbols(configuration.monsters);
    const monstersByPosition = new Map(
        match.finalMonsters
            .filter((monster) => monster.hp > 0)
            .map((monster) => [`${monster.position.x},${monster.position.y}`, monster]),
    );
    const definitionsById = new Map(configuration.monsters.map((monster) => [monster.id, monster]));
    const boardWidth =
        ((match.finalBoard.width + match.finalBoard.height) * GAME_CONFIG.tileWidth) / 2;
    const boardHeight =
        ((match.finalBoard.width + match.finalBoard.height - 2) * GAME_CONFIG.tileHeight) / 2 +
        GAME_CONFIG.tileHeight;

    return (
        <div className="simulation-board-view">
            <div
                className="simulation-isometric-board"
                role="grid"
                aria-label={`Plateau final du match ${match.id}`}
                style={{ width: boardWidth, height: boardHeight }}
            >
                {match.finalBoard.rows.flatMap((row, y) =>
                    Array.from({ length: match.finalBoard.width }, (_, x) => {
                        const marker = row[x] ?? ".";
                        const monster = monstersByPosition.get(`${x},${y}`);
                        const tileMarker = monster ? (monster.owner === 1 ? "a" : "b") : marker;
                        const positionStyle: CSSProperties = {
                            left:
                                ((x - y + match.finalBoard.height - 1) * GAME_CONFIG.tileWidth) / 2,
                            top: ((x + y) * GAME_CONFIG.tileHeight) / 2,
                        };
                        const symbol = monster
                            ? getMonsterSymbol(monsterSymbols, monster.monsterId)
                            : "";
                        const monsterDefinition = monster
                            ? definitionsById.get(monster.monsterId)
                            : undefined;
                        const monsterColor = monsterDefinition
                            ? `#${monsterDefinition.color.toString(16).padStart(6, "0")}`
                            : undefined;
                        const spriteStyle = monster
                            ? getSpriteStyle(monster.monsterId, monster.owner)
                            : {};

                        return (
                            <div
                                key={`${x}-${y}`}
                                className="simulation-board-cell"
                                role="gridcell"
                                aria-label={
                                    monster
                                        ? `J${monster.owner}, ${monster.name}, symbole ${symbol}, case ${x}, ${y}`
                                        : getCellLabel(marker, x, y)
                                }
                                title={
                                    monster
                                        ? `J${monster.owner} · ${monster.name} (${symbol})`
                                        : undefined
                                }
                                style={positionStyle}
                            >
                                <span
                                    className={`simulation-board-tile ${getTileClass(tileMarker, x, y)}`}
                                    aria-hidden="true"
                                    style={{ zIndex: 1 }}
                                />
                                {monster ? (
                                    <span
                                        className="simulation-board-sprite"
                                        aria-hidden="true"
                                        style={{
                                            ...spriteStyle,
                                            zIndex: x + y + 2,
                                            ...(spriteStyle.backgroundImage
                                                ? {}
                                                : {
                                                      backgroundColor: monsterColor,
                                                      borderRadius: "50%",
                                                  }),
                                        }}
                                    />
                                ) : marker === "1" || marker === "2" ? (
                                    <span
                                        className={`simulation-board-base simulation-board-base--player-${marker}`}
                                        aria-hidden="true"
                                        style={{ zIndex: x + y + 2 }}
                                    />
                                ) : null}
                            </div>
                        );
                    }),
                )}
            </div>
            <ul className="simulation-board-legend" aria-label="Légende du plateau">
                <li>
                    <code>.</code> Case libre
                </li>
                <li>
                    <code>#</code> Case bloquée
                </li>
                <li>
                    <code>1</code> Base joueur 1
                </li>
                <li>
                    <code>2</code> Base joueur 2
                </li>
                <li>
                    <code>a</code> Territoire joueur 1
                </li>
                <li>
                    <code>b</code> Territoire joueur 2
                </li>
                <li>
                    <code className="simulation-board-owner-1">J1</code> Monstres joueur 1
                </li>
                <li>
                    <code className="simulation-board-owner-2">J2</code> Monstres joueur 2
                </li>
                {configuration.monsters.map((monster) => (
                    <li key={monster.id}>
                        <code>{getMonsterSymbol(monsterSymbols, monster.id)}</code> {monster.name}
                    </li>
                ))}
            </ul>
        </div>
    );
}
