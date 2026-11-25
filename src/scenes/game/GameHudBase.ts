import Phaser from "phaser";
import { getInvokedMonsterCount } from "../../game/matchRules";
import type { PlayerId } from "../../types/GameTypes";
import type { GameViewState } from "./GameViewState";
import {
    HUD_BUTTON_HEIGHT,
    HUD_BUTTON_WIDTH,
    getHudLeftX,
    getHudRightX,
    getHudTopY,
} from "./hudLayout";
import type { ButtonOptions, GameHudActions, RectStroke } from "./hudTypes";
import { PLAYER_COLORS, arialStyle, onPointerDown } from "./uiStyle";

const MENU_BUTTON_WIDTH = 96;
const RIGHT_INSTRUCTION_WIDTH = 280;
const HEALTH_PANEL_WIDTH = 220;
const HEALTH_PANEL_HEIGHT = 88;
const HEALTH_PANEL_GAP = 16;

function getButtonColors(enabled: boolean, muted: boolean) {
    if (!enabled) return { color: "#89919b", backgroundColor: "#343b44", hoverColor: "#343b44" };
    if (muted) return { color: "#aeb5bd", backgroundColor: "#555d68", hoverColor: "#68727e" };
    return { color: "#ffffff", backgroundColor: "#a45e39", hoverColor: "#c47b4e" };
}

export abstract class GameHudBase {
    protected readonly scene: Phaser.Scene;

    protected readonly container: Phaser.GameObjects.Container;

    protected lastState: GameViewState | null = null;

    protected lastActions: GameHudActions | null = null;

    protected draggingActionHistory = false;

    protected constructor(scene: Phaser.Scene, container: Phaser.GameObjects.Container) {
        this.scene = scene;
        this.container = container;
    }

    render(state: GameViewState, actions: GameHudActions): void {
        this.lastState = state;
        this.lastActions = actions;
        actions.hoverInvocationMonster(null, this.scene.input.activePointer);
        this.container.removeAll(true);
        this.renderStatus(state, actions);
        this.renderPlayerHealth(state);
        this.renderActionHistory(state);

        if (state.winner !== null) {
            this.renderGameOver(state.winner);
            return;
        }

        this.renderTurnControls(state, actions);
        this.renderDiceAndReserves(state, actions);
        this.renderPatternSelector(state, actions);
    }

    private renderStatus(state: GameViewState, actions: GameHudActions): void {
        const camera = this.scene.cameras.main;
        const statusTextScale = 1 / camera.zoom;
        const fontSize = (camera.zoom < 0.75 ? 15 : 18) * 1.5 * statusTextScale;
        const x = getHudLeftX(this.scene);
        const playerLabel =
            state.computerOpponent && state.currentPlayer === 2
                ? "ORDINATEUR"
                : `JOUEUR ${state.currentPlayer}`;
        this.addText(
            playerLabel,
            x,
            getHudTopY(this.scene, 4),
            PLAYER_COLORS[state.currentPlayer].css,
            fontSize,
        );
        this.addText(
            `TOUR ${state.turnNumber}`,
            x,
            getHudTopY(this.scene, 36),
            "#aab5c2",
            fontSize,
        );
        this.addButton("MENU", x, getHudTopY(this.scene, 70), actions.leaveGame, {
            uniformSize: true,
            centerVertically: true,
            fontSize: 15,
            width: MENU_BUTTON_WIDTH,
            height: 32,
        });
    }

    private renderTurnControls(state: GameViewState, actions: GameHudActions): void {
        const x = getHudRightX(this.scene);
        const y = getHudTopY(this.scene, 12);
        if (state.onlineGame && !state.isLocalTurn) {
            this.addButton("TOUR DE L’ADVERSAIRE", x, y, actions.rollDice, {
                rightAligned: true,
                uniformSize: true,
                enabled: false,
                width: 220,
            });
        } else if (!state.hasRolled) {
            this.addButton("LANCER LES DES", x, y, actions.rollDice, {
                rightAligned: true,
                uniformSize: true,
                enabled: state.actionMode.type === "idle",
            });
        } else {
            this.renderMonsterSelection(state, actions);
        }
    }

    protected renderPlayerHealth(state: GameViewState): void {
        const center = this.scene.cameras.main.getWorldPoint(this.scene.scale.width / 2, 0);
        const y = getHudTopY(this.scene, 4);
        for (const player of [1, 2] as const) {
            const x =
                player === 1
                    ? center.x - HEALTH_PANEL_WIDTH - HEALTH_PANEL_GAP / 2
                    : center.x + HEALTH_PANEL_GAP / 2;
            const { css, hex } = PLAYER_COLORS[player];
            this.addRect(x, y, HEALTH_PANEL_WIDTH, HEALTH_PANEL_HEIGHT, 0x202a36, 1, [
                2,
                hex,
                0.75,
            ]);

            const currentHealth = Phaser.Math.Clamp(
                state.playerHealth[player],
                0,
                state.playerMaxHealth,
            );
            const remainingToInvoke = Math.max(
                0,
                state.maxMonstersPerPlayer - getInvokedMonsterCount(state.placedMonsters, player),
            );
            const defeatedOpponentMonsters = state.placedMonsters.filter(
                (monster) => monster.owner !== player && monster.currentHp <= 0,
            ).length;
            const lines: ReadonlyArray<readonly [string, string]> = [
                [`J${player} - PV ${currentHealth}/${state.playerMaxHealth}`, css],
                [`À invoquer : ${remainingToInvoke}/${state.maxMonstersPerPlayer}`, "#cbd2da"],
                [
                    `Monstres tués : ${defeatedOpponentMonsters}/${state.monstersKilledForVictory}`,
                    "#cbd2da",
                ],
            ];
            lines.forEach(([label, color], index) =>
                this.addText(label, x + 8, y + 4 + index * 26, color, 20),
            );
        }
    }

    protected renderGameOver(winner: PlayerId): void {
        const center = this.scene.cameras.main.getWorldPoint(
            this.scene.scale.width / 2,
            this.scene.scale.height / 2,
        );
        const x = center.x - 210;
        const y = center.y - 50;
        const { css, hex } = PLAYER_COLORS[winner];
        this.addRect(x, y, 420, 100, 0x151b25, 0.95, [2, hex]);
        this.addText(`JOUEUR ${winner} A GAGNÉ !`, x + 210, y + 50, css, 26).setOrigin(0.5);
    }

    protected addRect(
        x: number,
        y: number,
        width: number,
        height: number,
        fillColor: number,
        fillAlpha = 1,
        stroke?: RectStroke,
    ): Phaser.GameObjects.Rectangle {
        const rectangle = this.scene.add
            .rectangle(x, y, width, height, fillColor, fillAlpha)
            .setOrigin(0);
        if (stroke) rectangle.setStrokeStyle(...stroke);
        this.container.add(rectangle);
        return rectangle;
    }

    protected addStyledText(
        x: number,
        y: number,
        label: string,
        style: Phaser.Types.GameObjects.Text.TextStyle,
    ): Phaser.GameObjects.Text {
        const text = this.scene.add.text(x, y, label, style);
        this.container.add(text);
        return text;
    }

    protected addText(
        label: string,
        x: number,
        y: number,
        color: string,
        size: number,
    ): Phaser.GameObjects.Text {
        return this.addStyledText(x, y, label, arialStyle(size, color, { fontStyle: "bold" }));
    }

    protected addRightInstruction(label: string, y: number): Phaser.GameObjects.Text {
        return this.addStyledText(
            getHudRightX(this.scene),
            y,
            label,
            arialStyle(16, "#f1cf65", {
                fontStyle: "bold",
                align: "right",
                wordWrap: { width: RIGHT_INSTRUCTION_WIDTH },
            }),
        ).setOrigin(1, 0);
    }

    protected addInstructionWithCancel(label: string, y: number, cancel: () => void): void {
        const instruction = this.addRightInstruction(label, y);
        this.addButton("ANNULER", getHudRightX(this.scene), y + instruction.height + 8, cancel, {
            rightAligned: true,
        });
    }

    protected addButton(
        label: string,
        x: number,
        y: number,
        callback: () => void,
        options: ButtonOptions = {},
    ): void {
        const {
            enabled = true,
            rightAligned = false,
            muted = false,
            uniformSize = false,
            centerVertically = false,
            fontSize = 16,
            width = HUD_BUTTON_WIDTH,
            height = HUD_BUTTON_HEIGHT,
        } = options;
        const verticalPadding = centerVertically ? Math.max(0, Math.floor((height - 18) / 2)) : 7;
        const { color, backgroundColor, hoverColor } = getButtonColors(enabled, muted);
        const button = this.scene.add.text(
            x,
            y,
            label,
            arialStyle(fontSize, color, {
                backgroundColor,
                align: uniformSize ? "center" : "left",
                padding: uniformSize ? { x: 6, y: verticalPadding } : { x: 10, y: 8 },
            }),
        );
        if (uniformSize) button.setFixedSize(width, height);
        if (rightAligned) button.setOrigin(1, 0);
        if (enabled) {
            button.setInteractive({ useHandCursor: true });
            button.on("pointerover", () => button.setStyle({ backgroundColor: hoverColor }));
            button.on("pointerout", () => button.setStyle({ backgroundColor }));
            onPointerDown(button, () => callback());
        }
        this.container.add(button);
    }

    protected abstract renderActionHistory(state: GameViewState): void;
    protected abstract renderMonsterSelection(state: GameViewState, actions: GameHudActions): void;
    protected abstract renderDiceAndReserves(state: GameViewState, actions: GameHudActions): void;
    protected abstract renderPatternSelector(state: GameViewState, actions: GameHudActions): void;
}
