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
    MonsterAttackAnimation,
    PlacedMonster,
    PlayerId,
    Position,
} from "../../types/GameTypes";

interface MonsterSpriteState {
    readonly sprite: Phaser.GameObjects.Sprite;
    readonly monster: Monster;
    readonly owner: PlayerId;
    grayscaleEffect: Phaser.FX.ColorMatrix | null;
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
): string {
    return `monster-${monsterId}-${action}-${facing}`;
}

function spriteSheetTextureKey(monsterId: string, action: MonsterSpriteAction): string {
    return `monster-${monsterId}-${action}-sheet`;
}

function frameTextureKey(
    monsterId: string,
    action: MonsterSpriteAction,
    facing: Facing | MonsterSpriteFacing,
    animation?: MonsterSpriteAnimation,
): string {
    if (!animation || !("spriteSheet" in animation)) {
        return textureKey(monsterId, action, facing);
    }
    return spriteSheetTextureKey(monsterId, action);
}

export class MonsterSpriteView {
    private readonly scene: Phaser.Scene;
    private readonly container: Phaser.GameObjects.Container;
    private readonly toScreen: (position: Position) => Position;
    private readonly sprites = new Map<string, MonsterSpriteState>();
    private ready = false;

    static preload(
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

                for (const [facing, file] of Object.entries(animation.files) as [
                    Facing,
                    string,
                ][]) {
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

    constructor(scene: Phaser.Scene, toScreen: (position: Position) => Position) {
        this.scene = scene;
        this.toScreen = toScreen;
        this.container = scene.add.container(0, 0).setDepth(1);
    }

    setReady(): void {
        this.ready = true;
    }

    createAnimations(monsterIds: readonly string[], actions: readonly MonsterSpriteAction[]): void {
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
                    if (this.scene.anims.exists(key)) continue;
                    const framesTextureKey =
                        "spriteSheet" in animation
                            ? frameTextureKey(monsterId, action, facing, animation)
                            : key;
                    if (!this.scene.textures.exists(framesTextureKey)) continue;
                    const totalFrames = this.scene.textures.get(framesTextureKey).frameTotal - 1;
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

                    this.scene.anims.create({
                        key,
                        frames: this.scene.anims.generateFrameNumbers(framesTextureKey, {
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

    refreshCurrentAnimations(): void {
        for (const state of this.sprites.values()) {
            if (state.action !== "idle") this.play(state, state.action, true);
        }
    }

    render(monsters: readonly PlacedMonster[], grayscaleMonsterIds: ReadonlySet<string>): void {
        if (!this.ready) return;

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
            const previewTexture = frameTextureKey(monster.id, "idle", previewFacing, animation);
            if (this.scene.textures.exists(previewTexture) && this.scene.anims.exists(key)) {
                const sprite = this.scene.add
                    .sprite(x, y, previewTexture)
                    .setOrigin(0.5)
                    .setScale(definition.previewScale ?? 0.75);
                container.add(sprite);
                sprite.play(key);
                return sprite;
            }
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
            const spritePosition = this.getSpritePosition(
                destination,
                state.monster.id,
                state.facing,
            );
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

    playAttack(
        id: string,
        animation: MonsterAttackAnimation = "attack",
        backstab = false,
        facing?: Facing,
    ): void {
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
                : animation !== "backstab" && animations?.[animation]
                  ? animation
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
        const position = this.getSpritePosition(
            monster.position,
            monster.monster.id,
            monster.facing,
        );
        const idleAnimation = definition.animations.idle;
        const idleTexture = frameTextureKey(
            monster.monster.id,
            "idle",
            monster.facing,
            idleAnimation,
        );
        const hasIdleTexture = this.scene.textures.exists(idleTexture);
        const sprite = this.scene.add
            .sprite(
                position.x,
                position.y,
                hasIdleTexture ? idleTexture : this.getFallbackTexture(monster.monster),
            )
            .setOrigin(
                hasIdleTexture ? definition.originX : 0.5,
                hasIdleTexture ? definition.originY : 0.5,
            )
            .setScale(hasIdleTexture ? definition.scale : 1);
        sprite.postFX.addGlow(monster.owner === 1 ? 0xff6470 : 0x70bdff, 3, 0, false, 0.1, 2);
        const state: MonsterSpriteState = {
            sprite,
            monster: monster.monster,
            owner: monster.owner,
            grayscaleEffect: null,
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
            if (!state.grayscaleEffect) {
                state.grayscaleEffect = state.sprite.preFX.addColorMatrix();
                state.grayscaleEffect.grayscale();
            }
            state.grayscaleEffect.active = true;
            state.isGrayscale = true;
        } else if (!state.shouldBeGrayscale && state.isGrayscale) {
            if (state.grayscaleEffect) state.grayscaleEffect.active = false;
            state.isGrayscale = false;
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
        if (!this.scene.anims.exists(key)) return;
        if (restart || state.sprite.anims.currentAnim?.key !== key) state.sprite.play(key);
    }

    private getFallbackTexture(monster: Monster): string {
        const key = `monster-fallback-${monster.id}`;
        if (this.scene.textures.exists(key)) return key;

        const graphics = this.scene.add.graphics();
        graphics.fillStyle(monster.color);
        graphics.fillCircle(16, 16, 15);
        graphics.generateTexture(key, 32, 32);
        graphics.destroy();
        return key;
    }
}
