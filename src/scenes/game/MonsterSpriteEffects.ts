import type Phaser from "phaser";

import { STATUS_EFFECT_COLORS } from "../../game/statusEffects";
import { MONSTER_SPRITE_STYLE } from "./MonsterSpriteStyle";
import type { MonsterSpriteState } from "./MonsterSpriteState";
import type { StatusEffectColor } from "../../types/GameTypes";

type ColorMatrixKey = "grayscaleEffect" | "deadEffect" | "statusTintEffect";

const LUMINANCE = [0.299, 0.587, 0.114];

function getColorMatrix(
    state: MonsterSpriteState,
    key: ColorMatrixKey,
): Phaser.FX.ColorMatrix | null {
    const { preFX } = state.sprite;
    if (!state[key] && preFX) state[key] = preFX.addColorMatrix();
    return state[key];
}

function deactivate(effect: Phaser.FX.ColorMatrix | null): void {
    if (effect) effect.active = false;
}

function getSpriteAlpha({ shouldBeCamouflaged, shouldBeGrayscale }: MonsterSpriteState): number {
    if (shouldBeCamouflaged) return 0.7;
    return shouldBeGrayscale ? 0.8 : 1;
}

export function clearCamouflageEffect(state: MonsterSpriteState): void {
    state.shouldBeCamouflaged = false;
    state.isGrayscale = false;
    deactivate(state.grayscaleEffect);
    state.sprite.setAlpha(1);
}

export function updateGrayscale(state: MonsterSpriteState): void {
    if (state.isDead) {
        updateDeadAppearance(state);
        return;
    }
    if (state.isMoving || state.action !== "idle") return;
    if (state.shouldBeGrayscale) {
        const effect = getColorMatrix(state, "grayscaleEffect");
        if (!effect) return;
        effect.grayscale(state.shouldBeCamouflaged ? 1 : 0.8);
        effect.active = true;
        state.isGrayscale = true;
    } else if (state.isGrayscale) {
        deactivate(state.grayscaleEffect);
        state.isGrayscale = false;
    }
    state.sprite.setAlpha(getSpriteAlpha(state));
}

export function updateDeadAppearance(state: MonsterSpriteState): void {
    state.sprite.setAlpha(MONSTER_SPRITE_STYLE.deadSpriteOpacity);
    state.ownerGlow.active = false;
    state.deadOutline ??= state.sprite.postFX.addGlow(
        MONSTER_SPRITE_STYLE.playerColors[state.owner],
        1,
        0,
        false,
        0.1,
        MONSTER_SPRITE_STYLE.deadOutlineThickness,
    );
    state.deadOutline.glcolor[3] = MONSTER_SPRITE_STYLE.deadOutlineOpacity;
    const effect = getColorMatrix(state, "deadEffect");
    if (!effect) return;
    deactivate(state.grayscaleEffect);
    deactivate(state.statusTintEffect);
    effect.grayscale(MONSTER_SPRITE_STYLE.deadSpriteDesaturation);
    effect.active = true;
}

export function updateStatusTint(state: MonsterSpriteState, color: StatusEffectColor | null): void {
    if (state.statusColor === color) return;
    if (color === null) {
        state.statusColor = null;
        deactivate(state.statusTintEffect);
        return;
    }

    const effect = getColorMatrix(state, "statusTintEffect");
    if (!effect) return;
    state.statusColor = color;
    const hexColor = STATUS_EFFECT_COLORS[color];
    const channels = [(hexColor >> 16) & 0xff, (hexColor >> 8) & 0xff, hexColor & 0xff].map(
        (channel) => channel / 255,
    );
    const brightness = color === "gray" ? 1 : Math.max(...channels);
    effect.set([
        ...channels.flatMap((channel) => [
            ...LUMINANCE.map((weight) => (weight * channel) / brightness),
            0,
            0,
        ]),
        0,
        0,
        0,
        1,
        0,
    ]);
    effect.active = true;
}
