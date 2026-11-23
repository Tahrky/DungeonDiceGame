import Phaser from "phaser";

import { MONSTER_SPRITES } from "../../data/monsterSprites";
import { getMonsterSpriteFrameTextureKey } from "./MonsterSpriteAnimations";

import type { PlacedMonster, Position } from "../../types/GameTypes";

export function createMonsterSprite(
    scene: Phaser.Scene,
    monster: PlacedMonster,
    position: Position,
): Phaser.GameObjects.Sprite {
    const definition = MONSTER_SPRITES[monster.monster.id];
    const idleAnimation = definition.animations.idle;
    const idleTexture = getMonsterSpriteFrameTextureKey(
        monster.monster.id,
        "idle",
        monster.facing,
        idleAnimation,
    );
    const hasIdleTexture = scene.textures.exists(idleTexture);
    const texture = hasIdleTexture ? idleTexture : getFallbackTexture(scene, monster.monster);

    return scene.add
        .sprite(position.x, position.y, texture)
        .setOrigin(
            hasIdleTexture ? definition.originX : 0.5,
            hasIdleTexture ? definition.originY : 0.5,
        )
        .setScale(hasIdleTexture ? definition.scale : 1);
}

function getFallbackTexture(scene: Phaser.Scene, monster: PlacedMonster["monster"]): string {
    const key = `monster-fallback-${monster.id}`;
    if (scene.textures.exists(key)) return key;

    const graphics = scene.add.graphics();
    graphics.fillStyle(monster.color);
    graphics.fillCircle(16, 16, 15);
    graphics.generateTexture(key, 32, 32);
    graphics.destroy();
    return key;
}
