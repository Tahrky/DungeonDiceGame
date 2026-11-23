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
import { MONSTER_SPRITE_STYLE } from "./MonsterSpriteStyle";
import {
    compareMonsterSpriteDepth,
    getMonsterSpriteDepth,
} from "./monsterSpriteDepth";
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

export class MonsterSpriteView {
    private readonly scene: Phaser.Scene;
    private readonly liveContainer: Phaser.GameObjects.Container;
    private readonly deadContainer: Phaser.GameObjects.Container;
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
        this.deadContainer = scene.add.container(0, 0).setDepth(0.5);
        this.liveContainer = scene.add.container(0, 0).setDepth(1);
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

    render(
        monsters: readonly PlacedMonster[],
        grayscaleMonsterIds: ReadonlySet<string>,
        camouflagedMonsterIds: ReadonlySet<string> = new Set(),
    ): void {
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
            state.shouldBeGrayscale = grayscaleMonsterIds.has(monster.id);
            state.shouldBeCamouflaged = camouflagedMonsterIds.has(monster.id);
            if (state.isDead) {
                this.updateDeadAppearance(state);
                continue;
            }
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
                this.updateSpriteDepth(state);
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

    clearCamouflage(id: string): void {
        const state = this.sprites.get(id);
        if (!state || state.isDead) return;
        state.shouldBeCamouflaged = false;
        state.isGrayscale = false;
        if (state.grayscaleEffect) state.grayscaleEffect.active = false;
        state.sprite.setAlpha(1);
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
                const previousOffsetY = this.getFacingOffsetY(state);
                state.facing = finalFacing;
                state.sprite.y += this.getFacingOffsetY(state) - previousOffsetY;
                state.isMoving = false;
                state.action = "idle";
                this.play(state, "idle");
                this.updateSpriteDepth(state);
                this.updateGrayscale(state);
                onComplete();
                return;
            }

            const previousOffsetY = this.getFacingOffsetY(state);
            state.facing = getFacingFromMovement(state.position, destination, state.facing);
            state.sprite.y += this.getFacingOffsetY(state) - previousOffsetY;
            this.play(state, "move");
            this.updateSpriteDepth(state);
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
                onUpdate: () => this.updateSpriteDepth(state),
                onComplete: () => {
                    state.position = { ...destination };
                    this.updateSpriteDepth(state);
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
        if (currentHp <= 0) {
            this.updateStatusTint(state, null);
        }
        if (!MONSTER_SPRITES[state.monster.id]?.animations[animation]) return;

        this.scene.tweens.killTweensOf(state.sprite);
        state.position = { ...position };
        const spritePosition = this.getSpritePosition(position, state.monster.id, state.facing);
        state.sprite.setPosition(spritePosition.x, spritePosition.y);
        state.isMoving = false;
        state.action = animation;
        state.isDead = currentHp <= 0;
        if (state.isDead) {
            this.deadContainer.add(state.sprite);
            this.updateSpriteDepth(state);
            this.updateDeadAppearance(state);
        } else {
            this.updateSpriteDepth(state);
        }
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
        sprite.name = monster.id;
        const ownerGlow = sprite.postFX.addGlow(
            MONSTER_SPRITE_STYLE.playerColors[monster.owner],
            3,
            0,
            false,
            0.1,
            2,
        );
        const state: MonsterSpriteState = {
            sprite,
            ownerGlow,
            monster: monster.monster,
            owner: monster.owner,
            grayscaleEffect: null,
            deadEffect: null,
            deadOutline: null,
            statusTintEffect: null,
            statusColor: null,
            position: { ...monster.position },
            facing: monster.facing,
            action: "idle",
            isMoving: false,
            isGrayscale: false,
            shouldBeGrayscale: false,
            shouldBeCamouflaged: false,
            isDead: false,
        };
        this.liveContainer.add(sprite);
        this.sprites.set(monster.id, state);
        this.play(state, "idle");
        return state;
    }

    private getSpritePosition(position: Position, monsterId: string, facing: Facing): Position {
        const center = this.toScreen(position);
        const offsetY = MONSTER_SPRITES[monsterId]?.facingOffsetY?.[facing] ?? 0;
        return { x: center.x, y: center.y - 3 + offsetY };
    }

    private getFacingOffsetY(state: MonsterSpriteState): number {
        return MONSTER_SPRITES[state.monster.id]?.facingOffsetY?.[state.facing] ?? 0;
    }

    private updateSpriteDepth(state: MonsterSpriteState): void {
        state.sprite.setDepth(
            getMonsterSpriteDepth(state.sprite.y, this.getFacingOffsetY(state)),
        );
        const container = state.isDead ? this.deadContainer : this.liveContainer;
        let index = container.getIndex(state.sprite);
        while (
            index > 0 &&
            this.compareSprites(state.sprite, container.list[index - 1]!) < 0
        ) {
            container.moveTo(state.sprite, index - 1);
            index--;
        }
        while (
            index < container.list.length - 1 &&
            this.compareSprites(state.sprite, container.list[index + 1]!) > 0
        ) {
            container.moveTo(state.sprite, index + 1);
            index++;
        }
    }

    private compareSprites(
        first: Phaser.GameObjects.GameObject,
        second: Phaser.GameObjects.GameObject,
    ): number {
        const firstSprite = this.sprites.get(first.name)?.sprite;
        const secondSprite = this.sprites.get(second.name)?.sprite;
        if (!firstSprite || !secondSprite) return first.name.localeCompare(second.name);
        return compareMonsterSpriteDepth(
            { depth: firstSprite.depth, x: firstSprite.x, id: firstSprite.name },
            { depth: secondSprite.depth, x: secondSprite.x, id: secondSprite.name },
        );
    }

    private updateGrayscale(state: MonsterSpriteState): void {
        if (state.isDead) {
            this.updateDeadAppearance(state);
            return;
        }
        if (state.isMoving || (!state.isDead && state.action !== "idle")) return;
        if (state.shouldBeGrayscale) {
            if (!state.grayscaleEffect) {
                const preFX = state.sprite.preFX;
                if (!preFX) return;
                state.grayscaleEffect = preFX.addColorMatrix();
            }
            state.grayscaleEffect.grayscale(state.shouldBeCamouflaged ? 1 : 0.8);
            state.grayscaleEffect.active = true;
            state.isGrayscale = true;
        } else if (!state.shouldBeGrayscale && state.isGrayscale) {
            if (state.grayscaleEffect) state.grayscaleEffect.active = false;
            state.isGrayscale = false;
        }
        state.sprite.setAlpha(
            state.shouldBeCamouflaged ? 0.7 : state.shouldBeGrayscale ? 0.8 : 1,
        );
    }

    private updateDeadAppearance(state: MonsterSpriteState): void {
        state.sprite.setAlpha(MONSTER_SPRITE_STYLE.deadSpriteOpacity);
        state.ownerGlow.active = false;
        if (!state.deadOutline) {
            state.deadOutline = state.sprite.postFX.addGlow(
                MONSTER_SPRITE_STYLE.playerColors[state.owner],
                1,
                0,
                false,
                0.1,
                MONSTER_SPRITE_STYLE.deadOutlineThickness,
            );
        }
        state.deadOutline.glcolor[3] = MONSTER_SPRITE_STYLE.deadOutlineOpacity;
        if (!state.deadEffect) {
            const preFX = state.sprite.preFX;
            if (!preFX) return;
            state.deadEffect = preFX.addColorMatrix();
        }
        if (state.grayscaleEffect) state.grayscaleEffect.active = false;
        if (state.statusTintEffect) state.statusTintEffect.active = false;
        state.deadEffect.grayscale(MONSTER_SPRITE_STYLE.deadSpriteDesaturation);
        state.deadEffect.active = true;
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
