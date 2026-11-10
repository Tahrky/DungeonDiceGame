import Phaser from "phaser";

import { GAME_CONFIG } from "../../config";
import { DICE_SYMBOLS, DICE_SYMBOL_PRESENTATION } from "../../data/dice";
import { PLACEMENT_PATTERNS } from "../../data/placementPatterns";
import { getAvailableSymbolCount } from "../../game/diceResources";
import { getMovementCost } from "../../game/monsterActions";

import type { GameViewState } from "./GameViewState";
import type { Monster, MonsterAttack, PlayerId } from "../../types/GameTypes";

export interface GameHudActions {
    rollDice: () => void;
    selectMonster: (monsterId: string) => void;
    selectPattern: (index: number) => void;
    rotatePattern: () => void;
    mirrorPattern: () => void;
    togglePatternSelector: () => void;
    toggleInvocationMenu: () => void;
    hoverInvocationMonster: (monster: Monster | null, pointer: Phaser.Input.Pointer) => void;
    storeDie: (dieIndex: number) => void;
    startAttack: () => void;
    selectAttack: (attackIndex: number) => void;
    startMovement: () => void;
    cancelBoardAction: () => void;
    finishTurn: () => void;
    scrollActionHistory: (offset: number) => void;
}

interface ButtonOptions {
    enabled?: boolean;
    rightAligned?: boolean;
    muted?: boolean;
    uniformSize?: boolean;
    width?: number;
}

interface IconButtonOptions {
    icon: string;
    tooltip: string;
    x: number;
    y: number;
    enabled: boolean;
    active: boolean;
    callback: () => void;
}

const PATTERN_COLUMNS = 4;
const PATTERN_CARD_WIDTH = 120;
const PATTERN_CARD_HEIGHT = 40;
const PATTERN_COLUMN_GAP = 126;
const PATTERN_ROW_GAP = 44;
const HUD_RIGHT = 1280;
const HUD_BOTTOM = 752;
const PATTERN_START_X =
    HUD_RIGHT -
    PATTERN_COLUMNS * PATTERN_CARD_WIDTH -
    (PATTERN_COLUMNS - 1) * (PATTERN_COLUMN_GAP - PATTERN_CARD_WIDTH);
const PATTERN_ROW_COUNT = Math.ceil((PLACEMENT_PATTERNS.length + 1) / PATTERN_COLUMNS);
const PATTERN_GRID_HEIGHT = PATTERN_CARD_HEIGHT + (PATTERN_ROW_COUNT - 1) * PATTERN_ROW_GAP;
const PATTERN_START_Y = HUD_BOTTOM - PATTERN_GRID_HEIGHT;
const COLLAPSED_PATTERN_Y = HUD_BOTTOM - PATTERN_CARD_HEIGHT;
const HUD_BUTTON_WIDTH = 170;
const HUD_BUTTON_HEIGHT = 32;
const INVOCATION_PANEL_WIDTH = HUD_BUTTON_WIDTH;
const INVOCATION_PANEL_X = HUD_RIGHT - INVOCATION_PANEL_WIDTH;
const INVOCATION_ROW_HEIGHT = 30;
const INVOCATION_ROW_GAP = 34;
const ACTION_PANEL_Y = 54;
const ACTION_LOG_X = 12;
const ACTION_LOG_Y = 142;
const ACTION_LOG_WIDTH = 228;
const ACTION_LOG_HEIGHT = 438;
const ACTION_LOG_ROW_HEIGHT = 62;
const ACTION_LOG_TRACK_X = ACTION_LOG_X + ACTION_LOG_WIDTH - 10;
const ACTION_LOG_TRACK_Y = ACTION_LOG_Y + 38;
const ACTION_LOG_TRACK_HEIGHT = ACTION_LOG_HEIGHT - 68;
const ACTION_LOG_THUMB_MIN_HEIGHT = 24;
export const ACTION_LOG_VISIBLE_COUNT = 6;
const PLAYER_MAX_HEALTH = 3;

export class GameHud {
    private readonly scene: Phaser.Scene;
    private readonly container: Phaser.GameObjects.Container;
    private previousActionCount = 0;
    private lastState: GameViewState | null = null;
    private lastActions: GameHudActions | null = null;
    private draggingActionHistory = false;

    constructor(scene: Phaser.Scene, container: Phaser.GameObjects.Container) {
        this.scene = scene;
        this.container = container;
        this.scene.input.on("wheel", this.handleActionHistoryWheel, this);
        this.scene.input.on("pointermove", this.handleActionHistoryDrag, this);
        this.scene.input.on("pointerup", this.stopActionHistoryDrag, this);
        this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.scene.input.off("wheel", this.handleActionHistoryWheel, this);
            this.scene.input.off("pointermove", this.handleActionHistoryDrag, this);
            this.scene.input.off("pointerup", this.stopActionHistoryDrag, this);
        });
    }

    render(state: GameViewState, actions: GameHudActions): void {
        if (state.actionHistory.length !== this.previousActionCount) {
            this.previousActionCount = state.actionHistory.length;
        }
        this.lastState = state;
        this.lastActions = actions;
        actions.hoverInvocationMonster(null, this.scene.input.activePointer);
        this.container.removeAll(true);

        const playerColor = state.currentPlayer === 1 ? "#ff8d78" : "#70bdff";
        const playerLabel =
            state.computerOpponent && state.currentPlayer === 2
                ? "ORDINATEUR"
                : `JOUEUR ${state.currentPlayer}`;
        this.addText(playerLabel, 20, 12, playerColor, 22);
        this.addText(
            state.hasRolled ? "Trois dés lancés" : "En attente du lancer de dés",
            20,
            45,
            "#ffffff",
            15,
        );
        this.renderPlayerHealth(state.playerHealth);
        this.renderActionHistory(state);

        if (state.winner !== null) {
            this.renderGameOver(state.winner);
            return;
        }

        if (!state.hasRolled) {
            const waitingForOpponent = state.onlineGame && !state.isLocalTurn;
            this.addButton(
                waitingForOpponent ? "TOUR DE L’ADVERSAIRE" : "LANCER LES DES",
                HUD_RIGHT,
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

    private renderPlayerHealth(health: Record<PlayerId, number>): void {
        ([1, 2] as const).forEach((player, index) => {
            const x = 20 + index * 132;
            const color = player === 1 ? "#ff8d78" : "#70bdff";
            const background = this.scene.add
                .rectangle(x, 78, 120, 56, 0x202a36, 1)
                .setOrigin(0)
                .setStrokeStyle(1, player === 1 ? 0xff8d78 : 0x70bdff, 0.65);
            this.container.add(background);

            const bottomBorder = this.scene.add.graphics();
            bottomBorder.lineStyle(1, player === 1 ? 0xff8d78 : 0x70bdff, 0.65);
            bottomBorder.lineBetween(x, 134, x + 120, 134);
            this.container.add(bottomBorder);

            const currentHealth = Phaser.Math.Clamp(health[player], 0, PLAYER_MAX_HEALTH);
            this.addText(`JOUEUR ${player}`, x + 8, 82, color, 12);
            this.addText(
                Array.from({ length: PLAYER_MAX_HEALTH }, (_, life) =>
                    life < currentHealth ? "♥" : "♡",
                ).join("  "),
                x + 8,
                98,
                color,
                14,
            );
        });
    }

    private renderActionHistory(state: GameViewState): void {
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

    private renderActionHistoryScrollbar(state: GameViewState): void {
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

    private handleActionHistoryDrag(pointer: Phaser.Input.Pointer): void {
        if (this.draggingActionHistory) this.scrollActionHistoryAt(pointer.y);
    }

    private stopActionHistoryDrag(): void {
        this.draggingActionHistory = false;
    }

    private scrollActionHistoryAt(pointerY: number): void {
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

    private handleActionHistoryWheel(
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

    private renderGameOver(winner: PlayerId): void {
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

    private renderMonsterSelection(state: GameViewState, actions: GameHudActions): void {
        const availableInvocationCount = getAvailableSymbolCount(
            "invocation",
            state.rolledDice,
            state.diceReserves[state.currentPlayer],
        );
        const canInvokeMonster = state.availableMonsters.some(
            (monster) => monster.cost <= availableInvocationCount,
        );
        const invocationArrow = state.invocationMenuOpen ? "▲" : "▼";

        this.addButton(
            `INVOCATION ${DICE_SYMBOL_PRESENTATION.invocation.emoji} (${availableInvocationCount}) ${invocationArrow}`,
            HUD_RIGHT,
            12,
            actions.toggleInvocationMenu,
            {
                enabled: state.actionMode.type === "idle" && !state.pendingCells,
                rightAligned: true,
                muted: !canInvokeMonster,
                uniformSize: true,
            },
        );

        if (state.invocationMenuOpen) {
            const invocationHeader = this.addText(
                state.pendingCells ? "Dé posé : choisis une case" : "MONSTRE — COÛT",
                INVOCATION_PANEL_X + INVOCATION_PANEL_WIDTH / 2,
                50,
                "#ffffff",
                15,
            );
            invocationHeader.setOrigin(0.5, 0);

            [...state.availableMonsters]
                .sort((first, second) => first.cost - second.cost)
                .forEach((monster, index) => {
                    const affordable =
                        getAvailableSymbolCount(
                            "invocation",
                            state.rolledDice,
                            state.diceReserves[state.currentPlayer],
                        ) >= monster.cost;
                    const y = 68 + index * INVOCATION_ROW_GAP;
                    const selected = state.selectedMonster?.id === monster.id;
                    let backgroundColor = 0x252e39;
                    let borderColor = 0x3c4652;
                    let monsterNameColor = "#75808d";
                    if (selected) {
                        backgroundColor = 0x51482d;
                        borderColor = 0xf1cf65;
                        monsterNameColor = "#f1cf65";
                    } else if (affordable) {
                        backgroundColor = 0x354352;
                        borderColor = 0x667b8e;
                        monsterNameColor = "#ffffff";
                    }
                    const background = this.scene.add
                        .rectangle(
                            INVOCATION_PANEL_X,
                            y,
                            INVOCATION_PANEL_WIDTH,
                            INVOCATION_ROW_HEIGHT,
                            backgroundColor,
                            1,
                        )
                        .setOrigin(0)
                        .setStrokeStyle(1, borderColor);
                    background.setInteractive({ useHandCursor: affordable });
                    background.on("pointerover", (pointer: Phaser.Input.Pointer) =>
                        actions.hoverInvocationMonster(monster, pointer),
                    );
                    background.on("pointerout", (pointer: Phaser.Input.Pointer) =>
                        actions.hoverInvocationMonster(null, pointer),
                    );
                    if (affordable && !state.pendingCells && state.actionMode.type === "idle") {
                        background.on(
                            "pointerdown",
                            (
                                _pointer: Phaser.Input.Pointer,
                                _localX: number,
                                _localY: number,
                                event: Phaser.Types.Input.EventData,
                            ) => {
                                event.stopPropagation();
                                actions.selectMonster(monster.id);
                            },
                        );
                    }
                    this.container.add(background);

                    const button = this.addText(
                        monster.name,
                        INVOCATION_PANEL_X + 5,
                        y + 8,
                        monsterNameColor,
                        14,
                    );
                    const cost = this.addText(
                        `${monster.cost} 🐍`,
                        INVOCATION_PANEL_X + INVOCATION_PANEL_WIDTH - 6,
                        y + 8,
                        affordable ? "#f1cf65" : "#75808d",
                        14,
                    );
                    cost.setOrigin(1, 0);
                    button.setDepth(background.depth + 1);
                    cost.setDepth(background.depth + 1);
                });

            if (state.selectedMonster) {
                const controlsY = 68 + state.availableMonsters.length * INVOCATION_ROW_GAP + 4;
                this.addText(
                    state.pendingCells
                        ? `Monstre : ${state.selectedMonster.name} — sélectionne une case du dé`
                        : `Monstre : ${state.selectedMonster.name} — choisis un patron et une position`,
                    INVOCATION_PANEL_X,
                    controlsY,
                    "#f1cf65",
                    14,
                );
            }
        }

        this.renderActionStatus(state, actions);
    }

    private renderDiceAndReserves(state: GameViewState, actions: GameHudActions): void {
        const diceStartX = 12;
        this.addText("DÉS DU TOUR", diceStartX, 600, "#ffffff", 14);

        state.rolledDice.forEach((die, index) => {
            const x = diceStartX + index * 58;
            const isAvailable =
                die.status === "available" &&
                state.hasRolled &&
                !state.pendingCells &&
                state.actionMode.type === "idle";
            const background = this.scene.add
                .rectangle(x, 624, 50, 50, die.status === "stored" ? 0x51482d : 0x2a3644, 1)
                .setOrigin(0)
                .setStrokeStyle(2, die.status === "spent" ? 0x66707b : 0xf1cf65);
            if (isAvailable) {
                background.setInteractive({ useHandCursor: true });
                background.on(
                    "pointerdown",
                    (
                        _pointer: Phaser.Input.Pointer,
                        _x: number,
                        _y: number,
                        event: Phaser.Types.Input.EventData,
                    ) => {
                        event.stopPropagation();
                        actions.storeDie(index);
                    },
                );
            }
            this.container.add(background);

            const { emoji } = DICE_SYMBOL_PRESENTATION[die.symbol];
            const face = this.scene.add
                .text(x + 25, 649, emoji, {
                    fontFamily: "Arial",
                    fontSize: "27px",
                    color: "#ffffff",
                })
                .setOrigin(0.5);
            if (die.status !== "available" || !isAvailable) face.setAlpha(0.55);
            this.container.add(face);
        });

        this.addText("RÉSERVES", diceStartX, 682, "#ffffff", 16);
        for (const player of [1, 2] as PlayerId[]) {
            const reserve = state.diceReserves[player];
            const reserveText = DICE_SYMBOLS.map(
                (symbol) => `${DICE_SYMBOL_PRESENTATION[symbol].emoji} ${reserve[symbol]}`,
            ).join("   ");
            const color = player === state.currentPlayer ? "#f1cf65" : "#aab5c2";
            this.addText(
                `J${player}  ${reserveText}`,
                diceStartX,
                704 + (player - 1) * 25,
                color,
                16,
            );
        }
    }

    private renderActionStatus(state: GameViewState, actions: GameHudActions): void {
        if (state.actionMode.type === "attack") {
            const actionMode = state.actionMode;
            const attacker = state.placedMonsters.find(
                (monster) => monster.id === actionMode.attackerId,
            );
            if (!attacker) {
                this.addText(
                    "Choisis un de tes monstres pour attaquer",
                    INVOCATION_PANEL_X,
                    ACTION_PANEL_Y,
                    "#f1cf65",
                    14,
                );
                this.addButton(
                    "ANNULER",
                    HUD_RIGHT,
                    ACTION_PANEL_Y + 22,
                    actions.cancelBoardAction,
                    { rightAligned: true },
                );
                return;
            }

            const reserve = state.diceReserves[state.currentPlayer];
            attacker.monster.attacks.forEach((attack, attackIndex) => {
                const affordable =
                    getAvailableSymbolCount("attack", state.rolledDice, reserve) >= attack.cost;
                const y = ACTION_PANEL_Y + attackIndex * 40;
                this.addButton(
                    `${attack.name} — ${attack.damage} dég. — ${attack.cost} ⚔️`,
                    HUD_RIGHT,
                    y,
                    () => actions.selectAttack(attackIndex),
                    { enabled: affordable, rightAligned: true },
                );
            });
            const selectedAttack =
                actionMode.attackIndex === null
                    ? undefined
                    : attacker.monster.attacks[actionMode.attackIndex];
            this.addText(
                selectedAttack
                    ? `Clique une case de ${this.getAttackPatternLabel(selectedAttack.pattern)}`
                    : "Choisis une attaque",
                INVOCATION_PANEL_X,
                ACTION_PANEL_Y + attacker.monster.attacks.length * 40,
                "#f1cf65",
                14,
            );
            this.addButton(
                "ANNULER",
                HUD_RIGHT,
                ACTION_PANEL_Y + 28 + attacker.monster.attacks.length * 40,
                actions.cancelBoardAction,
                { rightAligned: true },
            );
            return;
        }

        if (state.actionMode.type === "movement") {
            const actionMode = state.actionMode;
            const movingMonster = state.placedMonsters.find(
                (monster) => monster.id === actionMode.monsterId,
            );
            this.addText(
                actionMode.monsterId
                    ? `Choisis une case libre à ${movingMonster?.monster.movementRange ?? 2} pas sur un dé posé`
                    : "Choisis un monstre à déplacer",
                INVOCATION_PANEL_X,
                ACTION_PANEL_Y,
                "#f1cf65",
                14,
            );
            this.addButton("ANNULER", HUD_RIGHT, ACTION_PANEL_Y + 22, actions.cancelBoardAction, {
                rightAligned: true,
            });
            return;
        }

        if (!state.hasRolled || state.pendingCells || state.invocationMenuOpen) return;

        const reserve = state.diceReserves[state.currentPlayer];
        const attackCount = getAvailableSymbolCount("attack", state.rolledDice, reserve);
        const movementCount = getAvailableSymbolCount("movement", state.rolledDice, reserve);
        const canMove = state.placedMonsters.some(
            (monster) =>
                monster.owner === state.currentPlayer &&
                monster.currentHp > 0 &&
                getMovementCost(monster.monster) <= movementCount,
        );
        let visibleActions = 0;
        if (attackCount > 0) {
            this.addButton(
                `ATTAQUER ⚔️ (${attackCount})`,
                HUD_RIGHT,
                ACTION_PANEL_Y + visibleActions * 42,
                actions.startAttack,
                { rightAligned: true, uniformSize: true },
            );
            visibleActions++;
        }
        if (canMove) {
            this.addButton(
                movementCount > 0 ? `DÉPLACER ➡️ (${movementCount})` : "DÉPLACER ➡️ (gratuit)",
                HUD_RIGHT,
                ACTION_PANEL_Y + visibleActions * 42,
                actions.startMovement,
                { rightAligned: true, uniformSize: true },
            );
            visibleActions++;
        }
        this.addButton(
            "FIN DU TOUR",
            HUD_RIGHT,
            ACTION_PANEL_Y + visibleActions * 42,
            actions.finishTurn,
            { rightAligned: true, uniformSize: true },
        );
    }

    private renderPatternSelector(state: GameViewState, actions: GameHudActions): void {
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

    private addIconButton(options: IconButtonOptions): void {
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
            tooltipText = this.scene.add.text(pointer.x + 8, pointer.y - 22, tooltip, {
                fontFamily: "Arial",
                fontSize: "12px",
                color: "#ffffff",
                backgroundColor: "#151b25",
                padding: { x: 6, y: 4 },
            });
            let tooltipX = pointer.x + 8;
            if (tooltipX + tooltipText.width + 2 > GAME_CONFIG.screenWidth - 4) {
                tooltipX = pointer.x - tooltipText.width - 10;
            }
            tooltipX = Phaser.Math.Clamp(
                tooltipX,
                4,
                GAME_CONFIG.screenWidth - tooltipText.width - 6,
            );

            let tooltipY = pointer.y - tooltipText.height - 8;
            if (tooltipY < 4) tooltipY = pointer.y + 8;
            tooltipY = Phaser.Math.Clamp(
                tooltipY,
                4,
                GAME_CONFIG.screenHeight - tooltipText.height - 6,
            );
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

    private addText(
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

    private getAttackPatternLabel(pattern: MonsterAttack["pattern"]): string {
        if (pattern.type === "jumpArea") {
            return `le carré 2×2 depuis une case à ${pattern.range} pas maximum`;
        }
        if (pattern.type === "area") return "la zone 2×2";
        if (pattern.type === "line" && pattern.allDirections) {
            const minRange = pattern.minRange ?? 1;
            const range =
                minRange === 1
                    ? `portée maximale ${pattern.range}`
                    : `portée ${minRange}–${pattern.range}`;
            return `la ligne de ${pattern.length ?? 1} cases (${range})`;
        }
        if (pattern.type === "line") return `la ligne de ${pattern.range} cases`;
        if (pattern.type === "radius") return `la zone circulaire de ${pattern.range} cases`;
        return "une cible au corps à corps";
    }

    private addButton(
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
        if (uniformSize) button.setFixedSize(width, HUD_BUTTON_HEIGHT);
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
}
