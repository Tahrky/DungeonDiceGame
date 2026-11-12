import { GameHudActionsPanel } from "./GameHudActions";
import { PATTERN_COLUMNS, PATTERN_CARD_WIDTH, PATTERN_CARD_HEIGHT, PATTERN_COLUMN_GAP, PATTERN_ROW_GAP, HUD_RIGHT, PATTERN_START_X, PATTERN_START_Y, COLLAPSED_PATTERN_Y } from "./GameHudBase";
import type { GameHudActions, IconButtonOptions } from "./GameHudBase";
import Phaser from "phaser";
import { PLACEMENT_PATTERNS } from "../../data/placementPatterns";
import type { GameViewState } from "./GameViewState";

export class GameHudPatterns extends GameHudActionsPanel {
    protected renderPatternSelector(state: GameViewState, actions: GameHudActions): void {
        const patternStartY = state.patternSelectorExpanded ? PATTERN_START_Y : COLLAPSED_PATTERN_Y;
        this.addButton(
            state.patternSelectorExpanded ? "PATRONS ▲" : "PATRONS ▼",
            HUD_RIGHT,
            patternStartY - 29,
            actions.togglePatternSelector,
            { rightAligned: true },
        );

        const visiblePatterns = state.patternSelectorExpanded
            ? PLACEMENT_PATTERNS.map((pattern, index) => ({ pattern, index }))
            : [
                  {
                      pattern: PLACEMENT_PATTERNS[state.selectedPattern],
                      index: state.selectedPattern,
                  },
              ];

        visiblePatterns.forEach(({ pattern, index }) => {
            const column = state.patternSelectorExpanded
                ? index % PATTERN_COLUMNS
                : PATTERN_COLUMNS - 1;
            const row = state.patternSelectorExpanded ? Math.floor(index / PATTERN_COLUMNS) : 0;
            const x = PATTERN_START_X + column * PATTERN_COLUMN_GAP;
            const y = patternStartY + row * PATTERN_ROW_GAP;
            const selected = index === state.selectedPattern;
            const background = this.scene.add
                .rectangle(
                    x,
                    y,
                    PATTERN_CARD_WIDTH,
                    PATTERN_CARD_HEIGHT,
                    selected ? 0x51482d : 0x2a3644,
                    1,
                )
                .setOrigin(0);

            background.setStrokeStyle(1, selected ? 0xf1cf65 : 0x667b8e);
            if (!state.pendingCells && state.actionMode.type === "idle") {
                background.setInteractive({ useHandCursor: true });
                background.on(
                    "pointerdown",
                    (
                        _pointer: Phaser.Input.Pointer,
                        _localX: number,
                        _localY: number,
                        event: Phaser.Types.Input.EventData,
                    ) => {
                        event.stopPropagation();
                        actions.selectPattern(index);
                    },
                );
            }
            this.container.add(background);

            const preview = this.scene.add.graphics();
            const minX = Math.min(...pattern.map((cell) => cell.x));
            const minY = Math.min(...pattern.map((cell) => cell.y));
            preview.fillStyle(0xf1cf65, 1);
            for (const cell of pattern) {
                preview.fillRect(x + 8 + (cell.x - minX) * 8, y + 9 + (cell.y - minY) * 8, 6, 6);
            }
            this.container.add(preview);

            const label = this.scene.add
                .text(x + PATTERN_CARD_WIDTH - 18, y + PATTERN_CARD_HEIGHT / 2, `${index + 1}`, {
                    fontFamily: "Arial",
                    fontSize: "15px",
                    color: selected ? "#f1cf65" : "#ffffff",
                    fontStyle: "bold",
                })
                .setOrigin(0.5);
            this.container.add(label);
        });

        if (!state.patternSelectorExpanded) return;

        const mirrorColumn = 11 % PATTERN_COLUMNS;
        const mirrorRow = Math.floor(11 / PATTERN_COLUMNS);
        const mirrorX = PATTERN_START_X + mirrorColumn * PATTERN_COLUMN_GAP;
        const mirrorY = patternStartY + mirrorRow * PATTERN_ROW_GAP;
        const canMirror =
            state.selectedMonster !== null &&
            !state.pendingCells &&
            state.actionMode.type === "idle";
        const iconButtonY = mirrorY;
        this.addIconButton({
            icon: "🪞",
            tooltip: "Miroir vertical",
            x: mirrorX,
            y: iconButtonY,
            enabled: canMirror,
            active: state.patternMirrored,
            callback: actions.mirrorPattern,
        });
        this.addIconButton({
            icon: "🔄",
            tooltip: `Pivoter le patron de 90° (orientation actuelle : ${state.patternRotation * 90}°)`,
            x: mirrorX + 62,
            y: iconButtonY,
            enabled: canMirror,
            active: false,
            callback: actions.rotatePattern,
        });
    }

    protected addIconButton(options: IconButtonOptions): void {
        const { icon, tooltip, x, y, enabled, active, callback } = options;
        const width = 58;
        const height = PATTERN_CARD_HEIGHT;
        let fillColor = 0x252e39;
        if (active) {
            fillColor = 0x51482d;
        } else if (enabled) {
            fillColor = 0x354352;
        }
        const borderColor = active ? 0xf1cf65 : 0x667b8e;
        const iconColor = enabled || active ? "#f1cf65" : "#75808d";
        const button = this.scene.add
            .rectangle(x, y, width, height, fillColor, 1)
            .setOrigin(0)
            .setStrokeStyle(1, borderColor)
            .setInteractive({ useHandCursor: enabled });
        const iconText = this.scene.add
            .text(x + width / 2, y + height / 2, icon, {
                fontFamily: "Arial",
                fontSize: "28px",
                color: iconColor,
            })
            .setOrigin(0.5);
        this.container.add([button, iconText]);

        let tooltipBackground: Phaser.GameObjects.Rectangle | undefined;
        let tooltipText: Phaser.GameObjects.Text | undefined;
        button.on("pointerover", (pointer: Phaser.Input.Pointer) => {
            button.setFillStyle(enabled ? 0x46596b : fillColor);
            const camera = this.scene.cameras.main;
            const pointerPosition = camera.getWorldPoint(pointer.x, pointer.y);
            tooltipText = this.scene.add.text(pointerPosition.x + 8, pointerPosition.y - 22, tooltip, {
                fontFamily: "Arial",
                fontSize: "12px",
                color: "#ffffff",
                backgroundColor: "#151b25",
                padding: { x: 6, y: 4 },
            });
            let tooltipX = pointerPosition.x + 8;
            const view = camera.worldView;
            if (tooltipX + tooltipText.width + 2 > view.x + view.width - 4) {
                tooltipX = pointerPosition.x - tooltipText.width - 10;
            }
            const minX = view.x + 4;
            const maxX = Math.max(minX, view.x + view.width - tooltipText.width - 6);
            tooltipX = Phaser.Math.Clamp(tooltipX, minX, maxX);

            let tooltipY = pointerPosition.y - tooltipText.height - 8;
            if (tooltipY < view.y + 4) tooltipY = pointerPosition.y + 8;
            const minY = view.y + 4;
            const maxY = Math.max(minY, view.y + view.height - tooltipText.height - 6);
            tooltipY = Phaser.Math.Clamp(tooltipY, minY, maxY);
            tooltipText.setPosition(tooltipX, tooltipY);

            tooltipBackground = this.scene.add
                .rectangle(
                    tooltipText.x - 1,
                    tooltipText.y - 1,
                    tooltipText.width + 2,
                    tooltipText.height + 2,
                    0x151b25,
                    0.98,
                )
                .setOrigin(0)
                .setStrokeStyle(1, 0x667b8e);
            this.container.add([tooltipBackground, tooltipText]);
            tooltipBackground.setDepth(button.depth + 1);
            tooltipText.setDepth(button.depth + 2);
        });
        button.on("pointerout", () => {
            button.setFillStyle(fillColor);
            tooltipBackground?.destroy();
            tooltipText?.destroy();
            tooltipBackground = undefined;
            tooltipText = undefined;
        });
        button.on(
            "pointerdown",
            (
                _pointer: Phaser.Input.Pointer,
                _localX: number,
                _localY: number,
                event: Phaser.Types.Input.EventData,
            ) => {
                event.stopPropagation();
                if (enabled) callback();
            },
        );
    }
}
