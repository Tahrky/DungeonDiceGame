import type { CSSProperties } from "react";

import { MONSTER_SPRITES } from "../../data/monsterSprites";
import type { Monster } from "../../types/GameTypes";
import { MonsterSymbol } from "./MonsterSymbol";

const FRAME_SIZE = 216;
const SPRITE_CROP_LEFT = 38;
const SPRITE_CROP_TOP = 43;
const SPRITE_CROP_HEIGHT = 56;

export function MonsterIdlePreview({ monster }: { readonly monster: Monster }) {
    const spriteDefinition = MONSTER_SPRITES[monster.id];
    const idleAnimation = spriteDefinition?.animations.idle;
    if (!idleAnimation || !("spriteSheet" in idleAnimation)) {
        return <MonsterSymbol monster={monster} />;
    }

    const { frameWidth, frameHeight } = spriteDefinition;
    const frameCount = idleAnimation.framesPerRow;
    const style: CSSProperties & {
        "--monster-sprite-south-x": string;
        "--monster-sprite-south-y": string;
        "--monster-sprite-last-frame-x": string;
    } = {
        backgroundImage: `url("${idleAnimation.spriteSheet}")`,
        backgroundSize: `${FRAME_SIZE * frameCount}px ${FRAME_SIZE * Object.keys(idleAnimation.rows).length}px`,
        animation: `monster-idle-south ${frameCount / idleAnimation.frameRate}s steps(${frameCount - 1}) infinite`,
        width: `${(FRAME_SIZE * (frameWidth - SPRITE_CROP_LEFT)) / frameWidth}px`,
        height: `${(FRAME_SIZE * SPRITE_CROP_HEIGHT) / frameHeight}px`,
        "--monster-sprite-south-x": `${-(FRAME_SIZE * SPRITE_CROP_LEFT) / frameWidth}px`,
        "--monster-sprite-south-y": `${-FRAME_SIZE * (2 + SPRITE_CROP_TOP / frameHeight)}px`,
        "--monster-sprite-last-frame-x": `${-FRAME_SIZE * (frameCount - 1 + SPRITE_CROP_LEFT / frameWidth)}px`,
    };

    return (
        <span
            className="monster-info-sprite"
            role="img"
            aria-label={`${monster.name} au repos`}
            style={style}
        />
    );
}
