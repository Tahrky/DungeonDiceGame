import type Phaser from "phaser";

import type { MonsterSpriteAction } from "../../data/monsterSprites";
import type {
    Facing,
    Monster,
    PlacedMonster,
    PlayerId,
    Position,
    StatusEffectColor,
} from "../../types/GameTypes";

export interface MonsterSpriteState {
    readonly sprite: Phaser.GameObjects.Sprite;
    readonly ownerGlow: Phaser.FX.Glow;
    readonly monster: Monster;
    readonly owner: PlayerId;
    grayscaleEffect: Phaser.FX.ColorMatrix | null;
    deadEffect: Phaser.FX.ColorMatrix | null;
    deadOutline: Phaser.FX.Glow | null;
    statusTintEffect: Phaser.FX.ColorMatrix | null;
    statusColor: StatusEffectColor | null;
    position: Position;
    facing: Facing;
    action: MonsterSpriteAction;
    isMoving: boolean;
    isGrayscale: boolean;
    shouldBeGrayscale: boolean;
    shouldBeCamouflaged: boolean;
    isDead: boolean;
}

export function createMonsterSpriteState(
    sprite: Phaser.GameObjects.Sprite,
    ownerGlow: Phaser.FX.Glow,
    placed: PlacedMonster,
): MonsterSpriteState {
    return {
        sprite,
        ownerGlow,
        monster: placed.monster,
        owner: placed.owner,
        grayscaleEffect: null,
        deadEffect: null,
        deadOutline: null,
        statusTintEffect: null,
        statusColor: null,
        position: { ...placed.position },
        facing: placed.facing,
        action: "idle",
        isMoving: false,
        isGrayscale: false,
        shouldBeGrayscale: false,
        shouldBeCamouflaged: false,
        isDead: false,
    };
}
