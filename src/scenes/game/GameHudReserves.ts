import Phaser from "phaser";

import { DICE_SYMBOLS, DICE_SYMBOL_PRESENTATION } from "../../data/dice";
import type { PlayerId } from "../../types/GameTypes";
import { getHudBottomY, getHudLeftX } from "./GameHudBase";
import type { GameHudActions } from "./GameHudBase";
import { GameHudHistory } from "./GameHudHistory";
import type { GameViewState } from "./GameViewState";

export abstract class GameHudReserves extends GameHudHistory {
    protected renderDiceAndReserves(state: GameViewState, actions: GameHudActions): void {
        const diceStartX = getHudLeftX(this.scene);
        const secondReserveY = getHudBottomY(
            this.scene,
            30 * this.scene.cameras.main.zoom + 8,
        );
        const firstReserveY = secondReserveY - 36;
        const diceTitleY = firstReserveY - 105;
        this.addText("DÉS DU TOUR", diceStartX, diceTitleY, "#ffffff", 16);

        state.rolledDice.forEach((die, index) => {
            const x = diceStartX + index * 58;
            const dieY = diceTitleY + 22;
            const isAvailable =
                die.status === "available" &&
                state.hasRolled &&
                !state.pendingCells &&
                state.actionMode.type === "idle";
            const background = this.scene.add
                .rectangle(x, dieY, 54, 54, die.status === "stored" ? 0x354352 : 0x2a3644, 1)
                .setOrigin(0)
                .setStrokeStyle(2, 0x66707b);
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
                .text(x + 27, dieY + 27, emoji, {
                    fontFamily: "Arial",
                    fontSize: "31px",
                    color: "#ffffff",
                })
                .setOrigin(0.5);
            if (die.status !== "available" || !isAvailable) face.setAlpha(0.55);
            this.container.add(face);
        });

        this.addText("RÉSERVES · 2 → 1", diceStartX, firstReserveY - 22, "#ffffff", 16);
        for (const player of [1, 2] as PlayerId[]) {
            const reserve = state.diceReserves[player];
            const color = player === state.currentPlayer ? "#f1cf65" : "#aab5c2";
            const y = firstReserveY + (player - 1) * 36;
            const playerColor = player === 1 ? 0xff8d78 : 0x70bdff;
            const rowBackground = this.scene.add
                .rectangle(diceStartX, y - 1, 300, 30, player === 1 ? 0x914d49 : 0x416e9a, 0.3)
                .setOrigin(0)
                .setStrokeStyle(1, playerColor, 0.65);
            this.container.add(rowBackground);
            this.addText(`J${player}`, diceStartX + 20, y + 6, color, 16).setOrigin(0.5, 0);
            for (const [index, symbol] of DICE_SYMBOLS.entries()) {
                const selectedCount =
                    state.actionMode.type === "convertSymbols"
                        ? state.actionMode.selectedSymbols.filter(
                              (selectedSymbol) => selectedSymbol === symbol,
                          ).length
                        : 0;
                const hasConversionContext =
                    state.actionMode.type === "convertSymbols" ||
                    (state.actionMode.type === "idle" &&
                        !state.pendingCells &&
                        !state.selectedMonster &&
                        !state.invocationMenuOpen);
                const canSelect =
                    player === state.currentPlayer &&
                    state.winner === null &&
                    (!state.onlineGame || state.isLocalTurn) &&
                    hasConversionContext &&
                    (state.actionMode.type === "convertSymbols"
                        ? state.actionMode.selectedSymbols.length < 2 &&
                          reserve[symbol] > selectedCount
                        : Object.values(reserve).reduce((total, count) => total + count, 0) >= 2 &&
                          reserve[symbol] > 0);
                this.addButton(
                    `${DICE_SYMBOL_PRESENTATION[symbol].emoji} ${reserve[symbol]}${
                        selectedCount > 0 ? ` (${selectedCount})` : ""
                    }`,
                    diceStartX + 40 + index * 86,
                    y,
                    () => actions.selectReserveSymbol(symbol),
                    {
                        enabled: canSelect,
                        uniformSize: true,
                        centerVertically: true,
                        fontSize: 18,
                        width: 82,
                        height: 28,
                    },
                );
            }
        }
        this.renderReserveConversion(state, actions, diceStartX, firstReserveY);
    }

    protected renderReserveConversion(
        state: GameViewState,
        actions: GameHudActions,
        diceStartX: number,
        reserveTopY: number,
    ): void {
        if (state.actionMode.type !== "convertSymbols") return;

        const selectedSymbols = state.actionMode.selectedSymbols;
        const hasTwoSymbols = selectedSymbols.length === 2;
        const controlsX = diceStartX + 40 + DICE_SYMBOLS.length * 86 + 8;
        this.addText(
            hasTwoSymbols ? "CHOISIS LE RÉSULTAT" : "CHOISIS UN 2E SYMBOLE",
            controlsX,
            reserveTopY - 19,
            "#f1cf65",
            11,
        );

        const targetSymbols = DICE_SYMBOLS.filter(
            (symbol) => !selectedSymbols.includes(symbol),
        );
        let cancelX = controlsX;
        if (hasTwoSymbols) {
            targetSymbols.forEach((symbol, index) => {
                const x = controlsX + index * 56;
                const y = reserveTopY;
                const background = this.scene.add
                    .rectangle(x, y, 50, 50, 0x2a3644, 1)
                    .setOrigin(0)
                    .setStrokeStyle(2, 0xf1cf65);
                background.setInteractive({ useHandCursor: true });
                background.on("pointerover", () => background.setFillStyle(0x51482d, 1));
                background.on("pointerout", () => background.setFillStyle(0x2a3644, 1));
                background.on(
                    "pointerdown",
                    (
                        _pointer: Phaser.Input.Pointer,
                        _localX: number,
                        _localY: number,
                        event: Phaser.Types.Input.EventData,
                    ) => {
                        event.stopPropagation();
                        actions.chooseReserveConversionTarget(symbol);
                    },
                );
                this.container.add(background);

                const icon = this.scene.add
                    .text(x + 25, y + 25, DICE_SYMBOL_PRESENTATION[symbol].emoji, {
                        fontFamily: "Arial",
                        fontSize: "28px",
                    })
                    .setOrigin(0.5);
                this.container.add(icon);
            });
            cancelX += targetSymbols.length * 56 + 8;
        }

        this.addButton("ANNULER", cancelX, reserveTopY, actions.cancelBoardAction, {
            uniformSize: true,
            centerVertically: true,
            width: 96,
            height: 50,
        });
    }
}
