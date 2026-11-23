import type { PlayerId } from "../../types/GameTypes";

export const MONSTER_SPRITE_STYLE = {
    playerColors: {
        1: 0xff6470,
        2: 0x70bdff,
    } satisfies Record<PlayerId, number>,
    deadSpriteOpacity: 0.4,
    deadSpriteDesaturation: 0.85,
    deadOutlineOpacity: 0.75,
    deadOutlineThickness: 1.5,
} as const;
