import { GameSceneComputerConversion } from "./GameSceneComputerConversion";
import type { ComputerAttackChoice } from "./GameSceneComputerBase";
import {
    chooseBotObjective,
    findObjectiveMovement,
    scoreMonsterForProfile,
} from "../game/botStrategy";
import { assignMonsterRoles, createThreatScores } from "../game/ai";
import type { PlacedMonster } from "../types/GameTypes";

export abstract class GameSceneComputer extends GameSceneComputerConversion {
    protected playComputerTurn(): void {
        if (this.currentPlayer !== 2 || this.winner !== null) {
            this.computerTurnInProgress = false;
            return;
        }

        this.rollDice(true);
        this.convertComputerSymbols();
        this.deployComputerMonsters();
        this.playComputerAttacks();
        this.playComputerMovements();
        this.playComputerAttacks();
        this.computerTurnInProgress = false;
        this.actionMode = { type: "idle" };
        this.finishTurn();
    }

    private deployComputerMonsters(): void {
        let deployments = 0;
        while (deployments < this.playerDecks[2].length && !this.hasReachedMonsterLimit(2)) {
            deployments++;
            if (!this.deployComputerMonster()) break;
        }
    }

    private deployComputerMonster(): boolean {
        const deploymentCounts = new Map<string, number>();
        for (const { owner, monster } of this.placedMonsters) {
            if (owner === 2)
                deploymentCounts.set(monster.id, (deploymentCounts.get(monster.id) ?? 0) + 1);
        }
        const [monster] = this.getDeployableMonsters().sort(
            (first, second) =>
                (deploymentCounts.get(first.id) ?? 0) - (deploymentCounts.get(second.id) ?? 0) ||
                scoreMonsterForProfile(second, this.opponentProfile) -
                    scoreMonsterForProfile(first, this.opponentProfile),
        );
        const placement = monster ? this.findComputerPlacement() : null;
        if (!monster || !placement || !this.spendCurrentSymbol("invocation", monster.cost)) {
            return false;
        }

        this.placedMonsters.push(
            this.createPlacedMonster(monster, 2, placement.position, placement.cells),
        );
        this.recordAction({
            type: "invocation",
            player: 2,
            monsterName: monster.name,
            cost: monster.cost,
        });
        return true;
    }

    private playComputerAttacks(): void {
        let attacked = true;
        while (attacked && this.hasComputerAttackResource()) {
            attacked = this.performComputerAttack();
        }
    }

    private hasComputerAttackResource(): boolean {
        return this.winner === null && this.getComputerAttackOptions().length > 0;
    }

    private performComputerAttack(): boolean {
        const roles = new Map(
            assignMonsterRoles(this.createComputerStrategicSnapshot(), 2).map((role) => [
                role.monsterId,
                role,
            ]),
        );
        let best: ComputerAttackChoice | undefined;
        for (const choice of this.getComputerAttackChoices(roles)) {
            if (choice.score > (best?.score ?? 0)) best = choice;
        }
        if (!best) return false;

        this.executeAttack(
            best.attacker,
            best.attackIndex,
            best.target,
            this.getLivingMonsterAt(best.target),
        );
        return true;
    }

    private playComputerMovements(): void {
        for (const monster of this.placedMonsters) {
            if (this.winner !== null) return;
            if (monster.owner !== 2 || monster.currentHp <= 0) continue;

            let moved = true;
            while (moved && this.canAffordMovement(monster)) {
                moved = this.moveComputerMonster(monster);
            }
        }
    }

    private moveComputerMonster(monster: PlacedMonster): boolean {
        const tactic = this.getComputerTactic();
        const enemyPositions = this.getEnemyPositions();
        const role = assignMonsterRoles(this.createComputerStrategicSnapshot(tactic), 2).find(
            (assignment) => assignment.monsterId === monster.id,
        );
        const objective =
            role?.target ??
            chooseBotObjective(
                tactic,
                monster.position,
                this.startingPositions[1],
                enemyPositions,
                this.startingPositions[2],
            );
        const movement = findObjectiveMovement(
            this.getMovementOptions(monster, monster.position),
            objective,
            enemyPositions,
            tactic,
            createThreatScores(
                { ...this.board, blockedCells: this.getBlockedCells() },
                this.placedMonsters,
                monster.id,
                true,
            ),
        );
        if (!movement) return false;

        const movementsUsed = monster.movementsUsedThisTurn;
        this.actionMode = { type: "movement", monsterId: monster.id };
        this.handleMovementAction(movement.position, monster.id);
        this.actionMode = { type: "idle" };
        return monster.movementsUsedThisTurn !== movementsUsed;
    }
}
