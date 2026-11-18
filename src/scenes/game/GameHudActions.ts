import {
    INVOCATION_PANEL_WIDTH,
    INVOCATION_ROW_HEIGHT,
    INVOCATION_ROW_GAP,
    INVOCATION_BUTTON_Y,
    INVOCATION_BUTTON_GAP,
    HUD_BUTTON_HEIGHT,
    getHudRightX,
    getHudTopY,
} from "./GameHudBase";
import type { GameHudActions } from "./GameHudBase";
import Phaser from "phaser";
import { DICE_SYMBOL_PRESENTATION } from "../../data/dice";
import { getAvailableSymbolCount } from "../../game/diceResources";
import {
    canUseActionThisTurn,
    canUseMonsterAttackThisTurn,
    getAttackActionsPerTurn,
    getAttackCost,
    getAttackDamage,
    getMovementActionsPerTurn,
    getMovementCost,
    getMovementRange,
} from "../../game/monsterActions";
import { getInvokedMonsterCount } from "../../game/matchRules";
import type { GameViewState } from "./GameViewState";
import type { MonsterAttack, PlacedMonster } from "../../types/GameTypes";
import { GameHudReserves } from "./GameHudReserves";

function getAttackEffectLabel(attack: MonsterAttack, attacker: PlacedMonster): string {
    if (attack.healAmount !== undefined) return `soin ${attack.healAmount} PV`;
    if (attack.cooldownReduction !== undefined) {
        return `recharge -${attack.cooldownReduction} tour`;
    }
    const effects: string[] = [];
    if (attack.movementRangeBonus !== undefined) {
        effects.push(`déplacement +${attack.movementRangeBonus}`);
    }
    if (attack.movementCostReduction !== undefined) {
        effects.push(`coût ➡️ -${attack.movementCostReduction}`);
    }
    if (attack.attackDamageBonus !== undefined) {
        effects.push(`dégâts +${attack.attackDamageBonus}`);
    }
    if (attack.attackCostReduction !== undefined) {
        effects.push(`coût ⚔️ -${attack.attackCostReduction}`);
    }
    if (effects.length > 0) return `${effects.join(", ")} (ce tour)`;
    return `${getAttackDamage(attack, attacker.turnBuffs?.attackDamageBonus ?? 0)} dég.`;
}

export abstract class GameHudActionsPanel extends GameHudReserves {
    protected renderMonsterSelection(state: GameViewState, actions: GameHudActions): void {
        const availableInvocationCount = getAvailableSymbolCount(
            "invocation",
            state.rolledDice,
            state.diceReserves[state.currentPlayer],
        );
        const canInvokeMonster =
            state.availableMonsters.some((monster) => monster.cost <= availableInvocationCount) &&
            getInvokedMonsterCount(state.placedMonsters, state.currentPlayer) <
                state.maxMonstersPerPlayer;
        const invocationArrow = state.invocationMenuOpen ? "▲" : "▼";
        const rightX = getHudRightX(this.scene);
        const invocationPanelX = rightX - INVOCATION_PANEL_WIDTH;
        const invocationHeaderY = getHudTopY(this.scene, 58);
        const invocationRowsY = getHudTopY(this.scene, 82);

        this.addButton(
            `INVOCATION ${DICE_SYMBOL_PRESENTATION.invocation.emoji} (${availableInvocationCount}) ${invocationArrow}`,
            rightX,
            getHudTopY(this.scene, INVOCATION_BUTTON_Y),
            actions.toggleInvocationMenu,
            {
                enabled: state.actionMode.type === "idle" && !state.pendingCells,
                rightAligned: true,
                muted: !canInvokeMonster,
                uniformSize: true,
                centerVertically: true,
                fontSize: 18,
                width: INVOCATION_PANEL_WIDTH,
            },
        );

        if (state.invocationMenuOpen) {
            const invocationHeader = this.addText(
                state.pendingCells
                    ? "Dé posé : choisis une case"
                    : `MONSTRE — COÛT (${getInvokedMonsterCount(state.placedMonsters, state.currentPlayer)}/${state.maxMonstersPerPlayer})`,
                invocationPanelX + INVOCATION_PANEL_WIDTH / 2,
                invocationHeaderY,
                "#ffffff",
                17,
            );
            invocationHeader.setOrigin(0.5, 0);

            [...state.availableMonsters]
                .sort((first, second) => first.cost - second.cost)
                .forEach((monster, index) => {
                    const hasCapacity =
                        getInvokedMonsterCount(state.placedMonsters, state.currentPlayer) <
                        state.maxMonstersPerPlayer;
                    const affordable =
                        hasCapacity &&
                        getAvailableSymbolCount(
                            "invocation",
                            state.rolledDice,
                            state.diceReserves[state.currentPlayer],
                        ) >= monster.cost;
                    const y = invocationRowsY + index * INVOCATION_ROW_GAP;
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
                        16,
                    );
                    const cost = this.addText(
                        `${monster.cost} 🐍`,
                        invocationPanelX + INVOCATION_PANEL_WIDTH - 6,
                        y + 8,
                        affordable ? "#f1cf65" : "#75808d",
                        16,
                    );
                    cost.setOrigin(1, 0);
                    button.setDepth(background.depth + 1);
                    cost.setDepth(background.depth + 1);
                });

            if (state.selectedMonster) {
                const controlsY =
                    invocationRowsY + state.availableMonsters.length * INVOCATION_ROW_GAP + 4;
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

    protected renderActionStatus(state: GameViewState, actions: GameHudActions): void {
        const rightX = getHudRightX(this.scene);
        const actionPanelY =
            getHudTopY(this.scene, INVOCATION_BUTTON_Y) +
            HUD_BUTTON_HEIGHT +
            INVOCATION_BUTTON_GAP;
        if (state.actionMode.type === "convertSymbols") return;
        if (state.actionMode.type === "attack") {
            const actionMode = state.actionMode;
            const attacker = state.placedMonsters.find(
                (monster) => monster.id === actionMode.attackerId,
            );
            if (!attacker) {
                const instruction = this.addRightInstruction(
                    "Choisis un de tes monstres pour attaquer",
                    actionPanelY,
                );
                this.addButton(
                    "ANNULER",
                    rightX,
                    actionPanelY + instruction.height + 8,
                    actions.cancelBoardAction,
                    { rightAligned: true },
                );
                return;
            }

            const reserve = state.diceReserves[state.currentPlayer];
            attacker.monster.attacks.forEach((attack, attackIndex) => {
                const attackCost = getAttackCost(
                    attack,
                    attacker.turnBuffs?.attackCostReduction ?? 0,
                );
                const affordable =
                    getAvailableSymbolCount("attack", state.rolledDice, reserve) >= attackCost;
                const cooldown = attacker.attackCooldowns[attackIndex] ?? 0;
                const attackLimit = getAttackActionsPerTurn(attacker.monster);
                const attacksRemaining = Math.max(0, attackLimit - attacker.attacksUsedThisTurn);
                const useLimitReached =
                    attack.usesPerTurn !== undefined &&
                    (attacker.attackUsesThisTurn[attackIndex] ?? 0) >= attack.usesPerTurn;
                const effect = getAttackEffectLabel(attack, attacker);
                const attackStatus =
                    useLimitReached
                        ? " · utilisée ce tour"
                        : attacksRemaining === 0
                        ? " · attaques épuisées"
                        : attacker.attacksUsedThisTurn > 0
                          ? ` · encore ${attacksRemaining} attaque${attacksRemaining > 1 ? "s" : ""}`
                          : "";
                const y = actionPanelY + attackIndex * 40;
                this.addButton(
                    `${attack.name} — ${effect} — ${attackCost} ⚔️${
                        cooldown > 0 ? ` · recharge ${cooldown} tour${cooldown === 1 ? "" : "s"}` : ""
                    }${attackStatus}`,
                    rightX,
                    y,
                    () => actions.selectAttack(attackIndex),
                    {
                        enabled:
                            affordable &&
                            cooldown === 0 &&
                            attacksRemaining > 0 &&
                            !useLimitReached,
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
                    : selectedAttack?.targetsAlliesOnly
                      ? "Clique un allié à portée"
                    : selectedAttack
                      ? `Clique une case de ${this.getAttackPatternLabel(selectedAttack.pattern)}`
                      : "Choisis une attaque",
                actionPanelY + attacker.monster.attacks.length * 40,
            );
            this.addButton(
                "ANNULER",
                rightX,
                actionPanelY +
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
            const movementRange = movingMonster
                ? getMovementRange(
                      movingMonster.monster,
                      movingMonster.turnBuffs?.movementRangeBonus ?? 0,
                  )
                : 2;
            const instruction = this.addRightInstruction(
                actionMode.monsterId
                    ? `Choisis une case libre à ${movementRange} pas sur un dé posé`
                    : "Choisis un monstre à déplacer",
                actionPanelY,
            );
            this.addButton(
                "ANNULER",
                rightX,
                actionPanelY + instruction.height + 8,
                actions.cancelBoardAction,
                { rightAligned: true },
            );
            return;
        }

        if (!state.hasRolled || state.pendingCells || state.invocationMenuOpen) return;

        const reserve = state.diceReserves[state.currentPlayer];
        const attackCount = getAvailableSymbolCount("attack", state.rolledDice, reserve);
        const movementCount = getAvailableSymbolCount("movement", state.rolledDice, reserve);
        const hasFreeAttack = state.placedMonsters.some(
            (monster) =>
                monster.owner === state.currentPlayer &&
                monster.currentHp > 0 &&
                (monster.turnBuffs?.attackCostReduction ?? 0) > 0 &&
                canUseActionThisTurn(
                    monster.attacksUsedThisTurn,
                    getAttackActionsPerTurn(monster.monster),
                ) &&
                monster.monster.attacks.some(
                    (attack, index) =>
                        getAttackCost(
                            attack,
                            monster.turnBuffs?.attackCostReduction ?? 0,
                        ) === 0 &&
                        (monster.attackCooldowns[index] ?? 0) === 0 &&
                        canUseMonsterAttackThisTurn(
                            attack,
                            monster.attackUsesThisTurn[index] ?? 0,
                        ),
                ),
        );
        const canMove = state.placedMonsters.some(
            (monster) =>
                monster.owner === state.currentPlayer &&
                monster.currentHp > 0 &&
                canUseActionThisTurn(
                    monster.movementsUsedThisTurn,
                    getMovementActionsPerTurn(monster.monster),
                ) &&
                getMovementCost(
                    monster.monster,
                    monster.turnBuffs?.movementCostReduction ?? 0,
                ) <= movementCount,
        );
        let visibleActions = 0;
        if (attackCount > 0 || hasFreeAttack) {
            this.addButton(
                attackCount > 0 ? `ATTAQUER ⚔️ (${attackCount})` : "ATTAQUER ⚔️ (gratuit)",
                rightX,
                actionPanelY + visibleActions * 48,
                actions.startAttack,
                {
                    rightAligned: true,
                    uniformSize: true,
                    centerVertically: true,
                    fontSize: 18,
                    width: INVOCATION_PANEL_WIDTH,
                },
            );
            visibleActions++;
        }
        if (canMove) {
            this.addButton(
                movementCount > 0 ? `DÉPLACER ➡️ (${movementCount})` : "DÉPLACER ➡️ (gratuit)",
                rightX,
                actionPanelY + visibleActions * 48,
                actions.startMovement,
                {
                    rightAligned: true,
                    uniformSize: true,
                    centerVertically: true,
                    fontSize: 18,
                    width: INVOCATION_PANEL_WIDTH,
                },
            );
            visibleActions++;
        }
        this.addButton(
            "FIN DU TOUR",
            rightX,
            actionPanelY + visibleActions * 48,
            actions.finishTurn,
            {
                rightAligned: true,
                uniformSize: true,
                centerVertically: true,
                fontSize: 18,
                width: INVOCATION_PANEL_WIDTH,
            },
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
