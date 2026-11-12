import { GameHudBase } from "./GameHudBase";
import { ACTION_LOG_X, ACTION_LOG_Y, ACTION_LOG_WIDTH, ACTION_LOG_HEIGHT, ACTION_LOG_ROW_HEIGHT, ACTION_LOG_TRACK_X, ACTION_LOG_TRACK_Y, ACTION_LOG_TRACK_HEIGHT, ACTION_LOG_THUMB_MIN_HEIGHT, ACTION_LOG_VISIBLE_COUNT } from "./GameHudBase";
import Phaser from "phaser";
import type { GameViewState } from "./GameViewState";
import type { GameHudActions } from "./GameHudBase";

export abstract class GameHudHistory extends GameHudBase {
    protected renderActionHistory(state: GameViewState): void {
        const panel = this.scene.add
            .rectangle(
                ACTION_LOG_X,
                ACTION_LOG_Y,
                ACTION_LOG_WIDTH,
                ACTION_LOG_HEIGHT,
                0x151b25,
                0.9,
            )
            .setOrigin(0)
            .setStrokeStyle(1, 0x465367);
        this.container.add(panel);

        this.addText("HISTORIQUE", ACTION_LOG_X + 12, ACTION_LOG_Y + 10, "#f0c974", 15);
        if (state.actionHistory.length === 0) {
            this.addText(
                "Les actions jouées apparaîtront ici.",
                ACTION_LOG_X + 12,
                ACTION_LOG_Y + 42,
                "#aab5c2",
                12,
            );
            return;
        }

        if (state.actionHistory.length > ACTION_LOG_VISIBLE_COUNT) {
            this.renderActionHistoryScrollbar(state);
        }
        const entries = [...state.actionHistory]
            .reverse()
            .slice(
                state.actionHistoryScrollOffset,
                state.actionHistoryScrollOffset + ACTION_LOG_VISIBLE_COUNT,
            );
        entries.forEach((entry, index) => {
            const y = ACTION_LOG_Y + 38 + index * ACTION_LOG_ROW_HEIGHT;
            const color = entry.player === 1 ? 0xff8d78 : 0x70bdff;
            const background = this.scene.add
                .rectangle(
                    ACTION_LOG_X + 8,
                    y,
                    ACTION_LOG_WIDTH - 24,
                    ACTION_LOG_ROW_HEIGHT - 4,
                    0x202a36,
                    1,
                )
                .setOrigin(0)
                .setStrokeStyle(1, color, 0.45);
            this.container.add(background);

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
            this.addText(
                `J${entry.player} · ${actionLabel}`,
                ACTION_LOG_X + 16,
                y + 5,
                entry.player === 1 ? "#ff9d8b" : "#83c6ff",
                11,
            );

            let description: string;
            switch (entry.type) {
                case "invocation":
                    description = `${entry.monsterName} · coût : ${entry.cost}`;
                    break;
                case "movement":
                    description = `${entry.monsterName} · ${entry.distance} case${entry.distance > 1 ? "s" : ""}`;
                    break;
                case "attack":
                    description = `${entry.attackerName} → ${entry.targetName} · ${entry.damage} dégât${entry.damage > 1 ? "s" : ""}`;
                    break;
            }
            const details = this.scene.add.text(ACTION_LOG_X + 16, y + 23, description, {
                fontFamily: "Arial",
                fontSize: "11px",
                color: "#e6edf5",
                wordWrap: { width: ACTION_LOG_WIDTH - 32 },
                maxLines: 2,
            });
            this.container.add(details);
        });

        if (state.actionHistory.length > ACTION_LOG_VISIBLE_COUNT) {
            this.addText(
                "Molette : parcourir l’historique",
                ACTION_LOG_X + 12,
                ACTION_LOG_Y + ACTION_LOG_HEIGHT - 20,
                "#aab5c2",
                10,
            );
        }
    }

    protected renderActionHistoryScrollbar(state: GameViewState): void {
        const track = this.scene.add
            .rectangle(
                ACTION_LOG_TRACK_X,
                ACTION_LOG_TRACK_Y,
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
                this.scrollActionHistoryAt(pointer.y);
            },
        );
        this.container.add(track);

        const maxOffset = Math.max(0, state.actionHistory.length - ACTION_LOG_VISIBLE_COUNT);
        const thumbHeight = Math.max(
            ACTION_LOG_THUMB_MIN_HEIGHT,
            (ACTION_LOG_TRACK_HEIGHT * ACTION_LOG_VISIBLE_COUNT) / state.actionHistory.length,
        );
        const thumbY =
            ACTION_LOG_TRACK_Y +
            (maxOffset === 0
                ? 0
                : (state.actionHistoryScrollOffset / maxOffset) *
                  (ACTION_LOG_TRACK_HEIGHT - thumbHeight));
        const thumb = this.scene.add
            .rectangle(ACTION_LOG_TRACK_X - 1, thumbY, 8, thumbHeight, 0xf0c974, 1)
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
                this.scrollActionHistoryAt(pointer.y);
            },
        );
        this.container.add(thumb);
    }

    protected handleActionHistoryDrag(pointer: Phaser.Input.Pointer): void {
        if (this.draggingActionHistory) this.scrollActionHistoryAt(pointer.y);
    }

    protected stopActionHistoryDrag(): void {
        this.draggingActionHistory = false;
    }

    protected scrollActionHistoryAt(pointerY: number): void {
        if (!this.lastState || !this.lastActions) return;

        const maxOffset = Math.max(
            0,
            this.lastState.actionHistory.length - ACTION_LOG_VISIBLE_COUNT,
        );
        if (maxOffset === 0) return;

        const progress = Phaser.Math.Clamp(
            (pointerY - ACTION_LOG_TRACK_Y) / ACTION_LOG_TRACK_HEIGHT,
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
        if (
            !this.lastState ||
            !this.lastActions ||
            pointer.x < ACTION_LOG_X ||
            pointer.x > ACTION_LOG_X + ACTION_LOG_WIDTH ||
            pointer.y < ACTION_LOG_Y ||
            pointer.y > ACTION_LOG_Y + ACTION_LOG_HEIGHT
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
