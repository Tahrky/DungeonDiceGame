import Phaser from "phaser";

import {
    GRID_FACING_TO_SPRITE_FACING,
    MONSTER_SPRITES,
    type MonsterSpriteAction,
    type MonsterSpriteAnimation,
    type MonsterSpriteFacing,
} from "../../data/monsterSprites";
import { getFacingFromMovement } from "../../game/monsterActions";

import type {
    Monster,
    Facing,
    PlacedMonster,
    PlayerId,
    Position,
} from "../../types/GameTypes";

interface MonsterSpriteState {
    readonly sprite: Phaser.GameObjects.Sprite;
    readonly monster: Monster;
    readonly owner: PlayerId;
    position: Position;
    facing: Facing;
    action: MonsterSpriteAction;
    isMoving: boolean;
    isGrayscale: boolean;
    shouldBeGrayscale: boolean;
    isDead: boolean;
}

function textureKey(
    monsterId: string,
    action: MonsterSpriteAction,
    facing: Facing | MonsterSpriteFacing,
    owner?: PlayerId,
): string {
    return `monster-${monsterId}-${action}-${facing}${owner ? `-player-${owner}` : ""}`;
}

function spriteSheetTextureKey(
    monsterId: string,
    action: MonsterSpriteAction,
    owner?: PlayerId,
): string {
    return `monster-${monsterId}-${action}-sheet${owner ? `-player-${owner}` : ""}`;
}

function frameTextureKey(
    monsterId: string,
    action: MonsterSpriteAction,
    facing: Facing | MonsterSpriteFacing,
    animation?: MonsterSpriteAnimation,
    owner?: PlayerId,
): string {
    return animation && "spriteSheet" in animation
        ? spriteSheetTextureKey(
              monsterId,
              action,
              owner && animation.playerSpriteSheets?.[owner] ? owner : undefined,
          )
        : textureKey(monsterId, action, facing, owner);
}

export class MonsterSpriteView {
    private readonly scene: Phaser.Scene;
    private readonly container: Phaser.GameObjects.Container;
    private readonly toScreen: (position: Position) => Position;
    private readonly sprites = new Map<string, MonsterSpriteState>();

    static preload(scene: Phaser.Scene): void {
        for (const [monsterId, definition] of Object.entries(MONSTER_SPRITES)) {
            for (const [action, animation] of Object.entries(definition.animations) as [
                MonsterSpriteAction,
                MonsterSpriteAnimation,
            ][]) {
                if ("spriteSheet" in animation) {
                    scene.load.spritesheet(
                        spriteSheetTextureKey(monsterId, action),
                        animation.spriteSheet,
                        {
                            frameWidth: definition.frameWidth,
                            frameHeight: definition.frameHeight,
                        },
                    );
                    for (const [owner, file] of Object.entries(
                        animation.playerSpriteSheets ?? {},
                    ) as [string, string][]) {
                        const playerId = Number(owner) as PlayerId;
                        scene.load.spritesheet(
                            spriteSheetTextureKey(monsterId, action, playerId),
                            file,
                            {
                                frameWidth: definition.frameWidth,
                                frameHeight: definition.frameHeight,
                            },
                        );
                    }
                    continue;
                }

                for (const [facing, file] of Object.entries(animation.files) as [
                    Facing,
                    string,
                ][]) {
                    scene.load.spritesheet(textureKey(monsterId, action, facing), file, {
                        frameWidth: definition.frameWidth,
                        frameHeight: definition.frameHeight,
                    });
                }
            }
        }
    }

    constructor(scene: Phaser.Scene, toScreen: (position: Position) => Position) {
        this.scene = scene;
        this.toScreen = toScreen;
        this.container = scene.add.container(0, 0).setDepth(1);
        this.createAnimations();
    }

    render(monsters: readonly PlacedMonster[], grayscaleMonsterIds: ReadonlySet<string>): void {
        const spriteMonsters = monsters.filter(
            (monster) =>
                MONSTER_SPRITES[monster.monster.id] &&
                (monster.currentHp > 0 || this.sprites.get(monster.id)?.isDead),
        );
        const activeIds = new Set(spriteMonsters.map((monster) => monster.id));

        for (const [id, state] of this.sprites) {
            if (!activeIds.has(id)) {
                state.sprite.destroy();
                this.sprites.delete(id);
            }
        }

        for (const monster of spriteMonsters) {
            const state = this.sprites.get(monster.id) ?? this.createSprite(monster);
            if (state.isDead) continue;
            state.shouldBeGrayscale = grayscaleMonsterIds.has(monster.id);
            this.updateGrayscale(state);
            const angleChanged = state.facing !== monster.facing;
            if (!state.isMoving) {
                state.facing = monster.facing;
                const spritePosition = this.getSpritePosition(
                    monster.position,
                    state.monster.id,
                    state.facing,
                );
                state.sprite.setPosition(spritePosition.x, spritePosition.y);
                state.position = { ...monster.position };
                state.sprite.setDepth(monster.position.x + monster.position.y + 1);
            }

            if (!state.isMoving && angleChanged && state.action === "idle") {
                this.play(state, state.action);
            } else if (!state.isMoving && state.action === "idle") {
                this.play(state, "idle");
            }
        }
    }

    createPreview(
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

            const key = textureKey(monster.id, "idle", previewFacing);
            const sprite = this.scene.add
                .sprite(x, y, frameTextureKey(monster.id, "idle", previewFacing, animation))
                .setOrigin(0.5)
                .setScale(definition.previewScale ?? 0.75);
            container.add(sprite);
            sprite.play(key);
            return sprite;
        }

        const preview = this.scene.add.container(x, y);
        const token = this.scene.add.circle(0, 0, 18, monster.color);
        const symbol = this.scene.add
            .text(0, 0, monster.symbol, {
                fontFamily: "Arial",
                fontSize: "18px",
                color: "#ffffff",
                fontStyle: "bold",
            })
            .setOrigin(0.5);
        preview.add([token, symbol]);
        container.add(preview);
        this.scene.tweens.add({
            targets: preview,
            y: y - 3,
            duration: 650,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
        });
        return preview;
    }

    isMoving(id: string): boolean {
        return this.sprites.get(id)?.isMoving ?? false;
    }

    moveMonster(
        id: string,
        path: readonly Position[],
        finalFacing: Facing,
        onComplete: () => void,
    ): void {
        const state = this.sprites.get(id);
        if (!state || path.length === 0) return;

        state.action = "move";
        state.isMoving = true;
        const moveToStep = (index: number): void => {
            const destination = path[index];
            if (!destination) {
                state.facing = finalFacing;
                state.isMoving = false;
                state.action = "idle";
                this.play(state, "idle");
                this.updateGrayscale(state);
                onComplete();
                return;
            }

            state.facing = getFacingFromMovement(state.position, destination, state.facing);
            this.play(state, "move");
            const spritePosition = this.getSpritePosition(destination, state.monster.id, state.facing);
            this.scene.tweens.add({
                targets: state.sprite,
                x: spritePosition.x,
                y: spritePosition.y,
                duration: 350,
                ease: "Linear",
                onComplete: () => {
                    state.position = { ...destination };
                    state.sprite.setDepth(destination.x + destination.y + 1);
                    moveToStep(index + 1);
                },
            });
        };
        moveToStep(0);
    }

    playAttack(id: string, attackIndex = 0, backstab = false, facing?: Facing): void {
        const state = this.sprites.get(id);
        if (!state || state.isDead) return;
        if (facing && state.facing !== facing) {
            state.facing = facing;
            const spritePosition = this.getSpritePosition(
                state.position,
                state.monster.id,
                state.facing,
            );
            state.sprite.setPosition(spritePosition.x, spritePosition.y);
        }
        const animations = MONSTER_SPRITES[state.monster.id]?.animations;
        const action =
            backstab && animations?.backstab
                ? "backstab"
                : attackIndex > 0 && animations?.strongAttack
                  ? "strongAttack"
                  : attackIndex > 0 && animations?.attackAoe
                    ? "attackAoe"
                  : "attack";
        if (!animations?.[action]) return;

        state.action = action;
        state.isMoving = false;
        this.play(state, action);
        state.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
            if (state.action !== action) return;
            state.action = "idle";
            this.play(state, "idle");
            this.updateGrayscale(state);
        });
    }

    takeDamage(id: string, currentHp: number, position: Position): void {
        const state = this.sprites.get(id);
        const animation = currentHp <= 0 ? "death" : "hit";
        if (!state || state.isDead || !MONSTER_SPRITES[state.monster.id]?.animations[animation])
            return;

        this.scene.tweens.killTweensOf(state.sprite);
        state.position = { ...position };
        const spritePosition = this.getSpritePosition(position, state.monster.id, state.facing);
        state.sprite.setPosition(spritePosition.x, spritePosition.y);
        state.sprite.setDepth(position.x + position.y + 1);
        state.isMoving = false;
        state.action = animation;
        state.isDead = currentHp <= 0;
        this.play(state, animation, true);
        state.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
            if (state.action !== animation || state.isDead) return;
            state.action = "idle";
            this.play(state, "idle");
            this.updateGrayscale(state);
        });
    }

    private createSprite(monster: PlacedMonster): MonsterSpriteState {
        const definition = MONSTER_SPRITES[monster.monster.id];
        const position = this.getSpritePosition(monster.position, monster.monster.id, monster.facing);
        const idleAnimation = definition.animations.idle;
        const sprite = this.scene.add
            .sprite(
                position.x,
                position.y,
                frameTextureKey(
                    monster.monster.id,
                    "idle",
                    monster.facing,
                    idleAnimation,
                    monster.owner,
                ),
            )
            .setOrigin(definition.originX, definition.originY)
            .setScale(definition.scale);
        const state: MonsterSpriteState = {
            sprite,
            monster: monster.monster,
            owner: monster.owner,
            position: { ...monster.position },
            facing: monster.facing,
            action: "idle",
            isMoving: false,
            isGrayscale: false,
            shouldBeGrayscale: false,
            isDead: false,
        };
        this.container.add(sprite);
        this.sprites.set(monster.id, state);
        this.play(state, "idle");
        return state;
    }

    private getSpritePosition(position: Position, monsterId: string, facing: Facing): Position {
        const center = this.toScreen(position);
        const offsetY = MONSTER_SPRITES[monsterId]?.facingOffsetY?.[facing] ?? 0;
        return { x: center.x, y: center.y - 3 + offsetY };
    }

    private updateGrayscale(state: MonsterSpriteState): void {
        if (state.isMoving || state.action !== "idle") return;
        if (state.shouldBeGrayscale && !state.isGrayscale) {
            state.sprite.postFX.addColorMatrix().grayscale();
            state.isGrayscale = true;
        } else if (!state.shouldBeGrayscale && state.isGrayscale) {
            state.sprite.clearFX();
            state.isGrayscale = false;
        }
    }

    private createAnimations(): void {
        for (const [monsterId, definition] of Object.entries(MONSTER_SPRITES)) {
            for (const [action, animation] of Object.entries(definition.animations) as [
                MonsterSpriteAction,
                MonsterSpriteAnimation,
            ][]) {
                const facings = "files" in animation
                    ? (Object.keys(animation.files) as (Facing | MonsterSpriteFacing)[])
                    : (Object.keys(animation.rows) as MonsterSpriteFacing[]);
                for (const facing of facings) {
                    const sheet = "spriteSheet" in animation;
                    const owners = sheet
                        ? [
                              undefined,
                              ...(Object.keys(animation.playerSpriteSheets ?? {}).map(
                                  Number,
                              ) as PlayerId[]),
                          ]
                        : [undefined];
                    for (const owner of owners) {
                        const key = textureKey(monsterId, action, facing, owner);
                        if (this.scene.anims.exists(key)) continue;
                        const framesTextureKey = sheet
                            ? spriteSheetTextureKey(
                                  monsterId,
                                  action,
                                  owner && animation.playerSpriteSheets?.[owner]
                                      ? owner
                                      : undefined,
                              )
                            : key;
                        const totalFrames =
                            this.scene.textures.get(framesTextureKey).frameTotal - 1;
                        const start =
                            sheet && "rows" in animation
                                ? animation.rows[facing as MonsterSpriteFacing] *
                                      animation.framesPerRow +
                                  (animation.frameRange?.[0] ?? 0)
                                : 0;
                        const end = sheet
                            ? start +
                              (animation.frameRange
                                  ? animation.frameRange[1] - animation.frameRange[0]
                                  : animation.framesPerRow - 1)
                            : totalFrames - 1;
                        if (totalFrames <= end) {
                            throw new Error(
                                `Sprite sheet "${key}" does not contain animation frames.`,
                            );
                        }

                        this.scene.anims.create({
                            key,
                            frames: this.scene.anims.generateFrameNumbers(framesTextureKey, {
                                start,
                                end,
                            }),
                            frameRate: animation.frameRate,
                            repeat:
                                action === "attack" ||
                                action === "attackAoe" ||
                                action === "strongAttack" ||
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
    }

    private play(state: MonsterSpriteState, action: MonsterSpriteAction, restart = false): void {
        const definition = MONSTER_SPRITES[state.monster.id];
        const spriteAction = definition?.animations[action] ? action : "idle";
        const animation = definition?.animations[spriteAction];
        if (!animation) return;

        const facing =
            "files" in animation
                ? animation.files[state.facing]
                    ? state.facing
                    : "south"
                : GRID_FACING_TO_SPRITE_FACING[state.facing];
        const key = textureKey(state.monster.id, spriteAction, facing);
        const ownerSpecificKey = textureKey(state.monster.id, spriteAction, facing, state.owner);
        const animationKey =
            "spriteSheet" in animation && animation.playerSpriteSheets?.[state.owner]
                ? ownerSpecificKey
                : key;
        if (restart || state.sprite.anims.currentAnim?.key !== animationKey)
            state.sprite.play(animationKey);
    }
}
