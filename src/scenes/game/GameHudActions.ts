import { getAvailableSymbolCount } from "../../game/diceResources";
import { getMonsterMovementRange } from "../../game/statusEffects";
import type { BoardActionMode } from "../../types/GameTypes";
import { GameHudInvocation } from "./GameHudInvocation";
import type { GameViewState } from "./GameViewState";
import { describeAttackButton, getAttackInstruction } from "./attackLabels";
import { canMove, hasFreeAttack } from "./hudAvailability";
import {
    HUD_BUTTON_HEIGHT,
    INVOCATION_BUTTON_GAP,
    INVOCATION_BUTTON_Y,
    WIDE_BUTTON_OPTIONS,
    getHudRightX,
    getHudTopY,
} from "./hudLayout";
import type { GameHudActions } from "./hudTypes";

const ATTACK_ROW_HEIGHT = 40;
const ACTION_ROW_HEIGHT = 48;
const DEFAULT_MOVEMENT_RANGE = 2;

type ActionModeOf<Type extends BoardActionMode["type"]> = Extract<BoardActionMode, { type: Type }>;

export abstract class GameHudActionsPanel extends GameHudInvocation {
    protected renderActionStatus(state: GameViewState, actions: GameHudActions): void {
        const panelY =
            getHudTopY(this.scene, INVOCATION_BUTTON_Y) + HUD_BUTTON_HEIGHT + INVOCATION_BUTTON_GAP;
        const actionMode = state.actionMode;
        if (actionMode.type === "attack") {
            this.renderAttackStatus(state, actions, actionMode, panelY);
        } else if (actionMode.type === "movement") {
            this.renderMovementStatus(state, actions, actionMode, panelY);
        } else if (
            actionMode.type === "idle" &&
            state.hasRolled &&
            !state.pendingCells &&
            !state.invocationMenuOpen
        ) {
            this.renderTurnActions(state, actions, panelY);
        }
    }

    private renderAttackStatus(
        state: GameViewState,
        actions: GameHudActions,
        actionMode: ActionModeOf<"attack">,
        panelY: number,
    ): void {
        const attacker = state.placedMonsters.find(
            (monster) => monster.id === actionMode.attackerId,
        );
        if (!attacker) {
            this.addInstructionWithCancel(
                "Choisis un de tes monstres pour attaquer",
                panelY,
                actions.cancelBoardAction,
            );
            return;
        }

        const availableAttackSymbols = getAvailableSymbolCount(
            "attack",
            state.rolledDice,
            state.diceReserves[state.currentPlayer],
        );
        const { attacks } = attacker.monster;
        attacks.forEach((attack, attackIndex) => {
            const { label, enabled } = describeAttackButton(
                attacker,
                attack,
                attackIndex,
                availableAttackSymbols,
            );
            this.addButton(
                label,
                getHudRightX(this.scene),
                panelY + attackIndex * ATTACK_ROW_HEIGHT,
                () => actions.selectAttack(attackIndex),
                { enabled, rightAligned: true },
            );
        });
        const selectedAttack =
            actionMode.attackIndex === null ? undefined : attacks[actionMode.attackIndex];
        this.addInstructionWithCancel(
            getAttackInstruction(selectedAttack),
            panelY + attacks.length * ATTACK_ROW_HEIGHT,
            actions.cancelBoardAction,
        );
    }

    private renderMovementStatus(
        state: GameViewState,
        actions: GameHudActions,
        actionMode: ActionModeOf<"movement">,
        panelY: number,
    ): void {
        const movingMonster = state.placedMonsters.find(
            (monster) => monster.id === actionMode.monsterId,
        );
        const movementRange = movingMonster
            ? getMonsterMovementRange(movingMonster)
            : DEFAULT_MOVEMENT_RANGE;
        this.addInstructionWithCancel(
            actionMode.monsterId
                ? `Choisis une case libre à ${movementRange} pas sur un dé posé`
                : "Choisis un monstre à déplacer",
            panelY,
            actions.cancelBoardAction,
        );
    }

    private renderTurnActions(state: GameViewState, actions: GameHudActions, panelY: number): void {
        const reserve = state.diceReserves[state.currentPlayer];
        const attackCount = getAvailableSymbolCount("attack", state.rolledDice, reserve);
        const movementCount = getAvailableSymbolCount("movement", state.rolledDice, reserve);
        const rightX = getHudRightX(this.scene);
        const turnActions: Array<[string, () => void]> = [];
        if (attackCount > 0 || hasFreeAttack(state)) {
            turnActions.push([
                attackCount > 0 ? `ATTAQUER ⚔️ (${attackCount})` : "ATTAQUER ⚔️ (gratuit)",
                actions.startAttack,
            ]);
        }
        if (canMove(state, movementCount)) {
            turnActions.push([
                movementCount > 0 ? `DÉPLACER ➡️ (${movementCount})` : "DÉPLACER ➡️ (gratuit)",
                actions.startMovement,
            ]);
        }
        turnActions.push(["FIN DU TOUR", actions.finishTurn]);
        turnActions.forEach(([label, callback], index) =>
            this.addButton(
                label,
                rightX,
                panelY + index * ACTION_ROW_HEIGHT,
                callback,
                WIDE_BUTTON_OPTIONS,
            ),
        );
    }
}
