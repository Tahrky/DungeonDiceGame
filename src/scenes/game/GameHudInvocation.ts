import type Phaser from "phaser";
import { DICE_SYMBOL_PRESENTATION } from "../../data/dice";
import { getAvailableSymbolCount } from "../../game/diceResources";
import {
    canInvokeMonster,
    getInvokedMonsterCount,
    getMonsterInvocationCount,
} from "../../game/matchRules";
import type { Monster } from "../../types/GameTypes";
import { GameHudReserves } from "./GameHudReserves";
import type { GameViewState } from "./GameViewState";
import {
    INVOCATION_BUTTON_Y,
    INVOCATION_PANEL_WIDTH,
    INVOCATION_ROW_GAP,
    INVOCATION_ROW_HEIGHT,
    HUD_BUTTON_HEIGHT,
    WIDE_BUTTON_OPTIONS,
    getHudRightX,
    getHudTopY,
    getPatternToggleY,
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
        const canInvokeAnyMonster =
            hasCapacity &&
            state.availableMonsters.some(
                (monster) =>
                    monster.cost <= availableCount &&
                    canInvokeMonster(state.placedMonsters, state.currentPlayer, monster.id, state),
            );

        this.addButton(
            `INVOCATION ${DICE_SYMBOL_PRESENTATION.invocation.emoji} (${availableCount}) ${state.invocationMenuOpen ? "▲" : "▼"}`,
            getHudRightX(this.scene),
            getHudTopY(this.scene, INVOCATION_BUTTON_Y),
            actions.toggleInvocationMenu,
            {
                ...WIDE_BUTTON_OPTIONS,
                enabled: state.actionMode.type === "idle" && !state.pendingCells,
                muted: !canInvokeAnyMonster,
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
        const header = this.addText(
            state.pendingCells
                ? "Dé posé : choisis une case"
                : `MONSTRE — COÛT (${invokedCount}/${state.maxMonstersPerPlayer})`,
            panelX + INVOCATION_PANEL_WIDTH / 2,
            getHudTopY(this.scene, INVOCATION_BUTTON_Y) + HUD_BUTTON_HEIGHT + 6,
            "#ffffff",
            17,
        ).setOrigin(0.5, 0);
        header.setScale(Math.min(1, (INVOCATION_PANEL_WIDTH - 10) / header.width));
        const rowsY = header.y + header.displayHeight + 4;
        const instruction = state.selectedMonster
            ? this.addRightInstruction(
                  state.pendingCells
                      ? `Monstre : ${state.selectedMonster.name} — sélectionne une case du dé`
                      : `Monstre : ${state.selectedMonster.name} — choisis un patron et une position`,
                  0,
              )
            : null;
        const instructionHeight = instruction ? instruction.height + 8 + HUD_BUTTON_HEIGHT : 0;
        const rowGap = INVOCATION_ROW_GAP - INVOCATION_ROW_HEIGHT;
        const availableHeight =
            getPatternToggleY(this.scene, state.patternSelectorExpanded) -
            8 -
            rowsY -
            instructionHeight;
        const rowHeight = Math.min(
            INVOCATION_ROW_HEIGHT,
            Math.max(1, availableHeight / Math.max(1, state.availableMonsters.length) - rowGap),
        );

        [...state.availableMonsters]
            .sort((first, second) => first.cost - second.cost)
            .forEach((monster, index) =>
                this.renderInvocationRow(
                    state,
                    actions,
                    monster,
                    panelX,
                    rowsY + index * (rowHeight + rowGap),
                    rowHeight,
                    hasCapacity &&
                        availableCount >= monster.cost &&
                        canInvokeMonster(
                            state.placedMonsters,
                            state.currentPlayer,
                            monster.id,
                            state,
                        ),
                ),
            );

        if (instruction) {
            const y = rowsY + state.availableMonsters.length * (rowHeight + rowGap);
            instruction.setY(y);
            this.addButton(
                "ANNULER",
                getHudRightX(this.scene),
                y + instruction.height + 8,
                actions.cancelInvocation,
                {
                    rightAligned: true,
                },
            );
        }
    }

    private renderInvocationRow(
        state: GameViewState,
        actions: GameHudActions,
        monster: Monster,
        x: number,
        y: number,
        height: number,
        affordable: boolean,
    ): void {
        const colors = getInvocationRowColors(state.selectedMonster?.id === monster.id, affordable);
        const background = this.addRect(x, y, INVOCATION_PANEL_WIDTH, height, colors.fill, 1, [
            1,
            colors.border,
        ]).setInteractive({ useHandCursor: affordable });
        background.on("pointerover", (pointer: Phaser.Input.Pointer) =>
            actions.hoverInvocationMonster(monster, pointer),
        );
        background.on("pointerout", (pointer: Phaser.Input.Pointer) =>
            actions.hoverInvocationMonster(null, pointer),
        );
        if (affordable && state.actionMode.type === "idle") {
            onPointerDown(background, () => actions.selectMonster(monster.id));
        }

        const cost = this.addText(
            `${getMonsterInvocationCount(state.placedMonsters, state.currentPlayer, monster.id)}/${state.maxSummonsPerMonster} · ${monster.cost} 🐍`,
            x + INVOCATION_PANEL_WIDTH - 6,
            y + height / 2,
            affordable ? COST_COLOR : UNAVAILABLE_TEXT_COLOR,
            16,
        ).setOrigin(1, 0.5);
        cost.setScale(Math.min(1, (height - 4) / cost.height));
        const name = this.addText(monster.name, x + 5, y + height / 2, colors.name, 16).setOrigin(
            0,
            0.5,
        );
        name.setScale(
            Math.min(
                1,
                (INVOCATION_PANEL_WIDTH - 16 - cost.displayWidth) / name.width,
                (height - 4) / name.height,
            ),
        );
        name.setDepth(background.depth + 1);
        cost.setDepth(background.depth + 1);
    }

    protected abstract renderActionStatus(state: GameViewState, actions: GameHudActions): void;
}
