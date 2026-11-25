import Phaser from "phaser";
import { PLACEMENT_PATTERNS } from "../../data/placementPatterns";
import type { Position } from "../../types/GameTypes";
import { GameHudActionsPanel } from "./GameHudActions";
import type { GameViewState } from "./GameViewState";
import {
    PATTERN_CARD_HEIGHT,
    PATTERN_CARD_WIDTH,
    PATTERN_COLUMNS,
    PATTERN_COLUMN_GAP,
    PATTERN_GRID_HEIGHT,
    PATTERN_ROW_GAP,
    getHudBottomY,
    getHudRightX,
    getPatternStartX,
    getPatternToggleY,
} from "./hudLayout";
import type { GameHudActions } from "./hudTypes";
import { arialStyle, onPointerDown, setHoverFill } from "./uiStyle";

interface IconButtonOptions {
    icon: string;
    tooltip: string;
    x: number;
    y: number;
    enabled: boolean;
    active: boolean;
    callback: () => void;
}

const GOLD = "#f1cf65";
const ICON_BUTTON_WIDTH = 60;
const MIRROR_BUTTON_SLOT = 11;
const MUTED_BORDER_COLOR = 0x667b8e;

function getIconButtonFill(enabled: boolean, active: boolean): number {
    if (active) return 0x51482d;
    return enabled ? 0x354352 : 0x252e39;
}

export class GameHudPatterns extends GameHudActionsPanel {
    protected renderPatternSelector(state: GameViewState, actions: GameHudActions): void {
        const expanded = state.patternSelectorExpanded;
        const bottomY = getHudBottomY(this.scene, 8);
        const startY = expanded ? bottomY - PATTERN_GRID_HEIGHT : bottomY - PATTERN_CARD_HEIGHT;
        const startX = getPatternStartX(this.scene);
        this.addButton(
            expanded ? "PATRONS ▲" : "PATRONS ▼",
            getHudRightX(this.scene),
            getPatternToggleY(this.scene, expanded),
            actions.togglePatternSelector,
            { rightAligned: true, uniformSize: true, centerVertically: true, height: 32 },
        );

        const visibleIndexes = expanded
            ? PLACEMENT_PATTERNS.keys()
            : [state.selectedPattern].values();
        for (const index of visibleIndexes) {
            const column = expanded ? index % PATTERN_COLUMNS : PATTERN_COLUMNS - 1;
            const row = expanded ? Math.floor(index / PATTERN_COLUMNS) : 0;
            this.renderPatternCard(
                state,
                actions,
                index,
                startX + column * PATTERN_COLUMN_GAP,
                startY + row * PATTERN_ROW_GAP,
            );
        }

        if (expanded) this.renderPatternTools(state, actions, startX, startY);
    }

    private renderPatternCard(
        state: GameViewState,
        actions: GameHudActions,
        index: number,
        x: number,
        y: number,
    ): void {
        const selected = index === state.selectedPattern;
        const background = this.addRect(
            x,
            y,
            PATTERN_CARD_WIDTH,
            PATTERN_CARD_HEIGHT,
            selected ? 0x51482d : 0x2a3644,
            1,
            [2, selected ? 0xf1cf65 : MUTED_BORDER_COLOR],
        );
        if (!state.pendingCells && state.actionMode.type === "idle") {
            background.setInteractive({ useHandCursor: true });
            onPointerDown(background, () => actions.selectPattern(index));
        }

        this.addPatternPreview(PLACEMENT_PATTERNS[index], x, y);
        this.addText(
            `${index + 1}`,
            x + PATTERN_CARD_WIDTH - 18,
            y + PATTERN_CARD_HEIGHT / 2,
            selected ? GOLD : "#ffffff",
            17,
        ).setOrigin(0.5);
    }

    private addPatternPreview(pattern: Position[], x: number, y: number): void {
        const minX = Math.min(...pattern.map((cell) => cell.x));
        const minY = Math.min(...pattern.map((cell) => cell.y));
        const preview = this.scene.add.graphics().fillStyle(0xf1cf65, 1);
        for (const cell of pattern) {
            preview.fillRect(x + 10 + (cell.x - minX) * 10, y + 8 + (cell.y - minY) * 10, 8, 8);
        }
        this.container.add(preview);
    }

    private renderPatternTools(
        state: GameViewState,
        actions: GameHudActions,
        startX: number,
        startY: number,
    ): void {
        const x = startX + (MIRROR_BUTTON_SLOT % PATTERN_COLUMNS) * PATTERN_COLUMN_GAP;
        const y = startY + Math.floor(MIRROR_BUTTON_SLOT / PATTERN_COLUMNS) * PATTERN_ROW_GAP;
        const enabled =
            state.selectedMonster !== null &&
            !state.pendingCells &&
            state.actionMode.type === "idle";
        this.addIconButton({
            icon: "🪞",
            tooltip: "Miroir vertical",
            x,
            y,
            enabled,
            active: state.patternMirrored,
            callback: actions.mirrorPattern,
        });
        this.addIconButton({
            icon: "🔄",
            tooltip: `Pivoter le patron de 90° (orientation actuelle : ${state.patternRotation * 90}°)`,
            x: x + 62,
            y,
            enabled,
            active: false,
            callback: actions.rotatePattern,
        });
    }

    private addIconButton(options: IconButtonOptions): void {
        const { icon, tooltip, x, y, enabled, active, callback } = options;
        const fillColor = getIconButtonFill(enabled, active);
        const button = this.addRect(x, y, ICON_BUTTON_WIDTH, PATTERN_CARD_HEIGHT, fillColor, 1, [
            1,
            active ? 0xf1cf65 : MUTED_BORDER_COLOR,
        ]).setInteractive({ useHandCursor: enabled });
        this.addStyledText(
            x + ICON_BUTTON_WIDTH / 2,
            y + PATTERN_CARD_HEIGHT / 2,
            icon,
            arialStyle(28, enabled || active ? GOLD : "#75808d"),
        ).setOrigin(0.5);

        let tooltipObjects: Phaser.GameObjects.GameObject[] = [];
        setHoverFill(button, fillColor, enabled ? 0x46596b : fillColor);
        button.on("pointerover", (pointer: Phaser.Input.Pointer) => {
            tooltipObjects = this.showTooltip(tooltip, pointer, button.depth);
        });
        button.on("pointerout", () => {
            tooltipObjects.forEach((object) => object.destroy());
            tooltipObjects = [];
        });
        onPointerDown(button, () => {
            if (enabled) callback();
        });
    }

    private showTooltip(
        label: string,
        pointer: Phaser.Input.Pointer,
        baseDepth: number,
    ): Phaser.GameObjects.GameObject[] {
        const camera = this.scene.cameras.main;
        const view = camera.worldView;
        const pointerPosition = camera.getWorldPoint(pointer.x, pointer.y);
        const text = this.scene.add.text(
            0,
            0,
            label,
            arialStyle(14, "#ffffff", { backgroundColor: "#151b25", padding: { x: 6, y: 4 } }),
        );

        let tooltipX = pointerPosition.x + 8;
        if (tooltipX + text.width + 2 > view.x + view.width - 4) {
            tooltipX = pointerPosition.x - text.width - 10;
        }
        const minX = view.x + 4;
        const maxX = Math.max(minX, view.x + view.width - text.width - 6);

        let tooltipY = pointerPosition.y - text.height - 8;
        if (tooltipY < view.y + 4) tooltipY = pointerPosition.y + 8;
        const minY = view.y + 4;
        const maxY = Math.max(minY, view.y + view.height - text.height - 6);
        text.setPosition(
            Phaser.Math.Clamp(tooltipX, minX, maxX),
            Phaser.Math.Clamp(tooltipY, minY, maxY),
        );

        const background = this.scene.add
            .rectangle(text.x - 1, text.y - 1, text.width + 2, text.height + 2, 0x151b25, 0.98)
            .setOrigin(0)
            .setStrokeStyle(1, MUTED_BORDER_COLOR);
        this.container.add([background, text]);
        background.setDepth(baseDepth + 1);
        text.setDepth(baseDepth + 2);
        return [background, text];
    }
}
