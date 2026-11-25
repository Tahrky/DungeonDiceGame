import type Phaser from "phaser";
import type { PlayerId } from "../../types/GameTypes";

type TextStyle = Phaser.Types.GameObjects.Text.TextStyle;

export const PLAYER_COLORS: Readonly<Record<PlayerId, { css: string; hex: number }>> = {
    1: { css: "#ff8d78", hex: 0xff8d78 },
    2: { css: "#70bdff", hex: 0x70bdff },
};

export function arialStyle(size: number, color: string, extra: TextStyle = {}): TextStyle {
    return { fontFamily: "Arial", fontSize: `${size}px`, color, ...extra };
}

export function onPointerDown(
    target: Phaser.GameObjects.GameObject,
    handler: (pointer: Phaser.Input.Pointer) => void,
): void {
    target.on(
        "pointerdown",
        (
            pointer: Phaser.Input.Pointer,
            _localX: number,
            _localY: number,
            event: Phaser.Types.Input.EventData,
        ) => {
            event.stopPropagation();
            handler(pointer);
        },
    );
}

export function setHoverFill(
    target: Phaser.GameObjects.Shape,
    normalColor: number,
    hoverColor: number,
): void {
    target.on("pointerover", () => target.setFillStyle(hoverColor, 1));
    target.on("pointerout", () => target.setFillStyle(normalColor, 1));
}
