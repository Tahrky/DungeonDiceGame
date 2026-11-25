import { GameSceneMovement } from "./GameSceneMovement";
import { getComputerAttackValue, getRoleBonus } from "./computerAttackValue";
import { PLACEMENT_PATTERNS } from "../data/placementPatterns";
import { positionKey } from "../game/geometry";
import { findValidPlacement } from "../game/placement";
import {
    canDeployMonsterForProfile,
    chooseBotObjective,
    chooseBotTactic,
    createDefensivePlacementScorer,
    createPathBlockadeScorer,
    createTerritoryExpansionScorer,
    findObjectiveMovement,
    scoreTacticalAttack,
} from "../game/botStrategy";
import { createStrategicCellScorer, type RoleAssignment, type StrategicSnapshot } from "../game/ai";
import type { Monster, MonsterAttack, PlacedMonster, Position } from "../types/GameTypes";

export interface ComputerAttackOption {
    attacker: PlacedMonster;
    attackIndex: number;
    attack: MonsterAttack;
    cost: number;
}

export interface ComputerAttackChoice {
    attacker: PlacedMonster;
    attackIndex: number;
    target: Position;
    score: number;
}

export abstract class GameSceneComputerBase extends GameSceneMovement {
    protected getComputerTactic() {
        return chooseBotTactic(this.opponentProfile, "balanced").tactic;
    }

    protected createComputerStrategicSnapshot(
        tactic = this.getComputerTactic(),
    ): StrategicSnapshot {
        return {
            board: this.board,
            blockedCells: this.obstacles.map(({ position }) => position),
            health: { ...this.playerHealth },
            initialHealth: this.gameConfiguration.initialPlayerHealth,
            monsters: this.placedMonsters,
            reserves: {
                1: { ...this.diceReserves[1] },
                2: { ...this.diceReserves[2] },
            },
            profile: this.opponentProfile,
            tactics: { 1: "balanced", 2: tactic },
            currentPlayer: 2,
            turn: this.turnNumber,
        };
    }

    protected getEnemyPositions(): Position[] {
        return this.getLivingMonsters(1).map(({ position }) => position);
    }

    protected getDeployableMonsters(): Monster[] {
        const availableInvocation = this.getAvailableSymbols("invocation", 2);
        const deployedCosts = this.placedMonsters
            .filter(({ owner }) => owner === 2)
            .map(({ monster }) => monster.cost);
        return this.getDeckMonsters(2).filter(
            (monster) =>
                monster.cost <= availableInvocation &&
                canDeployMonsterForProfile(monster, this.opponentProfile, deployedCosts),
        );
    }

    protected canDeployComputerMonster(): boolean {
        return !this.hasReachedMonsterLimit(2) && this.findComputerPlacement() !== null;
    }

    protected findComputerPlacement(): { position: Position; cells: Position[] } | null {
        const start = this.startingPositions[2];
        const enemyStart = this.startingPositions[1];
        const tactic = this.getComputerTactic();
        const defends = tactic === "defense" || tactic === "hunt";
        const pathCells = this.getOwnedCells(2);
        const enemyPositions = this.getEnemyPositions();
        const blockedCells = this.getBlockedCells();
        const livingMonsterKeys = new Set(
            this.getLivingMonsters().map(({ position }) => positionKey(position)),
        );
        const opponentTerritoryKeys = new Set(
            [enemyStart, ...this.getOwnedCells(1)].map(positionKey),
        );
        const expansionObjective =
            tactic === "hunt"
                ? start
                : chooseBotObjective(tactic, start, enemyStart, enemyPositions, start);
        const territoryExpansionScore = createTerritoryExpansionScorer(
            2,
            pathCells,
            start,
            expansionObjective,
        );
        const defensivePlacementScore = defends
            ? createDefensivePlacementScorer(start, enemyPositions, [
                  ...blockedCells,
                  ...this.getLivingMonsters().map(({ position }) => position),
              ])
            : () => 0;
        const pathBlockadeScore = defends
            ? createPathBlockadeScorer(
                  this.board.width,
                  this.board.height,
                  start,
                  enemyStart,
                  pathCells,
                  blockedCells,
              )
            : () => 0;
        const strategicCellScore = createStrategicCellScorer(
            this.createComputerStrategicSnapshot(tactic),
            2,
        );
        const preservesFirstDeployment = this.getOpponentFirstDeploymentProtection(2);
        return findValidPlacement({
            patterns: PLACEMENT_PATTERNS,
            boardWidth: this.board.width,
            boardHeight: this.board.height,
            start,
            occupiedCells: this.getOccupiedCells(),
            connectedCells: [start, ...pathCells],
            overlappingCells: pathCells,
            blockedCells,
            isPlacementAllowed: (position, cells) =>
                !opponentTerritoryKeys.has(positionKey(position)) &&
                !livingMonsterKeys.has(positionKey(position)) &&
                !cells.some((cell) => opponentTerritoryKeys.has(positionKey(cell))) &&
                (!preservesFirstDeployment || preservesFirstDeployment(cells)),
            scorePlacement: (position, cells) =>
                territoryExpansionScore(cells) +
                defensivePlacementScore(position) +
                pathBlockadeScore(cells) +
                strategicCellScore(position) * 0.5,
        });
    }

    protected getComputerAttackOptions(): ComputerAttackOption[] {
        return this.getLivingMonsters(2).flatMap((attacker) =>
            attacker.monster.attacks.flatMap((attack, attackIndex) =>
                this.canUseMonsterAttack(attacker, attackIndex)
                    ? [
                          {
                              attacker,
                              attackIndex,
                              attack,
                              cost: this.getMonsterAttackCost(attacker, attack),
                          },
                      ]
                    : [],
            ),
        );
    }

    protected *getComputerAttackChoices(
        roles?: ReadonlyMap<string, RoleAssignment>,
    ): Generator<ComputerAttackChoice> {
        const tactic = this.getComputerTactic();
        for (const { attacker, attackIndex, attack, cost } of this.getComputerAttackOptions()) {
            for (const target of this.getAttackCandidateCells(attacker.id, attackIndex)) {
                if (!this.canAttackTarget(attacker.id, attackIndex, target)) continue;
                const cells = this.getAttackPreviewCells(attacker.id, attackIndex, target);
                const value = getComputerAttackValue(attacker, attack, target, cells, {
                    enemyStart: this.startingPositions[1],
                    getLivingMonsterAt: (position) => this.getLivingMonsterAt(position),
                });
                const score = value
                    ? scoreTacticalAttack(value, cost, tactic, this.playerHealth[1]) * 10 +
                      getRoleBonus(value, roles?.get(attacker.id))
                    : 0;
                yield { attacker, attackIndex, target, score };
            }
        }
    }

    protected findComputerMovement(monster: PlacedMonster) {
        const tactic = this.getComputerTactic();
        const enemyPositions = this.getEnemyPositions();
        return findObjectiveMovement(
            this.getMovementOptions(monster, monster.position),
            chooseBotObjective(
                tactic,
                monster.position,
                this.startingPositions[1],
                enemyPositions,
                this.startingPositions[2],
            ),
            enemyPositions,
            tactic,
        );
    }
}
