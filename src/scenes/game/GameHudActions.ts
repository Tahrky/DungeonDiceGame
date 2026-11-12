import { GameHudHistory } from "./GameHudHistory";
import {
    INVOCATION_PANEL_WIDTH,
    INVOCATION_ROW_HEIGHT,
    INVOCATION_ROW_GAP,
    ACTION_PANEL_Y,
    getHudLeftX,
    getHudRightX,
} from "./GameHudBase";
import type { GameHudActions } from "./GameHudBase";
import Phaser from "phaser";
import { DICE_SYMBOLS, DICE_SYMBOL_PRESENTATION } from "../../data/dice";
import { getAvailableSymbolCount } from "../../game/diceResources";
import { canUseActionThisTurn, getAttackActionsPerTurn, getMovementActionsPerTurn, getMovementCost } from "../../game/monsterActions";
import { getInvokedMonsterCount, MAX_MONSTERS_PER_PLAYER } from "../../game/matchRules";
import type { GameViewState } from "./GameViewState";
import type { MonsterAttack, PlayerId } from "../../types/GameTypes";

export abstract class GameHudActionsPanel extends GameHudHistory {
    protected renderMonsterSelection(state: GameViewState, actions: GameHudActions): void {
        const availableInvocationCount = getAvailableSymbolCount(
            "invocation",
            state.rolledDice,
            state.diceReserves[state.currentPlayer],
        );
        const canInvokeMonster =
            state.availableMonsters.some((monster) => monster.cost <= availableInvocationCount) &&
            getInvokedMonsterCount(state.placedMonsters, state.currentPlayer) <
                MAX_MONSTERS_PER_PLAYER;
        const invocationArrow = state.invocationMenuOpen ? "▲" : "▼";
        const rightX = getHudRightX(this.scene);
        const invocationPanelX = rightX - INVOCATION_PANEL_WIDTH;

        this.addButton(
            `INVOCATION ${DICE_SYMBOL_PRESENTATION.invocation.emoji} (${availableInvocationCount}) ${invocationArrow}`,
            rightX,
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
                state.pendingCells
                    ? "Dé posé : choisis une case"
                    : `MONSTRE — COÛT (${getInvokedMonsterCount(state.placedMonsters, state.currentPlayer)}/${MAX_MONSTERS_PER_PLAYER})`,
                invocationPanelX + INVOCATION_PANEL_WIDTH / 2,
                50,
                "#ffffff",
                15,
            );
            invocationHeader.setOrigin(0.5, 0);

            [...state.availableMonsters]
                .sort((first, second) => first.cost - second.cost)
                .forEach((monster, index) => {
                    const hasCapacity =
                        getInvokedMonsterCount(state.placedMonsters, state.currentPlayer) <
                        MAX_MONSTERS_PER_PLAYER;
                    const affordable =
                        hasCapacity &&
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
                            invocationPanelX,
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
                    if (affordable && state.actionMode.type === "idle") {
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
                        invocationPanelX + 5,
                        y + 8,
                        monsterNameColor,
                        14,
                    );
                    const cost = this.addText(
                        `${monster.cost} 🐍`,
                        invocationPanelX + INVOCATION_PANEL_WIDTH - 6,
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
                const instruction = this.addRightInstruction(
                    state.pendingCells
                        ? `Monstre : ${state.selectedMonster.name} — sélectionne une case du dé`
                        : `Monstre : ${state.selectedMonster.name} — choisis un patron et une position`,
                    controlsY,
                );
                this.addButton(
                    "ANNULER",
                    rightX,
                    controlsY + instruction.height + 8,
                    actions.cancelInvocation,
                    { rightAligned: true },
                );
            }
        }

        this.renderActionStatus(state, actions);
    }

    protected renderDiceAndReserves(state: GameViewState, actions: GameHudActions): void {
        const diceStartX = getHudLeftX(this.scene);
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

    protected renderActionStatus(state: GameViewState, actions: GameHudActions): void {
        const rightX = getHudRightX(this.scene);
        if (state.actionMode.type === "attack") {
            const actionMode = state.actionMode;
            const attacker = state.placedMonsters.find(
                (monster) => monster.id === actionMode.attackerId,
            );
            if (!attacker) {
                const instruction = this.addRightInstruction(
                    "Choisis un de tes monstres pour attaquer",
                    ACTION_PANEL_Y,
                );
                this.addButton(
                    "ANNULER",
                    rightX,
                    ACTION_PANEL_Y + instruction.height + 8,
                    actions.cancelBoardAction,
                    { rightAligned: true },
                );
                return;
            }

            const reserve = state.diceReserves[state.currentPlayer];
            attacker.monster.attacks.forEach((attack, attackIndex) => {
                const affordable =
                    getAvailableSymbolCount("attack", state.rolledDice, reserve) >= attack.cost;
                const cooldown = attacker.attackCooldowns[attackIndex] ?? 0;
                const attackLimit = getAttackActionsPerTurn(attacker.monster);
                const attacksRemaining = Math.max(0, attackLimit - attacker.attacksUsedThisTurn);
                const attackStatus =
                    attacksRemaining === 0
                        ? " · attaques épuisées"
                        : attacker.attacksUsedThisTurn > 0
                          ? ` · encore ${attacksRemaining} attaque${attacksRemaining > 1 ? "s" : ""}`
                          : "";
                const y = ACTION_PANEL_Y + attackIndex * 40;
                this.addButton(
                    `${attack.name} — ${attack.damage} dég. — ${attack.cost} ⚔️${
                        cooldown > 0 ? ` · recharge ${cooldown} tour${cooldown === 1 ? "" : "s"}` : ""
                    }${attackStatus}`,
                    rightX,
                    y,
                    () => actions.selectAttack(attackIndex),
                    {
                        enabled: affordable && cooldown === 0 && attacksRemaining > 0,
                        rightAligned: true,
                    },
                );
            });
            const selectedAttack =
                actionMode.attackIndex === null
                    ? undefined
                    : attacker.monster.attacks[actionMode.attackIndex];
            const instruction = this.addRightInstruction(
                selectedAttack?.pattern.type === "directionalArea"
                    ? `Clique autour du Pirate (frappe ${selectedAttack.pattern.width}×${selectedAttack.pattern.depth})`
                    : selectedAttack
                      ? `Clique une case de ${this.getAttackPatternLabel(selectedAttack.pattern)}`
                      : "Choisis une attaque",
                ACTION_PANEL_Y + attacker.monster.attacks.length * 40,
            );
            this.addButton(
                "ANNULER",
                rightX,
                ACTION_PANEL_Y +
                    attacker.monster.attacks.length * 40 +
                    instruction.height +
                    8,
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
            const instruction = this.addRightInstruction(
                actionMode.monsterId
                    ? `Choisis une case libre à ${movingMonster?.monster.movementRange ?? 2} pas sur un dé posé`
                    : "Choisis un monstre à déplacer",
                ACTION_PANEL_Y,
            );
            this.addButton(
                "ANNULER",
                rightX,
                ACTION_PANEL_Y + instruction.height + 8,
                actions.cancelBoardAction,
                { rightAligned: true },
            );
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
                canUseActionThisTurn(
                    monster.movementsUsedThisTurn,
                    getMovementActionsPerTurn(monster.monster),
                ) &&
                getMovementCost(monster.monster) <= movementCount,
        );
        let visibleActions = 0;
        if (attackCount > 0) {
            this.addButton(
                `ATTAQUER ⚔️ (${attackCount})`,
                rightX,
                ACTION_PANEL_Y + visibleActions * 42,
                actions.startAttack,
                { rightAligned: true, uniformSize: true },
            );
            visibleActions++;
        }
        if (canMove) {
            this.addButton(
                movementCount > 0 ? `DÉPLACER ➡️ (${movementCount})` : "DÉPLACER ➡️ (gratuit)",
                rightX,
                ACTION_PANEL_Y + visibleActions * 42,
                actions.startMovement,
                { rightAligned: true, uniformSize: true },
            );
            visibleActions++;
        }
        this.addButton(
            "FIN DU TOUR",
            rightX,
            ACTION_PANEL_Y + visibleActions * 42,
            actions.finishTurn,
            { rightAligned: true, uniformSize: true },
        );
    }

    protected getAttackPatternLabel(pattern: MonsterAttack["pattern"]): string {
        if (pattern.type === "jumpArea") {
            return `le carré 2×2 depuis une case à ${pattern.range} pas maximum`;
        }
        if (pattern.type === "area") return `la zone ${pattern.width}×${pattern.depth}`;
        if (pattern.type === "directionalArea") return `la zone ${pattern.width}×${pattern.depth}`;
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
        if (pattern.type === "selfRadius") {
            return `la zone circulaire autour de lui, jusqu’à ${pattern.range} cases`;
        }
        return "une cible au corps à corps";
    }

    protected abstract renderPatternSelector(state: GameViewState, actions: GameHudActions): void;
}
