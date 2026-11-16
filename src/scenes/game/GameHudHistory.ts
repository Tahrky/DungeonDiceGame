import { GameHudBase } from "./GameHudBase";
import {
    ACTION_LOG_TOP_OFFSET,
    ACTION_LOG_WIDTH,
    ACTION_LOG_HEIGHT,
    ACTION_LOG_TRACK_OFFSET_X,
    ACTION_LOG_TRACK_HEIGHT,
    ACTION_LOG_THUMB_MIN_HEIGHT,
    ACTION_LOG_VISIBLE_COUNT,
    ACTION_LOG_TOGGLE_WIDTH,
    getHudTopY,
    getHudLeftX,
} from "./GameHudBase";
import Phaser from "phaser";
import type { GameViewState } from "./GameViewState";
import type { GameHudActions } from "./GameHudBase";

export abstract class GameHudHistory extends GameHudBase {
    private actionHistoryExpanded = true;

    protected renderActionHistory(state: GameViewState): void {
        const toggleX = getHudLeftX(this.scene);
        const actionLogY = getHudTopY(this.scene, ACTION_LOG_TOP_OFFSET);
        if (!this.actionHistoryExpanded) {
            this.renderCollapsedHistoryToggle(toggleX, actionLogY);
            return;
        }

        const actionLogX = toggleX;
        const panel = this.scene.add
            .rectangle(
                actionLogX,
                actionLogY,
                ACTION_LOG_WIDTH,
                ACTION_LOG_HEIGHT,
                0x151b25,
                0.9,
            )
            .setOrigin(0)
            .setStrokeStyle(2, 0x465367);
        this.container.add(panel);

        const heading = this.addText(
            "HISTORIQUE",
            actionLogX + 12,
            actionLogY + 10,
            "#f0c974",
            18,
        );
        heading.setInteractive({ useHandCursor: true });
        heading.on("pointerover", () => heading.setStyle({ color: "#fff0c8" }));
        heading.on("pointerout", () => heading.setStyle({ color: "#f0c974" }));
        heading.on(
            "pointerdown",
            (
                _pointer: Phaser.Input.Pointer,
                _localX: number,
                _localY: number,
                event: Phaser.Types.Input.EventData,
            ) => {
                event.stopPropagation();
                this.setActionHistoryExpanded(false);
            },
        );
        if (state.actionHistory.length === 0) {
            const emptyMessage = this.scene.add.text(
                actionLogX + 12,
                actionLogY + 42,
                "Les actions jouées apparaîtront ici.",
                {
                    fontFamily: "Arial",
                    fontSize: "14px",
                    color: "#aab5c2",
                    wordWrap: { width: ACTION_LOG_WIDTH - 24 },
                },
            );
            this.container.add(emptyMessage);
            return;
        }

        if (state.actionHistory.length > ACTION_LOG_VISIBLE_COUNT) {
            this.renderActionHistoryScrollbar(state, actionLogX, actionLogY);
        }
        const entries = [...state.actionHistory]
            .reverse()
            .slice(
                state.actionHistoryScrollOffset,
                state.actionHistoryScrollOffset + ACTION_LOG_VISIBLE_COUNT,
            );
        let entryY = actionLogY + 38;
        entries.forEach((entry) => {
            const color = entry.player === 1 ? 0xff8d78 : 0x70bdff;
            let actionLabel: string;
            switch (entry.type) {
                case "invocation":
                    actionLabel = "INVOCATION";
                    break;
                case "movement":
                    actionLabel = "DÉPLACEMENT";
                    break;
                case "attack":
                    actionLabel = "ATTAQUE";
                    break;
            }
            let description: string;
            switch (entry.type) {
                case "invocation":
                    description = `${entry.monsterName} · coût : ${entry.cost}`;
                    break;
                case "movement":
                    description = `${entry.monsterName} · ${entry.distance} case${entry.distance > 1 ? "s" : ""}`;
                    break;
                case "attack":
                    description = `${entry.attackerName} → ${entry.targetName} · ${entry.effect ?? `${entry.damage} dégât${entry.damage > 1 ? "s" : ""}`}`;
                    break;
            }
            const detailsStyle = {
                fontFamily: "Arial",
                fontSize: "12px",
                color: "#e6edf5",
                wordWrap: { width: ACTION_LOG_WIDTH - 40 },
                maxLines: 2,
            };
            const measuredDetails = this.scene.make.text({
                x: 0,
                y: 0,
                text: description,
                style: detailsStyle,
                add: false,
            });
            const rowHeight = Phaser.Math.Clamp(measuredDetails.height + 26, 44, 54);
            measuredDetails.destroy();
            const background = this.scene.add
                .rectangle(
                    actionLogX + 8,
                    entryY,
                    ACTION_LOG_WIDTH - 24,
                    rowHeight - 2,
                    0x202a36,
                    1,
                )
                .setOrigin(0)
                .setStrokeStyle(2, color, 0.7);
            this.container.add(background);

            this.addText(
                `J${entry.player} · ${actionLabel}`,
                actionLogX + 16,
                entryY + 4,
                entry.player === 1 ? "#ff9d8b" : "#83c6ff",
                12,
            );
            const details = this.scene.add.text(
                actionLogX + 16,
                entryY + 20,
                description,
                detailsStyle,
            );
            this.container.add(details);
            entryY += rowHeight + 2;
        });

        if (state.actionHistory.length > ACTION_LOG_VISIBLE_COUNT) {
            const scrollHint = this.scene.add.text(
                actionLogX + 12,
                actionLogY + ACTION_LOG_HEIGHT - 30,
                "Molette : parcourir l’historique",
                {
                    fontFamily: "Arial",
                    fontSize: "11px",
                    color: "#aab5c2",
                    wordWrap: { width: ACTION_LOG_WIDTH - 24 },
                    maxLines: 2,
                },
            );
            this.container.add(scrollHint);
        }
    }

    private renderCollapsedHistoryToggle(x: number, actionLogY: number): void {
        const height = 160;
        const y = actionLogY + (ACTION_LOG_HEIGHT - height) / 2;
        const background = this.scene.add
            .rectangle(x, y, ACTION_LOG_TOGGLE_WIDTH, height, 0xa45e39, 1)
            .setOrigin(0)
            .setStrokeStyle(1, 0xc47b4e)
            .setInteractive({ useHandCursor: true });
        const label = this.scene.add
            .text(
                x + ACTION_LOG_TOGGLE_WIDTH / 2,
                y + height / 2,
                "HISTORIQUE",
                {
                    fontFamily: "Arial",
                    fontSize: "15px",
                    color: "#ffffff",
                    fontStyle: "bold",
                },
            )
            .setOrigin(0.5)
            .setRotation(-Math.PI / 2);
        this.container.add([background, label]);
        background.on("pointerover", () => background.setFillStyle(0xc47b4e, 1));
        background.on("pointerout", () => background.setFillStyle(0xa45e39, 1));
        background.on(
            "pointerdown",
            (
                _pointer: Phaser.Input.Pointer,
                _localX: number,
                _localY: number,
                event: Phaser.Types.Input.EventData,
            ) => {
                event.stopPropagation();
                this.setActionHistoryExpanded(true);
            },
        );
    }

    private setActionHistoryExpanded(expanded: boolean): void {
        if (this.actionHistoryExpanded === expanded) return;
        this.actionHistoryExpanded = expanded;
        this.draggingActionHistory = false;
        if (this.lastState && this.lastActions) {
            this.render(this.lastState, this.lastActions);
        }
    }

    protected renderActionHistoryScrollbar(
        state: GameViewState,
        actionLogX: number,
        actionLogY: number,
    ): void {
        const trackX = actionLogX + ACTION_LOG_TRACK_OFFSET_X;
        const trackY = actionLogY + 38;
        const track = this.scene.add
            .rectangle(
                trackX,
                trackY,
                6,
                ACTION_LOG_TRACK_HEIGHT,
                0x354352,
                1,
            )
            .setOrigin(0);
        track.setInteractive({ useHandCursor: true });
        track.on(
            "pointerdown",
            (
                pointer: Phaser.Input.Pointer,
                _localX: number,
                _localY: number,
                event: Phaser.Types.Input.EventData,
            ) => {
                event.stopPropagation();
                this.draggingActionHistory = true;
                this.scrollActionHistoryAt(pointer);
            },
        );
        this.container.add(track);

        const maxOffset = Math.max(0, state.actionHistory.length - ACTION_LOG_VISIBLE_COUNT);
        const thumbHeight = Math.max(
            ACTION_LOG_THUMB_MIN_HEIGHT,
            (ACTION_LOG_TRACK_HEIGHT * ACTION_LOG_VISIBLE_COUNT) / state.actionHistory.length,
        );
        const thumbY =
            trackY +
            (maxOffset === 0
                ? 0
                : (state.actionHistoryScrollOffset / maxOffset) *
                  (ACTION_LOG_TRACK_HEIGHT - thumbHeight));
        const thumb = this.scene.add
            .rectangle(trackX - 1, thumbY, 8, thumbHeight, 0xf0c974, 1)
            .setOrigin(0);
        thumb.setInteractive({ useHandCursor: true });
        thumb.on(
            "pointerdown",
            (
                pointer: Phaser.Input.Pointer,
                _localX: number,
                _localY: number,
                event: Phaser.Types.Input.EventData,
            ) => {
                event.stopPropagation();
                this.draggingActionHistory = true;
                this.scrollActionHistoryAt(pointer);
            },
        );
        this.container.add(thumb);
    }

    protected handleActionHistoryDrag(pointer: Phaser.Input.Pointer): void {
        if (this.draggingActionHistory) this.scrollActionHistoryAt(pointer);
    }

    protected stopActionHistoryDrag(): void {
        this.draggingActionHistory = false;
    }

    protected scrollActionHistoryAt(pointer: Phaser.Input.Pointer): void {
        if (!this.actionHistoryExpanded || !this.lastState || !this.lastActions) return;

        const maxOffset = Math.max(
            0,
            this.lastState.actionHistory.length - ACTION_LOG_VISIBLE_COUNT,
        );
        if (maxOffset === 0) return;

        const pointerPosition = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const trackY = getHudTopY(this.scene, ACTION_LOG_TOP_OFFSET) + 38;
        const progress = Phaser.Math.Clamp(
            (pointerPosition.y - trackY) / ACTION_LOG_TRACK_HEIGHT,
            0,
            1,
        );
        const nextOffset = Math.round(progress * maxOffset);
        if (nextOffset !== this.lastState.actionHistoryScrollOffset) {
            this.lastActions.scrollActionHistory(nextOffset);
        }
    }

    protected handleActionHistoryWheel(
        pointer: Phaser.Input.Pointer,
        _gameObjects: Phaser.GameObjects.GameObject[],
        _deltaX: number,
        deltaY: number,
    ): void {
        const worldPosition = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const actionLogX = getHudLeftX(this.scene);
        if (
            !this.actionHistoryExpanded ||
            !this.lastState ||
            !this.lastActions ||
            worldPosition.x < actionLogX ||
            worldPosition.x > actionLogX + ACTION_LOG_WIDTH ||
            worldPosition.y < getHudTopY(this.scene, ACTION_LOG_TOP_OFFSET) ||
            worldPosition.y >
                getHudTopY(this.scene, ACTION_LOG_TOP_OFFSET) + ACTION_LOG_HEIGHT
        ) {
            return;
        }

        const maxOffset = Math.max(
            0,
            this.lastState.actionHistory.length - ACTION_LOG_VISIBLE_COUNT,
        );
        const nextOffset = Phaser.Math.Clamp(
            this.lastState.actionHistoryScrollOffset + Math.sign(deltaY),
            0,
            maxOffset,
        );
        if (nextOffset !== this.lastState.actionHistoryScrollOffset) {
            this.lastActions.scrollActionHistory(nextOffset);
        }
    }

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

    protected abstract renderMonsterSelection(state: GameViewState, actions: GameHudActions): void;
    protected abstract renderDiceAndReserves(state: GameViewState, actions: GameHudActions): void;
    protected abstract renderPatternSelector(state: GameViewState, actions: GameHudActions): void;
}
