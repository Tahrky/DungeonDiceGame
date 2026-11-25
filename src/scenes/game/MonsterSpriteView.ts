import Phaser from "phaser";

import {
    MONSTER_SPRITES,
    type MonsterSpriteAction,
    type MonsterSpriteFacing,
} from "../../data/monsterSprites";
import {
    createMonsterSpriteAnimations,
    getAnimationFacing,
    getFacingOffsetY,
    getMonsterSpriteTextureKey,
    preloadMonsterSprites,
    resolveAttackAction,
} from "./MonsterSpriteAnimations";
import {
    clearCamouflageEffect,
    updateDeadAppearance,
    updateGrayscale,
    updateStatusTint,
} from "./MonsterSpriteEffects";
import { createMonsterPreview } from "./MonsterSpritePreview";
import { createMonsterSprite } from "./MonsterSpriteFactory";
import { createMonsterSpriteState, type MonsterSpriteState } from "./MonsterSpriteState";
import { MONSTER_SPRITE_STYLE } from "./MonsterSpriteStyle";
import {
    compareMonsterSpriteDepth,
    getMonsterSpriteDepth,
    moveToSortedIndex,
} from "./monsterSpriteDepth";
import { getFacingFromMovement } from "../../game/monsterActions";

import type {
    Facing,
    Monster,
    MonsterAttackAnimation,
    PlacedMonster,
    Position,
} from "../../types/GameTypes";

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
                updateDeadAppearance(state);
                continue;
            }
            updateStatusTint(state, monster.statusEffects.at(-1)?.color ?? null);
            updateGrayscale(state);
            if (state.isMoving) continue;

            state.facing = monster.facing;
            this.placeSprite(state, monster.position);
            this.updateSpriteDepth(state);
            if (state.action === "idle") this.play(state, "idle");
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
        if (state && !state.isDead) clearCamouflageEffect(state);
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
                this.setFacing(state, finalFacing);
                state.isMoving = false;
                state.action = "idle";
                this.play(state, "idle");
                this.updateSpriteDepth(state);
                updateGrayscale(state);
                onComplete();
                return;
            }

            this.setFacing(state, getFacingFromMovement(state.position, destination, state.facing));
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
            this.placeSprite(state, state.position);
        }
        const action = resolveAttackAction(state.monster.id, animation, backstab);
        if (!action) return;

        state.action = action;
        state.isMoving = false;
        this.play(state, action);
        this.returnToIdleOnComplete(state, action);
    }

    takeDamage(id: string, currentHp: number, position: Position): void {
        const state = this.sprites.get(id);
        if (!state || state.isDead) return;
        const animation = currentHp <= 0 ? "death" : "hit";
        if (currentHp <= 0) updateStatusTint(state, null);
        if (!MONSTER_SPRITES[state.monster.id]?.animations[animation]) return;

        this.scene.tweens.killTweensOf(state.sprite);
        state.position = { ...position };
        this.placeSprite(state, position);
        state.isMoving = false;
        state.action = animation;
        state.isDead = currentHp <= 0;
        if (state.isDead) this.deadContainer.add(state.sprite);
        this.updateSpriteDepth(state);
        if (state.isDead) updateDeadAppearance(state);
        this.play(state, animation, true);
        this.returnToIdleOnComplete(state, animation);
    }

    private returnToIdleOnComplete(state: MonsterSpriteState, action: MonsterSpriteAction): void {
        state.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
            if (state.action !== action || state.isDead) return;
            state.action = "idle";
            this.play(state, "idle");
            updateGrayscale(state);
        });
    }

    private createSprite(monster: PlacedMonster): MonsterSpriteState {
        const sprite = createMonsterSprite(
            this.scene,
            monster,
            this.getSpritePosition(monster.position, monster.monster.id, monster.facing),
        );
        sprite.name = monster.id;
        const ownerGlow = sprite.postFX.addGlow(
            MONSTER_SPRITE_STYLE.playerColors[monster.owner],
            3,
            0,
            false,
            0.1,
            2,
        );
        const state = createMonsterSpriteState(sprite, ownerGlow, monster);
        this.liveContainer.add(sprite);
        this.sprites.set(monster.id, state);
        this.play(state, "idle");
        return state;
    }

    private getSpritePosition(position: Position, monsterId: string, facing: Facing): Position {
        const center = this.toScreen(position);
        return { x: center.x, y: center.y - 3 + getFacingOffsetY(monsterId, facing) };
    }

    private placeSprite(state: MonsterSpriteState, position: Position): void {
        const { x, y } = this.getSpritePosition(position, state.monster.id, state.facing);
        state.sprite.setPosition(x, y);
    }

    private setFacing(state: MonsterSpriteState, facing: Facing): void {
        const previousOffsetY = getFacingOffsetY(state.monster.id, state.facing);
        state.facing = facing;
        state.sprite.y += getFacingOffsetY(state.monster.id, facing) - previousOffsetY;
    }

    private updateSpriteDepth(state: MonsterSpriteState): void {
        state.sprite.setDepth(
            getMonsterSpriteDepth(state.sprite.y, getFacingOffsetY(state.monster.id, state.facing)),
        );
        moveToSortedIndex(
            state.isDead ? this.deadContainer : this.liveContainer,
            state.sprite,
            (first, second) => this.compareSprites(first, second),
        );
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

    private play(state: MonsterSpriteState, action: MonsterSpriteAction, restart = false): void {
        const definition = MONSTER_SPRITES[state.monster.id];
        const spriteAction = definition?.animations[action] ? action : "idle";
        const animation = definition?.animations[spriteAction];
        if (!animation) return;

        const key = getMonsterSpriteTextureKey(
            state.monster.id,
            spriteAction,
            getAnimationFacing(animation, state.facing),
        );
        if (!this.scene.anims.exists(key)) return;
        if (restart || state.sprite.anims.currentAnim?.key !== key) state.sprite.play(key);
    }
}
