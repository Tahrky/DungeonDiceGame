import {
    applyMonsterTurnBuff,
    canAttackBaseThisTurn,
    canAttackMonster,
    canTargetMonsterOwner,
    canUseActionThisTurn,
    canUseMonsterAttackThisTurn,
    clearMonsterTurnBuff,
    getAttackActionsPerTurn,
    getAttackCost,
    getAttackDamage,
    getAttackZoneOptions,
    getFacingFromMovement,
    getGridDistance,
    getInitialAttackUses,
    hasLineOfSight,
    isBehind,
} from "../game/monsterActions";
import { getStartingPositions, isBoardCell, type BoardDefinition } from "../game/boards";
import { getMonsterEliminationWinner } from "../game/matchRules";
import {
    applyStatusEffectsAtTurnStart,
    clearStatusEffects,
    healMonster,
} from "../game/statusEffects";
import { scoreTacticalAttack, type TacticalAttackValue } from "../game/botStrategy";
import type {
    Monster,
    PlayerId,
    PlacedMonster,
    Position,
    StatusEffectDefinition,
} from "../types/GameTypes";
import {
    addEvent,
    canSpend,
    getPlayerMonsters,
    opposingPlayer,
    spend,
    type MatchState,
} from "./matchState";
import type { GameConfiguration } from "../game/gameConfiguration";

interface AttackChoice {
    attacker: PlacedMonster;
    attackIndex: number;
    target: Position;
    cells: Position[];
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

function hasJumpLanding(
    state: MatchState,
    board: BoardDefinition,
    attacker: PlacedMonster,
    cells: readonly Position[],
): boolean {
    const occupied = state.monsters
        .filter((monster) => monster.currentHp > 0 && monster.id !== attacker.id)
        .map((monster) => monster.position);
    const starts = Object.values(getStartingPositions(board));
    return cells.some(
        (cell) =>
            state.monsters.some((monster) =>
                monster.cells.some((deployed) => deployed.x === cell.x && deployed.y === cell.y),
            ) &&
            !occupied.some((position) => position.x === cell.x && position.y === cell.y) &&
            !starts.some((position) => position.x === cell.x && position.y === cell.y),
    );
}

function isValidAttackCell(
    state: MatchState,
    board: BoardDefinition,
    attacker: PlacedMonster,
    attack: Monster["attacks"][number],
    cell: Position,
): boolean {
    if (!isBoardCell(board, cell)) return false;
    if (
        attack.pattern.type === "jumpArea" &&
        getGridDistance(attacker.position, cell) > attack.pattern.range
    ) {
        return false;
    }
    const enemyStart = getStartingPositions(board)[opposingPlayer(state.currentPlayer)];
    if (cell.x === enemyStart.x && cell.y === enemyStart.y) {
        return (
            !attack.targetsAlliesOnly &&
            canAttackBaseThisTurn(
                attacker.summonedOnTurn,
                state.turn,
                state.allowBaseAttackOnSummonTurn,
            )
        );
    }

    const target = state.monsters.find(
        (monster) =>
            monster.currentHp > 0 && monster.position.x === cell.x && monster.position.y === cell.y,
    );
    if (!target || (target.id === attacker.id && !attack.targetsSelf)) return false;
    if (!canTargetMonsterOwner(attack, target.owner, state.currentPlayer)) return false;
    if (
        attack.healAmount !== undefined &&
        target.currentHp >= target.monster.hp &&
        (!attack.clearsStatusEffects || target.statusEffects.length === 0)
    ) {
        return false;
    }
    if (
        attack.cooldownReduction !== undefined &&
        !target.attackCooldowns.some((cooldown) => cooldown > 0)
    ) {
        return false;
    }
    return canAttackMonster(attacker.monster, attack, target.monster);
}

function evaluateAttack(
    state: MatchState,
    board: BoardDefinition,
    attacker: PlacedMonster,
    attackIndex: number,
    target: Position,
    cells: readonly Position[],
): TacticalAttackValue {
    const attack = attacker.monster.attacks[attackIndex];
    const value: TacticalAttackValue = {
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
    if (!attack) return value;

    if (attack.targetsAlliesOnly) {
        const ally = state.monsters.find(
            (monster) =>
                monster.currentHp > 0 &&
                monster.owner === state.currentPlayer &&
                monster.position.x === target.x &&
                monster.position.y === target.y,
        );
        if (!ally) return value;
        value.healing = Math.min(attack.healAmount ?? 0, ally.monster.hp - ally.currentHp);
        value.clearedEffects = attack.clearsStatusEffects ? ally.statusEffects.length : 0;
        value.cooldownsReduced = attack.cooldownReduction
            ? ally.attackCooldowns.filter((cooldown) => cooldown > 0).length
            : 0;
        value.buffs =
            (attack.movementRangeBonus ?? 0) +
            (attack.movementCostReduction ?? 0) +
            (attack.attackDamageBonus ?? 0) * 2 +
            (attack.attackCostReduction ?? 0);
        return value;
    }

    const enemyStart = getStartingPositions(board)[opposingPlayer(state.currentPlayer)];
    const canHitBase = canAttackBaseThisTurn(
        attacker.summonedOnTurn,
        state.turn,
        state.allowBaseAttackOnSummonTurn,
    );
    const affectedCells = isAreaAttack(attack) ? cells : [target];
    for (const cell of affectedCells) {
        if (!isBoardCell(board, cell)) continue;
        if (canHitBase && cell.x === enemyStart.x && cell.y === enemyStart.y) {
            value.baseDamage = 1;
            continue;
        }
        const victim = state.monsters.find(
            (monster) =>
                monster.currentHp > 0 &&
                monster.position.x === cell.x &&
                monster.position.y === cell.y,
        );
        if (!victim || (victim.id === attacker.id && !attack.targetsSelf)) continue;
        if (!canTargetMonsterOwner(attack, victim.owner, state.currentPlayer)) continue;
        if (!canAttackMonster(attacker.monster, attack, victim.monster)) continue;
        const damage = getAttackDamage(attack, attacker.turnBuffs?.attackDamageBonus ?? 0);
        const effectiveDamage = Math.min(victim.currentHp, damage);
        if (victim.owner === state.currentPlayer) {
            if (attack.hitsAllies) value.friendlyDamage += effectiveDamage;
        } else {
            value.damage += effectiveDamage;
            if (damage >= victim.currentHp) value.kills++;
            const effect = attack.statusEffect;
            if (effect && !victim.statusEffects.some((existing) => existing.type === effect.type)) {
                value.statusDamage +=
                    effect.damagePerTurn *
                    Math.min(2, typeof effect.duration === "number" ? effect.duration : 2);
            }
        }
    }
    return value;
}

function getAttackChoices(
    state: MatchState,
    board: BoardDefinition,
    attacker: PlacedMonster,
    attackIndex: number,
): AttackChoice[] {
    const attack = attacker.monster.attacks[attackIndex];
    if (!attack) return [];
    const enemyStart = getStartingPositions(board)[opposingPlayer(state.currentPlayer)];
    const canHitBase = canAttackBaseThisTurn(
        attacker.summonedOnTurn,
        state.turn,
        state.allowBaseAttackOnSummonTurn,
    );
    const blockers = state.monsters
        .filter((monster) => monster.currentHp > 0 && monster.id !== attacker.id)
        .map((monster) => monster.position);

    const choices = getAttackZoneOptions(
        attacker.position,
        attacker.facing,
        attack.pattern,
        attack.targetsSelf,
    )
        .filter(({ target, cells }) => {
            if (!isBoardCell(board, target)) return false;
            if (target.x === enemyStart.x && target.y === enemyStart.y && !canHitBase) {
                return false;
            }
            if (!isAreaAttack(attack) && !hasLineOfSight(attacker.position, target, blockers)) {
                return false;
            }
            if (attack.movesToZone && !hasJumpLanding(state, board, attacker, cells)) {
                return false;
            }
            return cells.some((cell) => isValidAttackCell(state, board, attacker, attack, cell));
        })
        .map((option) => ({
            attacker,
            attackIndex,
            ...option,
            score: scoreTacticalAttack(
                evaluateAttack(state, board, attacker, attackIndex, option.target, option.cells),
                getAttackCost(attack, attacker.turnBuffs?.attackCostReduction ?? 0),
                state.tactics[state.currentPlayer],
                state.health[opposingPlayer(state.currentPlayer)],
                state.profiles[state.currentPlayer],
            ),
        }))
        .filter((choice) => choice.score > 0);
    return choices;
}

function chooseAttack(state: MatchState, board: BoardDefinition): AttackChoice | null {
    const choices: AttackChoice[] = [];
    for (const attacker of getPlayerMonsters(state, state.currentPlayer)) {
        if (
            !canUseActionThisTurn(
                attacker.attacksUsedThisTurn,
                getAttackActionsPerTurn(attacker.monster),
            )
        ) {
            continue;
        }
        for (const [attackIndex, attack] of attacker.monster.attacks.entries()) {
            const cost = getAttackCost(attack, attacker.turnBuffs?.attackCostReduction ?? 0);
            if (
                !canSpend(state, state.currentPlayer, "attack", cost) ||
                (attacker.attackCooldowns[attackIndex] ?? 0) > 0 ||
                !canUseMonsterAttackThisTurn(attack, attacker.attackUsesThisTurn[attackIndex] ?? 0)
            ) {
                continue;
            }
            choices.push(...getAttackChoices(state, board, attacker, attackIndex));
        }
    }
    state.statistics[state.currentPlayer].positionsExplored += choices.length;
    state.statistics[state.currentPlayer].branchesExplored += choices.length;
    choices.sort((first, second) => second.score - first.score);
    return choices[0] ?? null;
}

function applyStatusEffect(
    target: PlacedMonster,
    effect: StatusEffectDefinition | undefined,
    source: PlacedMonster,
): void {
    if (target.currentHp <= 0) {
        clearStatusEffects(target);
    } else if (effect) {
        target.statusEffects = [
            ...target.statusEffects.filter((existing) => existing.type !== effect.type),
            {
                ...effect,
                remainingTurns: effect.duration,
                source: {
                    id: source.id,
                    monsterId: source.monster.id,
                    name: source.monster.name,
                    owner: source.owner,
                },
            },
        ];
    }
}

function damageBase(state: MatchState, player: PlayerId): void {
    const opponent = opposingPlayer(player);
    state.health[opponent]--;
    state.statistics[player].baseDamage++;
    if (state.health[opponent] <= 0) {
        state.health[opponent] = 0;
        state.winner = player;
        state.finishReason = "baseDestroyed";
    }
}

function getJumpLanding(
    state: MatchState,
    board: BoardDefinition,
    attacker: PlacedMonster,
    cells: readonly Position[],
): Position | undefined {
    const occupied = state.monsters
        .filter((monster) => monster.currentHp > 0 && monster.id !== attacker.id)
        .map((monster) => monster.position);
    const starts = Object.values(getStartingPositions(board));
    return cells
        .filter(
            (cell) =>
                state.monsters.some((monster) =>
                    monster.cells.some(
                        (deployed) => deployed.x === cell.x && deployed.y === cell.y,
                    ),
                ) &&
                !occupied.some((position) => position.x === cell.x && position.y === cell.y) &&
                !starts.some((position) => position.x === cell.x && position.y === cell.y),
        )
        .sort(
            (first, second) =>
                getGridDistance(attacker.position, first) -
                getGridDistance(attacker.position, second),
        )[0];
}

function executeAttack(state: MatchState, board: BoardDefinition, choice: AttackChoice): void {
    const { attacker, attackIndex, target, cells } = choice;
    const attack = attacker.monster.attacks[attackIndex];
    if (!attack) return;
    const player = state.currentPlayer;
    const targetMonster = state.monsters.find(
        (monster) =>
            monster.currentHp > 0 &&
            monster.position.x === target.x &&
            monster.position.y === target.y,
    );
    const cost = getAttackCost(attack, attacker.turnBuffs?.attackCostReduction ?? 0);
    if (!spend(state, player, "attack", cost)) return;
    attacker.facing = getFacingFromMovement(attacker.position, target, attacker.facing);
    attacker.attacksUsedThisTurn++;
    attacker.attackUsesThisTurn[attackIndex] = (attacker.attackUsesThisTurn[attackIndex] ?? 0) + 1;
    if (attack.cooldownTurns !== undefined) {
        attacker.attackCooldowns[attackIndex] = attack.cooldownTurns;
    }
    const stats = state.statistics[player];
    stats.attacks++;
    let actualDamage = 0;
    let actionTarget = "case vide";
    let supportEffect = "";

    if (attack.targetsAlliesOnly && targetMonster?.owner === player) {
        actionTarget = `${targetMonster.monster.name} (J${player})`;
        if (attack.healAmount !== undefined) {
            const { healed, clearedEffects } = healMonster(
                targetMonster,
                attack.healAmount,
                attack.clearsStatusEffects,
            );
            supportEffect = `soigne ${healed} PV${clearedEffects ? " et dissipe les effets" : ""}`;
        } else if (attack.cooldownReduction !== undefined) {
            if (attack.clearsStatusEffects) clearStatusEffects(targetMonster);
            targetMonster.attackCooldowns = targetMonster.attackCooldowns.map((cooldown) =>
                Math.max(0, cooldown - attack.cooldownReduction!),
            );
            supportEffect = "réduit les recharges";
        } else {
            applyMonsterTurnBuff(targetMonster, attack);
            supportEffect = "applique un bonus temporaire";
        }
    } else if (isAreaAttack(attack)) {
        if (attack.movesToZone) {
            const landing = getJumpLanding(state, board, attacker, cells);
            if (landing) {
                attacker.facing = getFacingFromMovement(
                    attacker.position,
                    landing,
                    attacker.facing,
                );
                attacker.position = landing;
            }
        }
        const enemyStart = getStartingPositions(board)[opposingPlayer(player)];
        for (const victim of state.monsters) {
            const inZone = cells.some(
                (cell) => cell.x === victim.position.x && cell.y === victim.position.y,
            );
            if (
                victim.currentHp <= 0 ||
                victim.id === attacker.id ||
                !inZone ||
                (!attack.hitsAllies && victim.owner === player) ||
                !canAttackMonster(attacker.monster, attack, victim.monster)
            ) {
                continue;
            }
            const damage = getAttackDamage(attack, attacker.turnBuffs?.attackDamageBonus ?? 0);
            victim.currentHp -= damage;
            actualDamage += damage;
            stats.damageDealt += damage;
            state.statistics[victim.owner].damageReceived += damage;
            applyStatusEffect(victim, attack.statusEffect, attacker);
            actionTarget = `${victim.monster.name} (J${victim.owner})`;
            if (victim.currentHp <= 0 && victim.owner !== player) {
                stats.monstersKilled++;
                state.statistics[victim.owner].monstersLost++;
                actionTarget += " éliminé";
            }
        }
        if (
            canAttackBaseThisTurn(
                attacker.summonedOnTurn,
                state.turn,
                state.allowBaseAttackOnSummonTurn,
            ) &&
            cells.some((cell) => cell.x === enemyStart.x && cell.y === enemyStart.y)
        ) {
            damageBase(state, player);
            actionTarget = `base J${opposingPlayer(player)}`;
            actualDamage++;
        }
    } else if (targetMonster && targetMonster.owner !== player) {
        const backstab =
            (attacker.monster.bonusDamageFromBehind ?? 0) > 0 &&
            isBehind(targetMonster.position, attacker.position, targetMonster.facing);
        const damage =
            getAttackDamage(attack, attacker.turnBuffs?.attackDamageBonus ?? 0) +
            (backstab ? (attacker.monster.bonusDamageFromBehind ?? 0) : 0);
        targetMonster.currentHp -= damage;
        actualDamage = damage;
        stats.damageDealt += damage;
        state.statistics[targetMonster.owner].damageReceived += damage;
        actionTarget = `${targetMonster.monster.name} (J${targetMonster.owner})`;
        applyStatusEffect(targetMonster, attack.statusEffect, attacker);
        if (targetMonster.currentHp <= 0) {
            stats.monstersKilled++;
            state.statistics[targetMonster.owner].monstersLost++;
            actionTarget += " éliminé";
        }
    } else {
        const enemyStart = getStartingPositions(board)[opposingPlayer(player)];
        if (
            target.x === enemyStart.x &&
            target.y === enemyStart.y &&
            canAttackBaseThisTurn(
                attacker.summonedOnTurn,
                state.turn,
                state.allowBaseAttackOnSummonTurn,
            )
        ) {
            damageBase(state, player);
            actionTarget = `base J${opposingPlayer(player)}`;
            actualDamage = 1;
        }
    }

    const actionDescription = supportEffect
        ? `${attacker.monster.name} ${supportEffect} sur ${actionTarget}.`
        : `${attacker.monster.name} utilise « ${attack.name} » sur ${actionTarget}` +
          `${actualDamage ? ` (${actualDamage} dégât(s))` : ""}.`;
    if (actualDamage === 0 && !supportEffect) {
        stats.ineffectiveActions++;
    }
    addEvent(state, player, "strategy", `Priorité d'action : score tactique ${choice.score}.`, {
        monsterId: attacker.id,
        monsterTypeId: attacker.monster.id,
        monsterName: attacker.monster.name,
        target: actionTarget,
        ...(state.debug
            ? {
                  debug: {
                      situation: `base J${player}=${state.health[player]}, base adverse=${state.health[opposingPlayer(player)]}`,
                      candidates: 1,
                      depth: 1,
                      positionsExplored: state.monsters.length,
                      selectedAction: actionDescription,
                  },
              }
            : {}),
    });
    addEvent(state, player, "attack", actionDescription, {
        monsterId: attacker.id,
        monsterTypeId: attacker.monster.id,
        monsterName: attacker.monster.name,
        target: actionTarget,
        cost,
        damage: actualDamage,
        to: target,
    });
    state.winner ??= getMonsterEliminationWinner(state.monsters, state.monstersKilledForVictory);
    if (state.winner !== null && state.finishReason !== "baseDestroyed") {
        state.finishReason = "monstersEliminated";
    }
}

export function performAttacks(state: MatchState, board: BoardDefinition): void {
    while (state.winner === null) {
        const choice = chooseAttack(state, board);
        if (!choice) return;
        executeAttack(state, board, choice);
    }
}

export function beginTurn(
    state: MatchState,
    configuration: GameConfiguration,
    player: PlayerId,
): void {
    state.currentPlayer = player;
    for (const monster of getPlayerMonsters(state, player)) {
        const healthBefore = monster.currentHp;
        const source = monster.statusEffects.find(
            (effect) => effect.type === "damageOverTime" && effect.source,
        )?.source;
        const damage = applyStatusEffectsAtTurnStart(monster);
        if (damage > 0) {
            const actualDamage = Math.min(damage, healthBefore);
            state.statistics[player].damageReceived += actualDamage;
            if (source) state.statistics[source.owner].damageDealt += actualDamage;
            addEvent(
                state,
                source?.owner ?? player,
                "status",
                source
                    ? `${source.name} inflige ${actualDamage} dégât(s) de poison à ${monster.monster.name} (J${player}).`
                    : `${monster.monster.name} subit ${actualDamage} dégât(s) d'effet de statut.`,
                {
                    ...(source
                        ? {
                              monsterId: source.id,
                              monsterTypeId: source.monsterId,
                              monsterName: source.name,
                          }
                        : {}),
                    target: `${monster.monster.name} (J${player})`,
                    damage: actualDamage,
                },
            );
        }
        monster.attacksUsedThisTurn = 0;
        monster.attackUsesThisTurn = getInitialAttackUses(monster.monster);
        monster.movementsUsedThisTurn = 0;
        monster.attackCooldowns = monster.attackCooldowns.map((cooldown) =>
            Math.max(0, cooldown - 1),
        );
    }
    state.winner ??= getMonsterEliminationWinner(
        state.monsters,
        configuration.monstersKilledForVictory,
    );
    if (state.winner !== null) state.finishReason = "monstersEliminated";
    addEvent(state, player, "turn", `Début du tour ${state.turn}.`);
}

export function finishPlayerTurn(state: MatchState, player: PlayerId): void {
    for (const monster of state.monsters) {
        if (monster.owner === player) clearMonsterTurnBuff(monster);
    }
    addEvent(state, player, "turnEnd", `Fin du tour ${state.turn}.`);
}
