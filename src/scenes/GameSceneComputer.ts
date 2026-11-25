import { GameSceneMovement } from "./GameSceneMovement";
import { createComputerBotContext } from "./computerBotState";
import {
    decideNextAction,
    decidePlayerTurn,
    executeBotAction,
    recordBotTurn,
    type PlayerTurnContext,
} from "../simulation/playerTurn";
import { recordResolvedAttack } from "../simulation/combat/attackExecution";
import { resolveAttackChoice } from "../simulation/combat/attackChoices";
import type { BotAction } from "../simulation/botAction";

export abstract class GameSceneComputer extends GameSceneMovement {
    protected playComputerTurn(): void {
        if (this.currentPlayer !== 2 || this.winner !== null) {
            this.computerTurnInProgress = false;
            return;
        }

        const context = this.createComputerContext();
        const decider = decidePlayerTurn(context, 2);
        for (let action = decideNextAction(decider); action; action = decideNextAction(decider)) {
            this.executeComputerAction(context, action);
        }
        this.computerTurnInProgress = false;
        this.actionMode = { type: "idle" };
        this.finishTurn();
    }

    protected createComputerContext(): PlayerTurnContext {
        return createComputerBotContext({
            board: this.board,
            configuration: this.gameConfiguration,
            turn: this.turnNumber,
            profile: this.opponentProfile,
            playerProfile: this.playerProfile,
            options: this.botOptions,
            weights: this.botStrategyWeights,
            health: this.playerHealth,
            reserves: this.diceReserves,
            monsters: this.placedMonsters,
            obstacles: this.obstacles,
            nextMonsterId: this.nextMonsterId,
            decks: this.playerDecks,
            deckMonsters: { 1: this.getDeckMonsters(1), 2: this.getDeckMonsters(2) },
            random: this.randomStreams,
        });
    }

    protected executeComputerAction(context: PlayerTurnContext, action: BotAction): void {
        const { state } = context;
        const player = state.currentPlayer;
        if (action.type === "roll") {
            this.rollDice(true);
            if (!this.hasRolled) throw new Error("Le bot n'a pas pu lancer les dés.");
            recordBotTurn(
                context,
                action.player,
                this.rolledDice.map(({ symbol }) => symbol),
            );
            return;
        }
        if (action.type === "attack") {
            const choice = resolveAttackChoice(state, action.choice);
            const { attacker, attackIndex, target } = choice;
            const attack = attacker.monster.attacks[attackIndex];
            if (!attack) throw new Error("Attaque du bot introuvable.");
            const cost = this.getMonsterAttackCost(attacker, attack);
            const resolution = this.executeAttack(
                attacker,
                attackIndex,
                target,
                this.getLivingMonsterAt(target),
            );
            if (!resolution) throw new Error("L'attaque choisie par le bot est illégale.");
            state.statistics[player].symbolsSpent.attack += cost;
            state.winner = this.winner;
            recordResolvedAttack(state, choice, attack, cost, resolution);
            return;
        }
        if (action.type === "move") {
            const monster = state.monsters.find(({ id }) => id === action.monsterId);
            if (!monster) throw new Error(`Monstre à déplacer introuvable : ${action.monsterId}`);
            const wasCamouflaged = monster.isCamouflaged === true;
            executeBotAction(context, action);
            if (wasCamouflaged && !monster.isCamouflaged) {
                this.monsterSpriteView.clearCamouflage(monster.id);
            }
            if (!this.monsterSpriteView.isMoving(monster.id)) {
                this.monsterSpriteView.moveMonster(
                    monster.id,
                    action.movement.path.slice(1),
                    monster.facing,
                    () => this.render(),
                );
            }
            this.recordAction({
                type: "movement",
                player,
                monsterName: monster.monster.name,
                distance: action.movement.path.length - 1,
            });
            this.render();
            return;
        }
        executeBotAction(context, action);
        if (action.type === "summon") {
            this.nextMonsterId = state.nextMonsterId;
            const monster = context.deckMonsters[player].find(({ id }) => id === action.monsterId);
            if (!monster) throw new Error("Monstre invoqué introuvable.");
            this.recordAction({
                type: "invocation",
                player,
                monsterName: monster.name,
                cost: monster.cost,
            });
            this.render();
        }
    }
}
