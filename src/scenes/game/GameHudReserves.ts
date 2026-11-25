import { DICE_SYMBOLS, DICE_SYMBOL_PRESENTATION } from "../../data/dice";
import type { DiceSymbol } from "../../types/GameTypes";
import { GameHudHistory } from "./GameHudHistory";
import type { GameViewState } from "./GameViewState";
import { getHudBottomY, getHudLeftX } from "./hudLayout";
import type { GameHudActions } from "./hudTypes";
import { PLAYER_COLORS, arialStyle, onPointerDown, setHoverFill } from "./uiStyle";

const DIE_SIZE = 54;
const DIE_SPACING = 58;
const RESERVE_ROW_SPACING = 36;
const RESERVE_BUTTON_SPACING = 86;
const RESERVE_BUTTONS_OFFSET_X = 40;
const CONVERSION_TARGET_SIZE = 50;
const CONVERSION_TARGET_SPACING = 56;

function getSelectedCount(state: GameViewState, symbol: DiceSymbol): number {
    return state.actionMode.type === "convertSymbols"
        ? state.actionMode.selectedSymbols.filter((selected) => selected === symbol).length
        : 0;
}

function canSelectReserveSymbol(
    state: GameViewState,
    reserve: Record<DiceSymbol, number>,
    symbol: DiceSymbol,
): boolean {
    const hasConversionContext =
        state.actionMode.type === "convertSymbols" ||
        (state.actionMode.type === "idle" &&
            !state.pendingCells &&
            !state.selectedMonster &&
            !state.invocationMenuOpen);
    if (
        state.winner !== null ||
        (state.onlineGame && !state.isLocalTurn) ||
        !hasConversionContext
    ) {
        return false;
    }

    if (state.actionMode.type === "convertSymbols") {
        return (
            state.actionMode.selectedSymbols.length < 2 &&
            reserve[symbol] > getSelectedCount(state, symbol)
        );
    }

    return (
        Object.values(reserve).reduce((total, count) => total + count, 0) >= 2 &&
        reserve[symbol] > 0
    );
}

export abstract class GameHudReserves extends GameHudHistory {
    protected renderDiceAndReserves(state: GameViewState, actions: GameHudActions): void {
        const x = getHudLeftX(this.scene);
        const secondReserveY = getHudBottomY(this.scene, 30 * this.scene.cameras.main.zoom + 8);
        const firstReserveY = secondReserveY - RESERVE_ROW_SPACING;
        const diceTitleY = firstReserveY - 105;
        this.addText("DÉS DU TOUR", x, diceTitleY, "#ffffff", 16);
        this.renderDice(state, actions, x, diceTitleY + 22);

        this.addText("RÉSERVES · 2 → 1", x, firstReserveY - 22, "#ffffff", 16);
        for (const player of [1, 2] as const) {
            this.renderReserveRow(state, actions, player, x, firstReserveY);
        }
        this.renderReserveConversion(state, actions, x, firstReserveY);
    }

    private renderDice(state: GameViewState, actions: GameHudActions, x: number, y: number): void {
        state.rolledDice.forEach((die, index) => {
            const dieX = x + index * DIE_SPACING;
            const isAvailable =
                die.status === "available" &&
                state.hasRolled &&
                !state.pendingCells &&
                state.actionMode.type === "idle";
            const background = this.addRect(
                dieX,
                y,
                DIE_SIZE,
                DIE_SIZE,
                die.status === "stored" ? 0x354352 : 0x2a3644,
                1,
                [2, 0x66707b],
            );
            if (isAvailable) {
                background.setInteractive({ useHandCursor: true });
                onPointerDown(background, () => actions.storeDie(index));
            }

            const face = this.addStyledText(
                dieX + DIE_SIZE / 2,
                y + DIE_SIZE / 2,
                DICE_SYMBOL_PRESENTATION[die.symbol].emoji,
                arialStyle(31, "#ffffff"),
            ).setOrigin(0.5);
            if (die.status !== "available" || !isAvailable) face.setAlpha(0.55);
        });
    }

    private renderReserveRow(
        state: GameViewState,
        actions: GameHudActions,
        player: 1 | 2,
        x: number,
        firstRowY: number,
    ): void {
        const reserve = state.diceReserves[player];
        const y = firstRowY + (player - 1) * RESERVE_ROW_SPACING;
        this.addRect(x, y - 1, 300, 30, player === 1 ? 0x914d49 : 0x416e9a, 0.3, [
            1,
            PLAYER_COLORS[player].hex,
            0.65,
        ]);
        this.addText(
            `J${player}`,
            x + 20,
            y + 6,
            player === state.currentPlayer ? "#f1cf65" : "#aab5c2",
            16,
        ).setOrigin(0.5, 0);
        DICE_SYMBOLS.forEach((symbol, index) => {
            const selectedCount = getSelectedCount(state, symbol);
            this.addButton(
                `${DICE_SYMBOL_PRESENTATION[symbol].emoji} ${reserve[symbol]}${
                    selectedCount > 0 ? ` (${selectedCount})` : ""
                }`,
                x + RESERVE_BUTTONS_OFFSET_X + index * RESERVE_BUTTON_SPACING,
                y,
                () => actions.selectReserveSymbol(symbol),
                {
                    enabled:
                        player === state.currentPlayer &&
                        canSelectReserveSymbol(state, reserve, symbol),
                    uniformSize: true,
                    centerVertically: true,
                    fontSize: 18,
                    width: 82,
                    height: 28,
                },
            );
        });
    }

    private renderReserveConversion(
        state: GameViewState,
        actions: GameHudActions,
        x: number,
        reserveTopY: number,
    ): void {
        if (state.actionMode.type !== "convertSymbols") return;

        const selectedSymbols = state.actionMode.selectedSymbols;
        const hasTwoSymbols = selectedSymbols.length === 2;
        const controlsX =
            x + RESERVE_BUTTONS_OFFSET_X + DICE_SYMBOLS.length * RESERVE_BUTTON_SPACING + 8;
        this.addText(
            hasTwoSymbols ? "CHOISIS LE RÉSULTAT" : "CHOISIS UN 2E SYMBOLE",
            controlsX,
            reserveTopY - 19,
            "#f1cf65",
            11,
        );

        let cancelX = controlsX;
        if (hasTwoSymbols) {
            const targetSymbols = DICE_SYMBOLS.filter(
                (symbol) => !selectedSymbols.includes(symbol),
            );
            targetSymbols.forEach((symbol, index) =>
                this.renderConversionTarget(
                    actions,
                    symbol,
                    controlsX + index * CONVERSION_TARGET_SPACING,
                    reserveTopY,
                ),
            );
            cancelX += targetSymbols.length * CONVERSION_TARGET_SPACING + 8;
        }

        this.addButton("ANNULER", cancelX, reserveTopY, actions.cancelBoardAction, {
            uniformSize: true,
            centerVertically: true,
            width: 96,
            height: CONVERSION_TARGET_SIZE,
        });
    }

    private renderConversionTarget(
        actions: GameHudActions,
        symbol: DiceSymbol,
        x: number,
        y: number,
    ): void {
        const half = CONVERSION_TARGET_SIZE / 2;
        const background = this.addRect(
            x,
            y,
            CONVERSION_TARGET_SIZE,
            CONVERSION_TARGET_SIZE,
            0x2a3644,
            1,
            [2, 0xf1cf65],
        ).setInteractive({ useHandCursor: true });
        setHoverFill(background, 0x2a3644, 0x51482d);
        onPointerDown(background, () => actions.chooseReserveConversionTarget(symbol));
        this.addStyledText(
            x + half,
            y + half,
            DICE_SYMBOL_PRESENTATION[symbol].emoji,
            arialStyle(28, "#ffffff"),
        ).setOrigin(0.5);
    }
}
