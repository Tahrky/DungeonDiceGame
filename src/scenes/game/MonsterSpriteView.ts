import Phaser from "phaser";

import {
    GRID_FACING_TO_SPRITE_FACING,
    MONSTER_SPRITES,
    type MonsterSpriteAction,
    type MonsterSpriteFacing,
} from "../../data/monsterSprites";
import {
    createMonsterSpriteAnimations,
    getMonsterSpriteTextureKey,
    preloadMonsterSprites,
} from "./MonsterSpriteAnimations";
import { createMonsterPreview } from "./MonsterSpritePreview";
import { createMonsterSprite } from "./MonsterSpriteFactory";
import { getFacingFromMovement } from "../../game/monsterActions";
import { STATUS_EFFECT_COLORS } from "../../game/statusEffects";

import type {
    Monster,
    Facing,
    MonsterAttackAnimation,
    PlacedMonster,
    PlayerId,
    Position,
    StatusEffectColor,
} from "../../types/GameTypes";

interface MonsterSpriteState {
    readonly sprite: Phaser.GameObjects.Sprite;
    readonly monster: Monster;
    readonly owner: PlayerId;
    grayscaleEffect: Phaser.FX.ColorMatrix | null;
    statusTintEffect: Phaser.FX.ColorMatrix | null;
    statusColor: StatusEffectColor | null;
    position: Position;
    facing: Facing;
    action: MonsterSpriteAction;
    isMoving: boolean;
    isGrayscale: boolean;
    shouldBeGrayscale: boolean;
    isDead: boolean;
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
        return preloadMonsterSprites(scene, monsterIds, actions);
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
        createMonsterSpriteAnimations(this.scene, monsterIds, actions);
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
            this.updateStatusTint(
                state,
                monster.statusEffects[monster.statusEffects.length - 1]?.color ?? null,
            );
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
        return createMonsterPreview(
            this.scene,
            monster,
            facing,
            container,
            x,
            y,
            spriteFacingOverride,
        );
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
        if (!state || state.isDead) return;
        const animation = currentHp <= 0 ? "death" : "hit";
        if (currentHp <= 0) this.updateStatusTint(state, null);
        if (!MONSTER_SPRITES[state.monster.id]?.animations[animation]) return;

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
        const position = this.getSpritePosition(
            monster.position,
            monster.monster.id,
            monster.facing,
        );
        const sprite = createMonsterSprite(this.scene, monster, position);
        const state: MonsterSpriteState = {
            sprite,
            monster: monster.monster,
            owner: monster.owner,
            grayscaleEffect: null,
            statusTintEffect: null,
            statusColor: null,
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
                const preFX = state.sprite.preFX;
                if (!preFX) return;
                state.grayscaleEffect = preFX.addColorMatrix();
                state.grayscaleEffect.grayscale();
            }
            state.grayscaleEffect.active = true;
            state.isGrayscale = true;
        } else if (!state.shouldBeGrayscale && state.isGrayscale) {
            if (state.grayscaleEffect) state.grayscaleEffect.active = false;
            state.isGrayscale = false;
        }
    }

    private updateStatusTint(state: MonsterSpriteState, color: StatusEffectColor | null): void {
        if (state.statusColor === color) return;
        if (color === null) {
            state.statusColor = null;
            if (state.statusTintEffect) state.statusTintEffect.active = false;
            return;
        }

        if (!state.statusTintEffect) {
            const preFX = state.sprite.preFX;
            if (!preFX) return;
            state.statusTintEffect = preFX.addColorMatrix();
        }
        state.statusColor = color;
        const luminanceRed = 0.299;
        const luminanceGreen = 0.587;
        const luminanceBlue = 0.114;
        const hexColor = STATUS_EFFECT_COLORS[color];
        const red = ((hexColor >> 16) & 0xff) / 255;
        const green = ((hexColor >> 8) & 0xff) / 255;
        const blue = (hexColor & 0xff) / 255;
        const brightness = color === "gray" ? 1 : Math.max(red, green, blue);
        state.statusTintEffect.set([
            (luminanceRed * red) / brightness,
            (luminanceGreen * red) / brightness,
            (luminanceBlue * red) / brightness,
            0,
            0,
            (luminanceRed * green) / brightness,
            (luminanceGreen * green) / brightness,
            (luminanceBlue * green) / brightness,
            0,
            0,
            (luminanceRed * blue) / brightness,
            (luminanceGreen * blue) / brightness,
            (luminanceBlue * blue) / brightness,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
        ]);
        state.statusTintEffect.active = true;
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
        const key = getMonsterSpriteTextureKey(state.monster.id, spriteAction, facing);
        if (!this.scene.anims.exists(key)) return;
        if (restart || state.sprite.anims.currentAnim?.key !== key) state.sprite.play(key);
    }
}
