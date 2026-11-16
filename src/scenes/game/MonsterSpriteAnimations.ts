import Phaser from "phaser";

import {
    MONSTER_SPRITES,
    type MonsterSpriteAction,
    type MonsterSpriteAnimation,
    type MonsterSpriteFacing,
} from "../../data/monsterSprites";
import type { Facing } from "../../types/GameTypes";

function textureKey(
    monsterId: string,
    action: MonsterSpriteAction,
    facing: Facing | MonsterSpriteFacing,
): string {
    return `monster-${monsterId}-${action}-${facing}`;
}

function spriteSheetTextureKey(monsterId: string, action: MonsterSpriteAction): string {
    return `monster-${monsterId}-${action}-sheet`;
}

export function getMonsterSpriteFrameTextureKey(
    monsterId: string,
    action: MonsterSpriteAction,
    facing: Facing | MonsterSpriteFacing,
    animation?: MonsterSpriteAnimation,
): string {
    if (!animation || !("spriteSheet" in animation)) return textureKey(monsterId, action, facing);
    return spriteSheetTextureKey(monsterId, action);
}

export function preloadMonsterSprites(
    scene: Phaser.Scene,
    monsterIds: readonly string[],
    actions: readonly MonsterSpriteAction[],
): number {
    let queuedFiles = 0;
    const queueSpriteSheet = (
        key: string,
        file: string,
        frameWidth: number,
        frameHeight: number,
    ): void => {
        if (scene.textures.exists(key)) return;
        scene.load.spritesheet(key, file, { frameWidth, frameHeight });
        queuedFiles++;
    };

    for (const monsterId of new Set(monsterIds)) {
        const definition = MONSTER_SPRITES[monsterId];
        if (!definition) continue;

        for (const action of actions) {
            const animation = definition.animations[action];
            if (!animation) continue;
            if ("spriteSheet" in animation) {
                queueSpriteSheet(
                    spriteSheetTextureKey(monsterId, action),
                    animation.spriteSheet,
                    definition.frameWidth,
                    definition.frameHeight,
                );
                continue;
            }

            for (const [facing, file] of Object.entries(animation.files) as [Facing, string][]) {
                queueSpriteSheet(
                    textureKey(monsterId, action, facing),
                    file,
                    definition.frameWidth,
                    definition.frameHeight,
                );
            }
        }
    }
    return queuedFiles;
}

export function createMonsterSpriteAnimations(
    scene: Phaser.Scene,
    monsterIds: readonly string[],
    actions: readonly MonsterSpriteAction[],
): void {
    for (const monsterId of new Set(monsterIds)) {
        const definition = MONSTER_SPRITES[monsterId];
        if (!definition) continue;

        for (const action of actions) {
            const animation = definition.animations[action];
            if (!animation) continue;
            const facings =
                "files" in animation
                    ? (Object.keys(animation.files) as (Facing | MonsterSpriteFacing)[])
                    : (Object.keys(animation.rows) as MonsterSpriteFacing[]);
            for (const facing of facings) {
                const key = textureKey(monsterId, action, facing);
                if (scene.anims.exists(key)) continue;
                const framesTextureKey =
                    "spriteSheet" in animation
                        ? getMonsterSpriteFrameTextureKey(monsterId, action, facing, animation)
                        : key;
                if (!scene.textures.exists(framesTextureKey)) continue;
                const totalFrames = scene.textures.get(framesTextureKey).frameTotal - 1;
                const start =
                    "spriteSheet" in animation
                        ? animation.rows[facing as MonsterSpriteFacing] *
                              animation.framesPerRow +
                          (animation.frameRange?.[0] ?? 0)
                        : 0;
                const end =
                    "spriteSheet" in animation
                        ? start +
                          (animation.frameRange
                              ? animation.frameRange[1] - animation.frameRange[0]
                              : animation.framesPerRow - 1)
                        : totalFrames - 1;
                if (totalFrames <= end) {
                    throw new Error(`Sprite sheet "${key}" does not contain animation frames.`);
                }

                scene.anims.create({
                    key,
                    frames: scene.anims.generateFrameNumbers(framesTextureKey, {
                        start,
                        end,
                    }),
                    frameRate: animation.frameRate,
                    repeat:
                        action === "attack" ||
                        action === "alternativeAttack1" ||
                        action === "backstab" ||
                        action === "hit" ||
                        action === "death"
                            ? 0
                            : -1,
                });
            }
        }
    }
}

export function getMonsterSpriteTextureKey(
    monsterId: string,
    action: MonsterSpriteAction,
    facing: Facing | MonsterSpriteFacing,
): string {
    return textureKey(monsterId, action, facing);
}

