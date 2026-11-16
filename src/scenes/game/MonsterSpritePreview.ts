import Phaser from "phaser";

import {
    GRID_FACING_TO_SPRITE_FACING,
    MONSTER_SPRITES,
    type MonsterSpriteFacing,
} from "../../data/monsterSprites";
import { getMonsterSpriteFrameTextureKey, getMonsterSpriteTextureKey } from "./MonsterSpriteAnimations";

import type { Facing, Monster } from "../../types/GameTypes";

export function createMonsterPreview(
    scene: Phaser.Scene,
    monster: Monster,
    facing: Facing,
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    spriteFacingOverride?: MonsterSpriteFacing,
): Phaser.GameObjects.GameObject {
    const definition = MONSTER_SPRITES[monster.id];
    if (definition?.animations.idle) {
        const animation = definition.animations.idle;
        const previewFacing =
            spriteFacingOverride ??
            ("rows" in animation ? GRID_FACING_TO_SPRITE_FACING[facing] : facing);
        const key = getMonsterSpriteTextureKey(monster.id, "idle", previewFacing);
        const previewTexture = getMonsterSpriteFrameTextureKey(
            monster.id,
            "idle",
            previewFacing,
            animation,
        );
        if (scene.textures.exists(previewTexture) && scene.anims.exists(key)) {
            const sprite = scene.add
                .sprite(x, y, previewTexture)
                .setOrigin(0.5)
                .setScale(definition.previewScale ?? 0.75);
            container.add(sprite);
            sprite.play(key);
            return sprite;
        }
    }

    const preview = scene.add.container(x, y);
    const token = scene.add.circle(0, 0, 18, monster.color);
    const symbol = scene.add
        .text(0, 0, monster.symbol, {
            fontFamily: "Arial",
            fontSize: "18px",
            color: "#ffffff",
            fontStyle: "bold",
        })
        .setOrigin(0.5);
    preview.add([token, symbol]);
    container.add(preview);
    scene.tweens.add({
        targets: preview,
        y: y - 3,
        duration: 650,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
    });
    return preview;
}
