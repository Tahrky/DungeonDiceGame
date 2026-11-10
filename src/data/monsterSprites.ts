import type { Facing } from "../types/GameTypes";

export type MonsterSpriteAction = "idle" | "move" | "attack" | "hit" | "death";

export interface MonsterSpriteAnimation {
    readonly frames: number;
    readonly frameRate: number;
    readonly files: Readonly<Record<Facing, string>>;
}

export interface MonsterSpriteDefinition {
    readonly frameWidth: number;
    readonly frameHeight: number;
    readonly scale: number;
    readonly previewScale?: number;
    readonly originX: number;
    readonly originY: number;
    readonly animations: Readonly<Partial<Record<MonsterSpriteAction, MonsterSpriteAnimation>>>;
}

// Add a monster entry here and place each oriented spritesheet anywhere under public/.
// Replace only the matching filename to customize one action or direction.
const SLIME_ASSET_ROOT = "/sprites/slime";

function directionalFiles(folder: string, prefix: string): Record<Facing, string> {
    return {
        north: `${SLIME_ASSET_ROOT}/${folder}/${prefix}_Body_000.png`,
        east: `${SLIME_ASSET_ROOT}/${folder}/${prefix}_Body_090.png`,
        south: `${SLIME_ASSET_ROOT}/${folder}/${prefix}_Body_180.png`,
        west: `${SLIME_ASSET_ROOT}/${folder}/${prefix}_Body_270.png`,
    };
}

export const MONSTER_SPRITES: Readonly<Record<string, MonsterSpriteDefinition>> = {
    slime: {
        frameWidth: 180,
        frameHeight: 180,
        scale: 0.4,
        previewScale: 0.95,
        originX: 0.5,
        originY: 0.605,
        animations: {
            idle: { frames: 20, frameRate: 8, files: directionalFiles("Idle", "Idle") },
            move: {
                frames: 20,
                frameRate: 8,
                files: directionalFiles("Walk", "Walk_Forward"),
            },
            attack: {
                frames: 30,
                frameRate: 15,
                files: directionalFiles("Attack_01", "Attack_01"),
            },
            hit: { frames: 16, frameRate: 12, files: directionalFiles("Hit", "Hit") },
            death: { frames: 30, frameRate: 12, files: directionalFiles("Death", "Death") },
        },
    },
};
