import Phaser from "phaser";
import { GameHudBase } from "./GameHudBase";
import type { GameViewState } from "./GameViewState";
import { describeHistoryEntry } from "./hudHistoryText";
import {
    ACTION_LOG_HEIGHT,
    ACTION_LOG_THUMB_MIN_HEIGHT,
    ACTION_LOG_TOGGLE_WIDTH,
    ACTION_LOG_TOP_OFFSET,
    ACTION_LOG_TRACK_HEIGHT,
    ACTION_LOG_TRACK_OFFSET_X,
    ACTION_LOG_VISIBLE_COUNT,
    ACTION_LOG_WIDTH,
    getHudLeftX,
    getHudTopY,
} from "./hudLayout";
import { PLAYER_COLORS, arialStyle, onPointerDown, setHoverFill } from "./uiStyle";

const HEADING_COLOR = "#f0c974";
const ENTRIES_OFFSET_Y = 38;

function getMaxScrollOffset(entryCount: number): number {
    return Math.max(0, entryCount - ACTION_LOG_VISIBLE_COUNT);
}

export abstract class GameHudHistory extends GameHudBase {
    private actionHistoryExpanded = true;

    constructor(scene: Phaser.Scene, container: Phaser.GameObjects.Container) {
        super(scene, container);
        this.scene.input.on("wheel", this.handleActionHistoryWheel, this);
        this.scene.input.on("pointermove", this.handleActionHistoryDrag, this);
        this.scene.input.on("pointerup", this.stopActionHistoryDrag, this);
        this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.scene.input.off("wheel", this.handleActionHistoryWheel, this);
            this.scene.input.off("pointermove", this.handleActionHistoryDrag, this);
            this.scene.input.off("pointerup", this.stopActionHistoryDrag, this);
        });
    }

    protected renderActionHistory(state: GameViewState): void {
        const x = getHudLeftX(this.scene);
        const y = getHudTopY(this.scene, ACTION_LOG_TOP_OFFSET);
        if (!this.actionHistoryExpanded) {
            this.renderCollapsedHistoryToggle(x, y);
            return;
        }

        this.addRect(x, y, ACTION_LOG_WIDTH, ACTION_LOG_HEIGHT, 0x151b25, 0.9, [2, 0x465367]);
        this.renderHistoryHeading(x, y);
        if (state.actionHistory.length === 0) {
            this.addStyledText(
                x + 12,
                y + 42,
                "Les actions jouées apparaîtront ici.",
                arialStyle(14, "#aab5c2", { wordWrap: { width: ACTION_LOG_WIDTH - 24 } }),
            );
            return;
        }

        const isScrollable = state.actionHistory.length > ACTION_LOG_VISIBLE_COUNT;
        if (isScrollable) this.renderActionHistoryScrollbar(state, x, y);
        this.renderHistoryEntries(state, x, y);
        if (isScrollable) {
            this.addStyledText(
                x + 12,
                y + ACTION_LOG_HEIGHT - 30,
                "Molette : parcourir l’historique",
                arialStyle(11, "#aab5c2", {
                    wordWrap: { width: ACTION_LOG_WIDTH - 24 },
                    maxLines: 2,
                }),
            );
        }
    }

    private renderHistoryHeading(x: number, y: number): void {
        const heading = this.addText("HISTORIQUE", x + 12, y + 10, HEADING_COLOR, 18);
        heading.setInteractive({ useHandCursor: true });
        heading.on("pointerover", () => heading.setStyle({ color: "#fff0c8" }));
        heading.on("pointerout", () => heading.setStyle({ color: HEADING_COLOR }));
        onPointerDown(heading, () => this.setActionHistoryExpanded(false));
    }

    private renderHistoryEntries(state: GameViewState, x: number, y: number): void {
        const offset = state.actionHistoryScrollOffset;
        const entries = [...state.actionHistory]
            .reverse()
            .slice(offset, offset + ACTION_LOG_VISIBLE_COUNT);
        const detailsStyle = arialStyle(12, "#e6edf5", {
            wordWrap: { width: ACTION_LOG_WIDTH - 40 },
            maxLines: 2,
        });
        let entryY = y + ENTRIES_OFFSET_Y;
        for (const entry of entries) {
            const { label, description } = describeHistoryEntry(entry);
            const measuredDetails = this.scene.make.text({
                x: 0,
                y: 0,
                text: description,
                style: detailsStyle,
                add: false,
            });
            const rowHeight = Phaser.Math.Clamp(measuredDetails.height + 26, 44, 54);
            measuredDetails.destroy();
            this.addRect(x + 8, entryY, ACTION_LOG_WIDTH - 24, rowHeight - 2, 0x202a36, 1, [
                2,
                PLAYER_COLORS[entry.player].hex,
                0.7,
            ]);
            this.addText(
                `J${entry.player} · ${label}`,
                x + 16,
                entryY + 4,
                entry.player === 1 ? "#ff9d8b" : "#83c6ff",
                12,
            );
            this.addStyledText(x + 16, entryY + 20, description, detailsStyle);
            entryY += rowHeight + 2;
        }
    }

    private renderCollapsedHistoryToggle(x: number, actionLogY: number): void {
        const height = 160;
        const y = actionLogY + (ACTION_LOG_HEIGHT - height) / 2;
        const background = this.addRect(
            x,
            y,
            ACTION_LOG_TOGGLE_WIDTH,
            height,
            0xa45e39,
            1,
            [1, 0xc47b4e],
        ).setInteractive({ useHandCursor: true });
        this.addText("HISTORIQUE", x + ACTION_LOG_TOGGLE_WIDTH / 2, y + height / 2, "#ffffff", 15)
            .setOrigin(0.5)
            .setRotation(-Math.PI / 2);
        setHoverFill(background, 0xa45e39, 0xc47b4e);
        onPointerDown(background, () => this.setActionHistoryExpanded(true));
    }

    private setActionHistoryExpanded(expanded: boolean): void {
        if (this.actionHistoryExpanded === expanded) return;
        this.actionHistoryExpanded = expanded;
        this.draggingActionHistory = false;
        if (this.lastState && this.lastActions) {
            this.render(this.lastState, this.lastActions);
        }
    }

    private renderActionHistoryScrollbar(state: GameViewState, x: number, y: number): void {
        const entryCount = state.actionHistory.length;
        const trackX = x + ACTION_LOG_TRACK_OFFSET_X;
        const trackY = y + ENTRIES_OFFSET_Y;
        const maxOffset = getMaxScrollOffset(entryCount);
        const thumbHeight = Math.max(
            ACTION_LOG_THUMB_MIN_HEIGHT,
            (ACTION_LOG_TRACK_HEIGHT * ACTION_LOG_VISIBLE_COUNT) / entryCount,
        );
        const thumbY =
            trackY +
            (maxOffset === 0
                ? 0
                : (state.actionHistoryScrollOffset / maxOffset) *
                  (ACTION_LOG_TRACK_HEIGHT - thumbHeight));
        const track = this.addRect(trackX, trackY, 6, ACTION_LOG_TRACK_HEIGHT, 0x354352);
        const thumb = this.addRect(trackX - 1, thumbY, 8, thumbHeight, 0xf0c974);
        for (const handle of [track, thumb]) {
            handle.setInteractive({ useHandCursor: true });
            onPointerDown(handle, (pointer) => {
                this.draggingActionHistory = true;
                this.scrollActionHistoryAt(pointer);
            });
        }
    }

    private handleActionHistoryDrag(pointer: Phaser.Input.Pointer): void {
        if (this.draggingActionHistory) this.scrollActionHistoryAt(pointer);
    }

    private stopActionHistoryDrag(): void {
        this.draggingActionHistory = false;
    }

    private scrollActionHistoryAt(pointer: Phaser.Input.Pointer): void {
        if (!this.actionHistoryExpanded || !this.lastState) return;

        const maxOffset = getMaxScrollOffset(this.lastState.actionHistory.length);
        if (maxOffset === 0) return;

        const pointerPosition = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const trackY = getHudTopY(this.scene, ACTION_LOG_TOP_OFFSET) + ENTRIES_OFFSET_Y;
        const progress = Phaser.Math.Clamp(
            (pointerPosition.y - trackY) / ACTION_LOG_TRACK_HEIGHT,
            0,
            1,
        );
        this.requestScrollOffset(Math.round(progress * maxOffset));
    }

    private handleActionHistoryWheel(
        pointer: Phaser.Input.Pointer,
        _gameObjects: Phaser.GameObjects.GameObject[],
        _deltaX: number,
        deltaY: number,
    ): void {
        if (!this.actionHistoryExpanded || !this.lastState) return;

        const worldPosition = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const left = getHudLeftX(this.scene);
        const top = getHudTopY(this.scene, ACTION_LOG_TOP_OFFSET);
        if (
            worldPosition.x < left ||
            worldPosition.x > left + ACTION_LOG_WIDTH ||
            worldPosition.y < top ||
            worldPosition.y > top + ACTION_LOG_HEIGHT
        ) {
            return;
        }

        this.requestScrollOffset(
            Phaser.Math.Clamp(
                this.lastState.actionHistoryScrollOffset + Math.sign(deltaY),
                0,
                getMaxScrollOffset(this.lastState.actionHistory.length),
            ),
        );
    }

    private requestScrollOffset(offset: number): void {
        if (this.lastState && offset !== this.lastState.actionHistoryScrollOffset) {
            this.lastActions?.scrollActionHistory(offset);
        }
    }
}
