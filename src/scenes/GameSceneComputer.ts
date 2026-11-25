import { GameSceneComputerConversion } from "./GameSceneComputerConversion";
import type { ComputerAttackChoice } from "./GameSceneComputerBase";
import {
    chooseBotObjective,
    DEFAULT_BOT_STRATEGY_WEIGHTS,
    scoreMonsterForProfile,
} from "../game/botStrategy";
import { createObjectivePlanner } from "../game/botMovement";
import { selectAttackSetupMovement } from "../game/attackSetupMovement";
import { createFormationScorer } from "../game/formation";
import {
    clearCamouflageForMovement,
    consumeMovementTurnBuff,
    getFacingFromMovement,
    getGridDistance,
} from "../game/monsterActions";
import { assignMonsterRoles, createThreatScores } from "../game/ai";
import type { PlacedMonster, Position } from "../types/GameTypes";

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
        const placement = monster ? this.findComputerPlacement(monster) : null;
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
        const planner = createObjectivePlanner(
            this.getMovementOptions(monster, monster.position),
            enemyPositions,
            tactic,
            createThreatScores(
                { ...this.board, blockedCells: this.getBlockedCells() },
                this.placedMonsters,
                monster.id,
                true,
            ),
            DEFAULT_BOT_STRATEGY_WEIGHTS,
        );
        const strategicMovement = planner.toward(objective);
        const attackSetup = this.getComputerAttackOptions(monster.id).length
            ? selectAttackSetupMovement(
                  planner.paths,
                  strategicMovement,
                  objective,
                  this.getMonsterAttackScore(monster.id),
                  (path) => this.getAttackScoreAfterMovement(monster, path),
              )
            : null;
        const movement = attackSetup ?? strategicMovement;
        if (!movement) return false;
        const guardingGate =
            tactic === "defense" &&
            this.getLivingMonsters(2).length > 1 &&
            enemyPositions.some(
                (position) => getGridDistance(position, this.startingPositions[2]) <= 5,
            ) &&
            createFormationScorer(
                this.board,
                this.placedMonsters,
                2,
                this.startingPositions[2],
            ).guardsLastEntrance(monster.position);
        const winsImmediately =
            guardingGate &&
            attackSetup !== null &&
            this.getAttackScoreAfterMovement(monster, attackSetup.path) >=
                Number.MAX_SAFE_INTEGER * 10;
        if (
            guardingGate &&
            !winsImmediately &&
            this.getComputerMovementReplyPenalty(monster, movement.path) >
                this.getComputerReplyPenalty(this.placedMonsters)
        ) {
            return false;
        }

        const movementsUsed = monster.movementsUsedThisTurn;
        this.actionMode = { type: "movement", monsterId: monster.id };
        this.handleMovementAction(movement.position, monster.id);
        this.actionMode = { type: "idle" };
        const moved = monster.movementsUsedThisTurn !== movementsUsed;
        if (moved && attackSetup) this.playComputerAttacks();
        return moved && !attackSetup;
    }

    private getMonsterAttackScore(monsterId: string): number {
        const roles = new Map(
            assignMonsterRoles(this.createComputerStrategicSnapshot(), 2).map((role) => [
                role.monsterId,
                role,
            ]),
        );
        let score = 0;
        for (const choice of this.getComputerAttackChoices(roles, monsterId)) {
            score = Math.max(score, choice.score);
        }
        return score;
    }

    private getAttackScoreAfterMovement(monster: PlacedMonster, path: Position[]): number {
        const index = this.placedMonsters.indexOf(monster);
        if (index < 0) throw new Error(`Monstre introuvable : ${monster.id}`);
        const destination = path[path.length - 1]!;
        const candidate: PlacedMonster = {
            ...monster,
            position: destination,
            facing: getFacingFromMovement(monster.position, destination, monster.facing),
            ...(monster.turnBuffs ? { turnBuffs: { ...monster.turnBuffs } } : {}),
        };
        clearCamouflageForMovement(candidate, path);
        consumeMovementTurnBuff(candidate);
        this.placedMonsters[index] = candidate;
        try {
            return this.getMonsterAttackScore(candidate.id);
        } finally {
            this.placedMonsters[index] = monster;
        }
    }
}
