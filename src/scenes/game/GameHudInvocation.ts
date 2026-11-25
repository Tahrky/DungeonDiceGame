import type Phaser from "phaser";
import { DICE_SYMBOL_PRESENTATION } from "../../data/dice";
import { getAvailableSymbolCount } from "../../game/diceResources";
import { getInvokedMonsterCount } from "../../game/matchRules";
import type { Monster } from "../../types/GameTypes";
import { GameHudReserves } from "./GameHudReserves";
import type { GameViewState } from "./GameViewState";
import {
    INVOCATION_BUTTON_Y,
    INVOCATION_PANEL_WIDTH,
    INVOCATION_ROW_GAP,
    INVOCATION_ROW_HEIGHT,
    WIDE_BUTTON_OPTIONS,
    getHudRightX,
    getHudTopY,
} from "./hudLayout";
import type { GameHudActions } from "./hudTypes";
import { onPointerDown } from "./uiStyle";

const UNAVAILABLE_TEXT_COLOR = "#75808d";
const COST_COLOR = "#f1cf65";

function getInvocationRowColors(selected: boolean, affordable: boolean) {
    if (selected) return { fill: 0x51482d, border: 0xf1cf65, name: COST_COLOR };
    if (affordable) return { fill: 0x354352, border: 0x667b8e, name: "#ffffff" };
    return { fill: 0x252e39, border: 0x3c4652, name: UNAVAILABLE_TEXT_COLOR };
}

export abstract class GameHudInvocation extends GameHudReserves {
    protected renderMonsterSelection(state: GameViewState, actions: GameHudActions): void {
        const availableCount = getAvailableSymbolCount(
            "invocation",
            state.rolledDice,
            state.diceReserves[state.currentPlayer],
        );
        const invokedCount = getInvokedMonsterCount(state.placedMonsters, state.currentPlayer);
        const hasCapacity = invokedCount < state.maxMonstersPerPlayer;
        const canInvokeMonster =
            hasCapacity &&
            state.availableMonsters.some((monster) => monster.cost <= availableCount);

        this.addButton(
            `INVOCATION ${DICE_SYMBOL_PRESENTATION.invocation.emoji} (${availableCount}) ${state.invocationMenuOpen ? "▲" : "▼"}`,
            getHudRightX(this.scene),
            getHudTopY(this.scene, INVOCATION_BUTTON_Y),
            actions.toggleInvocationMenu,
            {
                ...WIDE_BUTTON_OPTIONS,
                enabled: state.actionMode.type === "idle" && !state.pendingCells,
                muted: !canInvokeMonster,
            },
        );

        if (state.invocationMenuOpen) {
            this.renderInvocationMenu(state, actions, invokedCount, hasCapacity, availableCount);
        }

        this.renderActionStatus(state, actions);
    }

    private renderInvocationMenu(
        state: GameViewState,
        actions: GameHudActions,
        invokedCount: number,
        hasCapacity: boolean,
        availableCount: number,
    ): void {
        const panelX = getHudRightX(this.scene) - INVOCATION_PANEL_WIDTH;
        const rowsY = getHudTopY(this.scene, 82);
        this.addText(
            state.pendingCells
                ? "Dé posé : choisis une case"
                : `MONSTRE — COÛT (${invokedCount}/${state.maxMonstersPerPlayer})`,
            panelX + INVOCATION_PANEL_WIDTH / 2,
            getHudTopY(this.scene, 58),
            "#ffffff",
            17,
        ).setOrigin(0.5, 0);

        [...state.availableMonsters]
            .sort((first, second) => first.cost - second.cost)
            .forEach((monster, index) =>
                this.renderInvocationRow(
                    state,
                    actions,
                    monster,
                    panelX,
                    rowsY + index * INVOCATION_ROW_GAP,
                    hasCapacity && availableCount >= monster.cost,
                ),
            );

        if (state.selectedMonster) {
            this.addInstructionWithCancel(
                state.pendingCells
                    ? `Monstre : ${state.selectedMonster.name} — sélectionne une case du dé`
                    : `Monstre : ${state.selectedMonster.name} — choisis un patron et une position`,
                rowsY + state.availableMonsters.length * INVOCATION_ROW_GAP + 4,
                actions.cancelInvocation,
            );
        }
    }

    private renderInvocationRow(
        state: GameViewState,
        actions: GameHudActions,
        monster: Monster,
        x: number,
        y: number,
        affordable: boolean,
    ): void {
        const colors = getInvocationRowColors(state.selectedMonster?.id === monster.id, affordable);
        const background = this.addRect(
            x,
            y,
            INVOCATION_PANEL_WIDTH,
            INVOCATION_ROW_HEIGHT,
            colors.fill,
            1,
            [1, colors.border],
        ).setInteractive({ useHandCursor: affordable });
        background.on("pointerover", (pointer: Phaser.Input.Pointer) =>
            actions.hoverInvocationMonster(monster, pointer),
        );
        background.on("pointerout", (pointer: Phaser.Input.Pointer) =>
            actions.hoverInvocationMonster(null, pointer),
        );
        if (affordable && state.actionMode.type === "idle") {
            onPointerDown(background, () => actions.selectMonster(monster.id));
        }

        const name = this.addText(monster.name, x + 5, y + 8, colors.name, 16);
        const cost = this.addText(
            `${monster.cost} 🐍`,
            x + INVOCATION_PANEL_WIDTH - 6,
            y + 8,
            affordable ? COST_COLOR : UNAVAILABLE_TEXT_COLOR,
            16,
        ).setOrigin(1, 0);
        name.setDepth(background.depth + 1);
        cost.setDepth(background.depth + 1);
    }

    protected abstract renderActionStatus(state: GameViewState, actions: GameHudActions): void;
}
