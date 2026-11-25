import Phaser from "phaser";

import {
    GRID_FACING_TO_SPRITE_FACING,
    MONSTER_SPRITES,
    type MonsterSpriteAction,
    type MonsterSpriteAnimation,
    type MonsterSpriteDefinition,
    type MonsterSpriteFacing,
} from "../../data/monsterSprites";
import type { Facing, MonsterAttackAnimation } from "../../types/GameTypes";

type SpriteFacing = Facing | MonsterSpriteFacing;

const ONE_SHOT_ACTIONS: ReadonlySet<MonsterSpriteAction> = new Set([
    "attack",
    "alternativeAttack1",
    "alternativeAttack2",
    "backstab",
    "hit",
    "death",
]);

export function getMonsterSpriteTextureKey(
    monsterId: string,
    action: MonsterSpriteAction,
    facing: SpriteFacing,
): string {
    return `monster-${monsterId}-${action}-${facing}`;
}

export function getMonsterSpriteFrameTextureKey(
    monsterId: string,
    action: MonsterSpriteAction,
    facing: SpriteFacing,
    animation?: MonsterSpriteAnimation,
): string {
    return animation && "spriteSheet" in animation
        ? `monster-${monsterId}-${action}-sheet`
        : getMonsterSpriteTextureKey(monsterId, action, facing);
}

function* listMonsterAnimations(
    monsterIds: readonly string[],
    actions: readonly MonsterSpriteAction[],
): Generator<{
    monsterId: string;
    action: MonsterSpriteAction;
    definition: MonsterSpriteDefinition;
    animation: MonsterSpriteAnimation;
}> {
    for (const monsterId of new Set(monsterIds)) {
        const definition = MONSTER_SPRITES[monsterId];
        if (!definition) continue;
        for (const action of actions) {
            const animation = definition.animations[action];
            if (animation) yield { monsterId, action, definition, animation };
        }
    }
}

export function preloadMonsterSprites(
    scene: Phaser.Scene,
    monsterIds: readonly string[],
    actions: readonly MonsterSpriteAction[],
): number {
    let queuedFiles = 0;
    for (const { monsterId, action, definition, animation } of listMonsterAnimations(
        monsterIds,
        actions,
    )) {
        // A sprite sheet holds every facing in a single texture, so it is queued once.
        const filesByFacing: Partial<Record<SpriteFacing, string>> =
            "spriteSheet" in animation ? { east: animation.spriteSheet } : animation.files;
        for (const [facing, file] of Object.entries(filesByFacing) as [SpriteFacing, string][]) {
            const key = getMonsterSpriteFrameTextureKey(monsterId, action, facing, animation);
            if (scene.textures.exists(key)) continue;
            scene.load.spritesheet(key, file, {
                frameWidth: definition.frameWidth,
                frameHeight: definition.frameHeight,
            });
            queuedFiles++;
        }
    }
    return queuedFiles;
}

function getFrameRange(
    animation: MonsterSpriteAnimation,
    facing: SpriteFacing,
    frameCount: number,
): { start: number; end: number } {
    if (!("spriteSheet" in animation)) return { start: 0, end: frameCount - 1 };
    const start = animation.rows[facing as MonsterSpriteFacing] * animation.framesPerRow;
    return { start, end: start + animation.framesPerRow - 1 };
}

export function createMonsterSpriteAnimations(
    scene: Phaser.Scene,
    monsterIds: readonly string[],
    actions: readonly MonsterSpriteAction[],
): void {
    for (const { monsterId, action, animation } of listMonsterAnimations(monsterIds, actions)) {
        const facings = Object.keys(
            "spriteSheet" in animation ? animation.rows : animation.files,
        ) as SpriteFacing[];
        for (const facing of facings) {
            const key = getMonsterSpriteTextureKey(monsterId, action, facing);
            if (scene.anims.exists(key)) continue;
            const textureKey = getMonsterSpriteFrameTextureKey(
                monsterId,
                action,
                facing,
                animation,
            );
            if (!scene.textures.exists(textureKey)) continue;
            const frameCount = scene.textures.get(textureKey).frameTotal - 1;
            const { start, end } = getFrameRange(animation, facing, frameCount);
            if (frameCount <= end) {
                throw new Error(`Sprite sheet "${key}" does not contain animation frames.`);
            }

            scene.anims.create({
                key,
                frames: scene.anims.generateFrameNumbers(textureKey, { start, end }),
                frameRate: animation.frameRate,
                repeat: ONE_SHOT_ACTIONS.has(action) ? 0 : -1,
            });
        }
    }
}

export function getFacingOffsetY(monsterId: string, facing: Facing): number {
    return MONSTER_SPRITES[monsterId]?.facingOffsetY?.[facing] ?? 0;
}

export function getAnimationFacing(
    animation: MonsterSpriteAnimation,
    facing: Facing,
): Facing | MonsterSpriteFacing {
    if (!("files" in animation)) return GRID_FACING_TO_SPRITE_FACING[facing];
    return animation.files[facing] ? facing : "south";
}

export function resolveAttackAction(
    monsterId: string,
    animation: MonsterAttackAnimation,
    backstab: boolean,
): MonsterSpriteAction | null {
    const animations = MONSTER_SPRITES[monsterId]?.animations;
    if (!animations) return null;

    let action: MonsterSpriteAction = "attack";
    if (backstab && animations.backstab) {
        action = "backstab";
    } else if (animation !== "backstab" && animations[animation]) {
        action = animation;
    }
    return animations[action] ? action : null;
}
