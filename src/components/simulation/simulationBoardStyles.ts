import type { CSSProperties } from "react";
import { GAME_CONFIG } from "../../data/configuration";
import { GRID_FACING_TO_SPRITE_FACING, MONSTER_SPRITES } from "../../data/monsterSprites";
import type { Facing, PlayerId } from "../../types/GameTypes";
import { toCssColor } from "../../utils/color";

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

export function getMonsterSpriteStyle(
    monsterId: string,
    owner: PlayerId,
    color: number | undefined,
    zIndex: number,
): CSSProperties {
    const spriteStyle = getSpriteStyle(monsterId, owner);
    return {
        ...spriteStyle,
        zIndex,
        ...(spriteStyle.backgroundImage
            ? {}
            : {
                  backgroundColor: color === undefined ? undefined : toCssColor(color),
                  borderRadius: "50%",
              }),
    };
}

export function getTileClass(marker: string, x: number, y: number): string {
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

export function getCellLabel(marker: string, x: number, y: number): string {
    if (marker === "1" || marker === "2") return `Base J${marker}, case ${x}, ${y}`;
    if (marker === "#") return `Case bloquée, ${x}, ${y}`;
    if (marker === "a" || marker === "b") {
        return `Territoire joueur ${marker === "a" ? "1" : "2"}, case ${x}, ${y}`;
    }
    return `Case libre, ${x}, ${y}`;
}
