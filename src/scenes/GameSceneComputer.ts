import { GameSceneComputerConversion } from "./GameSceneComputerConversion";
import { PLACEMENT_PATTERNS } from "../data/placementPatterns";
import { getAvailableSymbolCount, spendSymbols } from "../game/diceResources";
import {
    canAttackMonster,
    canTargetMonsterOwner,
    getAttackCost,
    getAttackDamage,
    getInitialAttackCooldowns,
    getInitialAttackUses,
    isBehind,
} from "../game/monsterActions";
import { findValidPlacement } from "../game/placement";
import { isBoardCell } from "../game/boards";
import type { Monster, PlacedMonster, Position } from "../types/GameTypes";
import { getInvokedMonsterCount } from "../game/matchRules";
import {
    canDeployMonsterForProfile,
    chooseBotObjective,
    createDefensivePlacementScorer,
    findObjectiveMovement,
    scoreMonsterForProfile,
    scoreTacticalAttack,
    scoreTerritoryExpansion,
    type TacticalAttackValue,
} from "../game/botStrategy";

interface ComputerAttackChoice {
    attacker: PlacedMonster;
    attackIndex: number;
    target: Position;
    score: number;
}

function isAreaAttack(attack: Monster["attacks"][number]): boolean {
    return (
        attack.hitsAllies === true ||
        attack.movesToZone === true ||
        attack.pattern.type === "directionalArea" ||
        attack.pattern.type === "selfRadius"
    );
}

function createTacticalValue(): TacticalAttackValue {
    return {
        damage: 0,
        kills: 0,
        statusDamage: 0,
        baseDamage: 0,
        healing: 0,
        clearedEffects: 0,
        buffs: 0,
        cooldownsReduced: 0,
        friendlyDamage: 0,
    };
}

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

    protected deployComputerMonsters(): void {
        let deployments = 0;
        while (
            deployments < this.playerDecks[2].length &&
            getInvokedMonsterCount(this.placedMonsters, 2) <
                this.gameConfiguration.maxMonstersPerPlayer
        ) {
            deployments++;
            const availableInvocation = getAvailableSymbolCount(
                "invocation",
                this.rolledDice,
                this.diceReserves[2],
            );
            const deploymentCounts = new Map<string, number>();
            for (const placed of this.placedMonsters) {
                if (placed.owner !== 2) continue;
                deploymentCounts.set(
                    placed.monster.id,
                    (deploymentCounts.get(placed.monster.id) ?? 0) + 1,
                );
            }
            const deployedCosts = this.placedMonsters
                .filter((placed) => placed.owner === 2)
                .map((placed) => placed.monster.cost);
            const candidates = this.getDeckMonsters(2)
                .filter((monster) => monster.cost <= availableInvocation)
                .filter((monster) =>
                    canDeployMonsterForProfile(monster, this.opponentProfile, deployedCosts),
                )
                .sort(
                    (first, second) => {
                        return (
                            (deploymentCounts.get(first.id) ?? 0) -
                            (deploymentCounts.get(second.id) ?? 0) ||
                            scoreMonsterForProfile(second, this.opponentProfile) -
                            scoreMonsterForProfile(first, this.opponentProfile)
                        );
                    },
                );
            let deployed = false;

            for (const monster of candidates) {
                const placement = this.findComputerPlacement();
                if (
                    !placement ||
                    !spendSymbols("invocation", monster.cost, this.rolledDice, this.diceReserves[2])
                ) {
                    continue;
                }

                this.placedMonsters.push({
                    id: `monster-${this.nextMonsterId++}`,
                    monster,
                    owner: 2,
                    position: placement.position,
                    facing: "west",
                    currentHp: monster.hp,
                    cells: placement.cells,
                    summonedOnTurn: this.turnNumber,
                    attacksUsedThisTurn: 0,
                    attackUsesThisTurn: getInitialAttackUses(monster),
                    movementsUsedThisTurn: 0,
                    attackCooldowns: getInitialAttackCooldowns(monster),
                    statusEffects: [],
                });
                this.recordAction({
                    type: "invocation",
                    player: 2,
                    monsterName: monster.name,
                    cost: monster.cost,
                });
                deployed = true;
                break;
            }

            if (!deployed) break;
        }
    }

    protected findComputerPlacement(): { position: Position; cells: Position[] } | null {
        const occupiedCells = [
            ...Object.values(this.startingPositions),
            ...this.placedMonsters.flatMap((placed) => placed.cells),
        ];
        const computerPathCells = this.placedMonsters
            .filter((placed) => placed.owner === 2)
            .flatMap((placed) => placed.cells);
        const computerTerritory = [this.startingPositions[2], ...computerPathCells];
        const computerTerritoryKeys = new Set(
            computerTerritory.map((cell) => `${cell.x},${cell.y}`),
        );
        const opponentTerritoryKeys = new Set(
            [
                this.startingPositions[1],
                ...this.placedMonsters
                    .filter((placed) => placed.owner === 1)
                    .flatMap((placed) => placed.cells),
            ].map((cell) => `${cell.x},${cell.y}`),
        );
        const enemyPositions = this.placedMonsters
            .filter((placed) => placed.owner === 1 && placed.currentHp > 0)
            .map((placed) => placed.position);
        const tactic = this.getComputerTactic();
        const expansionObjective =
            tactic === "hunt"
                ? this.startingPositions[2]
                : chooseBotObjective(
                      tactic,
                      this.startingPositions[2],
                      this.startingPositions[1],
                      enemyPositions,
                      this.startingPositions[2],
                  );
        const blockingCells = [
            ...this.board.blockedCells,
            ...this.obstacles.map(({ position }) => position),
            ...this.placedMonsters
                .filter((placed) => placed.currentHp > 0)
                .map((placed) => placed.position),
        ];
        const defensivePlacementScore = createDefensivePlacementScorer(
            this.startingPositions[2],
            enemyPositions,
            blockingCells,
        );
        return findValidPlacement({
            patterns: PLACEMENT_PATTERNS,
            boardWidth: this.board.width,
            boardHeight: this.board.height,
            start: this.startingPositions[2],
            occupiedCells,
            connectedCells: computerTerritory,
            overlappingCells: computerPathCells,
            blockedCells: [
                ...this.board.blockedCells,
                ...this.obstacles.map(({ position }) => position),
            ],
            isPlacementAllowed: (position, cells) => {
                const positionKey = `${position.x},${position.y}`;
                const isStartingCell = opponentTerritoryKeys.has(positionKey);
                const isMonsterOccupied = this.placedMonsters.some(
                    (monster) =>
                        monster.currentHp > 0 &&
                        monster.position.x === position.x &&
                        monster.position.y === position.y,
                );
                const addsTerritory = !computerTerritoryKeys.has(positionKey);
                const staysOnBoard = cells.every((cell) => isBoardCell(this.board, cell));
                const crossesEnemyTerritory = cells.some((cell) =>
                    opponentTerritoryKeys.has(`${cell.x},${cell.y}`),
                );
                return (
                    !isStartingCell &&
                    !isMonsterOccupied &&
                    addsTerritory &&
                    staysOnBoard &&
                    !crossesEnemyTerritory
                );
            },
            scorePlacement: (position, cells) =>
                scoreTerritoryExpansion(
                    2,
                    cells,
                    computerPathCells,
                    this.startingPositions[2],
                    expansionObjective,
                ) +
                (tactic === "defense" || tactic === "hunt" ? defensivePlacementScore(position) : 0),
        });
    }

    protected playComputerAttacks(): void {
        while (this.hasComputerAttackResource()) {
            if (!this.performComputerAttack()) break;
        }
    }

    protected hasComputerAttackResource(): boolean {
        return (
            this.winner === null &&
            this.placedMonsters.some(
                (monster) =>
                    monster.owner === 2 &&
                    monster.currentHp > 0 &&
                    monster.monster.attacks.some((_, index) =>
                        this.canUseMonsterAttack(monster, index),
                    ),
            )
        );
    }

    protected performComputerAttack(): boolean {
        const attackers = this.placedMonsters.filter(
            (monster) => monster.owner === 2 && monster.currentHp > 0,
        );
        let best: ComputerAttackChoice | null = null;
        for (const attacker of attackers) {
            for (const attackIndex of attacker.monster.attacks.keys()) {
                if (!this.canUseMonsterAttack(attacker, attackIndex)) continue;
                const attack = attacker.monster.attacks[attackIndex];
                if (!attack) continue;
                const cost = getAttackCost(
                    attack,
                    attacker.turnBuffs?.attackCostReduction ?? 0,
                );
                for (const target of this.getAttackCandidateCells(attacker.id, attackIndex)) {
                    if (!this.canAttackTarget(attacker.id, attackIndex, target)) continue;
                    const score = this.scoreComputerAttack(
                        attacker,
                        attackIndex,
                        target,
                        this.getAttackPreviewCells(attacker.id, attackIndex, target),
                        cost,
                    );
                    if (score > (best?.score ?? 0)) {
                        best = { attacker, attackIndex, target, score };
                    }
                }
            }
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

    protected scoreComputerAttack(
        attacker: PlacedMonster,
        attackIndex: number,
        target: Position,
        cells: readonly Position[],
        cost: number,
    ): number {
        const attack = attacker.monster.attacks[attackIndex];
        if (!attack) return 0;
        const value = createTacticalValue();
        const targetMonster = this.getLivingMonsterAt(target);

        if (attack.targetsAlliesOnly) {
            if (targetMonster?.owner !== 2) return 0;
            value.healing = Math.min(
                attack.healAmount ?? 0,
                targetMonster.monster.hp - targetMonster.currentHp,
            );
            value.clearedEffects = attack.clearsStatusEffects
                ? targetMonster.statusEffects.length
                : 0;
            value.cooldownsReduced = attack.cooldownReduction
                ? targetMonster.attackCooldowns.filter((cooldown) => cooldown > 0).length
                : 0;
            value.buffs =
                (attack.movementRangeBonus ?? 0) +
                (attack.movementCostReduction ?? 0) +
                (attack.attackDamageBonus ?? 0) * 2 +
                (attack.attackCostReduction ?? 0);
        } else {
            const affectedCells = isAreaAttack(attack) ? cells : [target];
            for (const cell of affectedCells) {
                if (
                    cell.x === this.startingPositions[1].x &&
                    cell.y === this.startingPositions[1].y
                ) {
                    value.baseDamage = 1;
                    continue;
                }
                const victim = this.getLivingMonsterAt(cell);
                if (
                    !victim ||
                    victim.id === attacker.id ||
                    (victim.owner === 2 && !attack.hitsAllies) ||
                    !canTargetMonsterOwner(attack, victim.owner, 2) ||
                    !canAttackMonster(attacker.monster, attack, victim.monster)
                ) {
                    continue;
                }
                const damage =
                    getAttackDamage(attack, attacker.turnBuffs?.attackDamageBonus ?? 0) +
                    (cell.x === target.x &&
                    cell.y === target.y &&
                    victim.owner === 1 &&
                    (attacker.monster.bonusDamageFromBehind ?? 0) > 0 &&
                    isBehind(victim.position, attacker.position, victim.facing)
                        ? attacker.monster.bonusDamageFromBehind ?? 0
                        : 0);
                const effectiveDamage = Math.min(victim.currentHp, damage);
                if (victim.owner === 2) {
                    value.friendlyDamage += effectiveDamage;
                } else {
                    value.damage += effectiveDamage;
                    if (damage >= victim.currentHp) value.kills++;
                    if (
                        attack.statusEffect &&
                        !victim.statusEffects.some(
                            (effect) => effect.type === attack.statusEffect?.type,
                        )
                    ) {
                        value.statusDamage +=
                            attack.statusEffect.damagePerTurn *
                            Math.min(
                                2,
                                typeof attack.statusEffect.duration === "number"
                                    ? attack.statusEffect.duration
                                    : 2,
                            );
                    }
                }
            }
        }

        return scoreTacticalAttack(
            value,
            cost,
            this.getComputerTactic(),
            this.playerHealth[1],
        );
    }

    protected playComputerMovements(): void {
        for (const monster of this.placedMonsters) {
            if (this.winner !== null) return;
            if (monster.owner !== 2 || monster.currentHp <= 0) continue;

            while (this.canAffordMovement(monster)) {
                const options = this.getMovementOptions(monster, monster.position);
                const ownedCells = this.placedMonsters
                    .filter((placed) => placed.owner === 2)
                    .flatMap((placed) => placed.cells);
                const enemyPositions = this.placedMonsters
                    .filter((placed) => placed.owner === 1 && placed.currentHp > 0)
                    .map((placed) => placed.position);
                const objective = chooseBotObjective(
                    this.getComputerTactic(),
                    monster.position,
                    this.startingPositions[1],
                    enemyPositions,
                    this.startingPositions[2],
                );
                const movement = findObjectiveMovement(
                    options,
                    ownedCells,
                    objective,
                    enemyPositions,
                    this.getComputerTactic(),
                );
                if (!movement) break;

                const movementsUsed = monster.movementsUsedThisTurn;
                this.actionMode = { type: "movement", monsterId: monster.id };
                this.handleMovementAction(movement.position, monster.id);
                this.actionMode = { type: "idle" };
                if (monster.movementsUsedThisTurn === movementsUsed) break;
            }
        }
    }
}
