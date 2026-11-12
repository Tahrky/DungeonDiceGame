import Phaser from "phaser";
import { GAME_CONFIG } from "../../config";
import { PLACEMENT_PATTERNS } from "../../data/placementPatterns";
import { getInvokedMonsterCount } from "../../game/matchRules";
import type { GameViewState } from "./GameViewState";
import type { Monster, PlayerId } from "../../types/GameTypes";

export interface GameHudActions {
    rollDice: () => void;
    selectMonster: (monsterId: string) => void;
    selectPattern: (index: number) => void;
    rotatePattern: () => void;
    mirrorPattern: () => void;
    togglePatternSelector: () => void;
    toggleInvocationMenu: () => void;
    cancelInvocation: () => void;
    hoverInvocationMonster: (monster: Monster | null, pointer: Phaser.Input.Pointer) => void;
    storeDie: (dieIndex: number) => void;
    startAttack: () => void;
    selectAttack: (attackIndex: number) => void;
    startMovement: () => void;
    cancelBoardAction: () => void;
    finishTurn: () => void;
    leaveGame: () => void;
    scrollActionHistory: (offset: number) => void;
}

export interface ButtonOptions {
    enabled?: boolean;
    rightAligned?: boolean;
    muted?: boolean;
    uniformSize?: boolean;
    width?: number;
    height?: number;
}

export interface IconButtonOptions {
    icon: string;
    tooltip: string;
    x: number;
    y: number;
    enabled: boolean;
    active: boolean;
    callback: () => void;
}

export const PATTERN_COLUMNS = 4;

export const PATTERN_CARD_WIDTH = 120;

export const PATTERN_CARD_HEIGHT = 40;

export const PATTERN_COLUMN_GAP = 126;

export const PATTERN_ROW_GAP = 44;

export const HUD_BOTTOM = 752;

export const PATTERN_GRID_WIDTH =
    PATTERN_COLUMNS * PATTERN_CARD_WIDTH +
    (PATTERN_COLUMNS - 1) * (PATTERN_COLUMN_GAP - PATTERN_CARD_WIDTH);

export function getPatternStartX(scene: Phaser.Scene): number {
    return getHudRightX(scene) - PATTERN_GRID_WIDTH;
}

export const HUD_EDGE_MARGIN = 12;

export function getHudLeftX(scene: Phaser.Scene): number {
    return scene.cameras.main.getWorldPoint(HUD_EDGE_MARGIN, 0).x;
}

export function getHudRightX(scene: Phaser.Scene): number {
    return scene.cameras.main.getWorldPoint(scene.scale.width - HUD_EDGE_MARGIN, 0).x;
}

export const PATTERN_ROW_COUNT = Math.ceil((PLACEMENT_PATTERNS.length + 1) / PATTERN_COLUMNS);

export const PATTERN_GRID_HEIGHT = PATTERN_CARD_HEIGHT + (PATTERN_ROW_COUNT - 1) * PATTERN_ROW_GAP;

export const PATTERN_START_Y = HUD_BOTTOM - PATTERN_GRID_HEIGHT;

export const COLLAPSED_PATTERN_Y = HUD_BOTTOM - PATTERN_CARD_HEIGHT;

export const HUD_BUTTON_WIDTH = 170;

export const HUD_BUTTON_HEIGHT = 32;

export const INVOCATION_PANEL_WIDTH = HUD_BUTTON_WIDTH;

export const INVOCATION_ROW_HEIGHT = 30;

export const INVOCATION_ROW_GAP = 34;

export const ACTION_PANEL_Y = 54;

export const ACTION_LOG_Y = 142;

export const ACTION_LOG_WIDTH = 228;

export const ACTION_LOG_HEIGHT = 438;

export const ACTION_LOG_ROW_HEIGHT = 62;

export const ACTION_LOG_TRACK_OFFSET_X = ACTION_LOG_WIDTH - 10;

export const ACTION_LOG_TRACK_Y = ACTION_LOG_Y + 38;

export const ACTION_LOG_TRACK_HEIGHT = ACTION_LOG_HEIGHT - 68;

export const ACTION_LOG_THUMB_MIN_HEIGHT = 24;

export const ACTION_LOG_VISIBLE_COUNT = 6;

const HUD_STATUS_X = 12;
const MENU_BUTTON_WIDTH = 99;
const MENU_BUTTON_HEIGHT = 30;
const MENU_BUTTON_GAP = 10;
const RIGHT_INSTRUCTION_WIDTH = 280;

export abstract class GameHudBase {
    protected readonly scene: Phaser.Scene;

    protected readonly container: Phaser.GameObjects.Container;

    protected previousActionCount = 0;

    protected lastState: GameViewState | null = null;

    protected lastActions: GameHudActions | null = null;

    protected draggingActionHistory = false;

    render(state: GameViewState, actions: GameHudActions): void {
        if (state.actionHistory.length !== this.previousActionCount) {
            this.previousActionCount = state.actionHistory.length;
        }
        this.lastState = state;
        this.lastActions = actions;
        actions.hoverInvocationMonster(null, this.scene.input.activePointer);
        this.container.removeAll(true);
        this.addButton(
            "MENU",
            getHudLeftX(this.scene),
            ACTION_LOG_Y - MENU_BUTTON_HEIGHT - MENU_BUTTON_GAP,
            actions.leaveGame,
            {
                uniformSize: true,
                width: MENU_BUTTON_WIDTH,
                height: MENU_BUTTON_HEIGHT,
            },
        );

        const playerColor = state.currentPlayer === 1 ? "#ff8d78" : "#70bdff";
        const playerLabel =
            state.computerOpponent && state.currentPlayer === 2
                ? "ORDINATEUR"
                : `JOUEUR ${state.currentPlayer}`;
        const camera = this.scene.cameras.main;
        const statusTextScale = 1 / camera.zoom;
        const compactStatus = camera.zoom < 0.75;
        const playerLabelPosition = camera.getWorldPoint(HUD_STATUS_X, compactStatus ? 12 : 16);
        const statusPosition = camera.getWorldPoint(HUD_STATUS_X, compactStatus ? 32 : 46);
        const turnPosition = camera.getWorldPoint(HUD_STATUS_X, 64);
        if (compactStatus) {
            this.addText(
                `${playerLabel} · TOUR ${state.turnNumber}`,
                playerLabelPosition.x,
                playerLabelPosition.y,
                playerColor,
                14 * statusTextScale,
            );
            this.addText(
                state.hasRolled ? "Dés lancés" : "En attente du lancer de dés",
                statusPosition.x,
                statusPosition.y,
                "#ffffff",
                12 * statusTextScale,
            );
        } else {
            this.addText(
                playerLabel,
                playerLabelPosition.x,
                playerLabelPosition.y,
                playerColor,
                22 * statusTextScale,
            );
            this.addText(
                state.hasRolled ? "Dés lancés" : "En attente du lancer de dés",
                statusPosition.x,
                statusPosition.y,
                "#ffffff",
                15 * statusTextScale,
            );
            this.addText(
                `TOUR ${state.turnNumber}`,
                turnPosition.x,
                turnPosition.y,
                "#aab5c2",
                12 * statusTextScale,
            );
        }
        this.renderPlayerHealth(state);
        this.renderActionHistory(state);

        if (state.winner !== null) {
            this.renderGameOver(state.winner);
            return;
        }

        if (!state.hasRolled) {
            const waitingForOpponent = state.onlineGame && !state.isLocalTurn;
            this.addButton(
                waitingForOpponent ? "TOUR DE L’ADVERSAIRE" : "LANCER LES DES",
                getHudRightX(this.scene),
                12,
                actions.rollDice,
                {
                    rightAligned: true,
                    uniformSize: true,
                    enabled: !waitingForOpponent,
                    width: waitingForOpponent ? 220 : undefined,
                },
            );
        } else {
            this.renderMonsterSelection(state, actions);
        }

        this.renderDiceAndReserves(state, actions);
        this.renderPatternSelector(state, actions);
    }

    protected renderPlayerHealth(state: GameViewState): void {
        ([1, 2] as const).forEach((player) => {
            const start = state.startingPositions[player];
            const startScreenX =
                state.boardOrigin.x +
                ((start.x - start.y) * GAME_CONFIG.tileWidth) / 2;
            const startScreenY =
                state.boardOrigin.y +
                ((start.x + start.y) * GAME_CONFIG.tileHeight) / 2;
            const width = 200;
            const height = 100;
            const x = player === 1 ? startScreenX - width - 12 : startScreenX + 28;
            const y = player === 1 ? startScreenY - height - 12 : startScreenY + 20;
            const color = player === 1 ? "#ff8d78" : "#70bdff";
            const background = this.scene.add
                .rectangle(x, y, width, height, 0x202a36, 1)
                .setOrigin(0)
                .setStrokeStyle(2, player === 1 ? 0xff8d78 : 0x70bdff, 0.75);
            this.container.add(background);

            const bottomBorder = this.scene.add.graphics();
            bottomBorder.lineStyle(2, player === 1 ? 0xff8d78 : 0x70bdff, 0.75);
            bottomBorder.lineBetween(x, y + height, x + width, y + height);
            this.container.add(bottomBorder);

            const currentHealth = Phaser.Math.Clamp(
                state.playerHealth[player],
                0,
                state.playerMaxHealth,
            );
            const remainingToInvoke = Math.max(
                0,
                state.maxMonstersPerPlayer -
                    getInvokedMonsterCount(state.placedMonsters, player),
            );
            const defeatedOpponentMonsters = state.placedMonsters.filter(
                (monster) => monster.owner !== player && monster.currentHp <= 0,
            ).length;
            this.addText(`JOUEUR ${player}`, x + 12, y + 9, color, 16);
            this.addText(
                `PV : ${currentHealth}/${state.playerMaxHealth}`,
                x + 12,
                y + 31,
                color,
                20,
            );
            this.addText(
                `À invoquer : ${remainingToInvoke}/${state.maxMonstersPerPlayer}`,
                x + 12,
                y + 61,
                "#cbd2da",
                13,
            );
            this.addText(
                `Monstres tués : ${defeatedOpponentMonsters}`,
                x + 12,
                y + 79,
                "#cbd2da",
                13,
            );
        });
    }

    protected renderGameOver(winner: PlayerId): void {
        const x = 510;
        const y = 590;
        const background = this.scene.add
            .rectangle(x, y, 420, 100, 0x151b25, 0.95)
            .setOrigin(0)
            .setStrokeStyle(2, winner === 1 ? 0xff8d78 : 0x70bdff);
        this.container.add(background);
        const message = this.scene.add
            .text(x + 210, y + 50, `JOUEUR ${winner} A GAGNÉ !`, {
                fontFamily: "Arial",
                fontSize: "26px",
                color: winner === 1 ? "#ff8d78" : "#70bdff",
                fontStyle: "bold",
            })
            .setOrigin(0.5);
        this.container.add(message);
    }

    protected addText(
        label: string,
        x: number,
        y: number,
        color: string,
        size: number,
    ): Phaser.GameObjects.Text {
        const text = this.scene.add.text(x, y, label, {
            fontFamily: "Arial",
            fontSize: `${size}px`,
            color,
            fontStyle: "bold",
        });
        this.container.add(text);
        return text;
    }

    protected addRightInstruction(label: string, y: number): Phaser.GameObjects.Text {
        const text = this.scene.add
            .text(getHudRightX(this.scene), y, label, {
                fontFamily: "Arial",
                fontSize: "14px",
                color: "#f1cf65",
                fontStyle: "bold",
                align: "right",
                wordWrap: { width: RIGHT_INSTRUCTION_WIDTH },
            })
            .setOrigin(1, 0);
        this.container.add(text);
        return text;
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
            width = HUD_BUTTON_WIDTH,
            height = HUD_BUTTON_HEIGHT,
        } = options;
        let color = "#ffffff";
        let backgroundColor = "#a45e39";
        if (!enabled) {
            color = "#89919b";
            backgroundColor = "#343b44";
        } else if (muted) {
            color = "#aeb5bd";
            backgroundColor = "#555d68";
        }
        const button = this.scene.add.text(x, y, label, {
            fontFamily: "Arial",
            fontSize: "15px",
            color,
            backgroundColor,
            align: uniformSize ? "center" : "left",
            padding: uniformSize ? { x: 6, y: 7 } : { x: 10, y: 8 },
        });
        if (uniformSize) button.setFixedSize(width, height);
        if (rightAligned) button.setOrigin(1, 0);
        if (!enabled) {
            this.container.add(button);
            return;
        }
        button.setInteractive({ useHandCursor: true });
        const hoverColor = muted ? "#68727e" : "#c47b4e";
        button.on("pointerover", () => button.setStyle({ backgroundColor: hoverColor }));
        button.on("pointerout", () => button.setStyle({ backgroundColor }));
        button.on(
            "pointerdown",
            (
                _pointer: Phaser.Input.Pointer,
                _localX: number,
                _localY: number,
                event: Phaser.Types.Input.EventData,
            ) => {
                event.stopPropagation();
                callback();
            },
        );
        this.container.add(button);
    }

    protected constructor(scene: Phaser.Scene, container: Phaser.GameObjects.Container) {
        this.scene = scene;
        this.container = container;
    }

    protected abstract renderActionHistory(state: GameViewState): void;
    protected abstract renderMonsterSelection(state: GameViewState, actions: GameHudActions): void;
    protected abstract renderDiceAndReserves(state: GameViewState, actions: GameHudActions): void;
    protected abstract renderPatternSelector(state: GameViewState, actions: GameHudActions): void;
}
