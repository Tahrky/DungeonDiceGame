import { opposingPlayer } from "../../game/matchRules";
import type { MonsterAttack } from "../../types/GameTypes";
import { addEvent, type MatchState } from "../matchState";
import type { AttackChoice } from "./attackChoices";

export interface AttackOutcome {
    target: string;
    supportEffect: string;
    damage: number;
    damageToEnemies: number;
    damageToAllies: number;
    damageToBase: number;
    targetsHit: number;
    overkillDamage: number;
    criticalDamageBonus: number;
    healingDone: number;
    healingWaste: number;
    effectsCleared: number;
    buffsApplied: number;
    cooldownReductionUsed: number;
    camouflageTriggered: boolean;
    camouflageSuppressed: boolean;
}

export function createOutcome(): AttackOutcome {
    return {
        target: "case vide",
        supportEffect: "",
        damage: 0,
        damageToEnemies: 0,
        damageToAllies: 0,
        damageToBase: 0,
        targetsHit: 0,
        overkillDamage: 0,
        criticalDamageBonus: 0,
        healingDone: 0,
        healingWaste: 0,
        effectsCleared: 0,
        buffsApplied: 0,
        cooldownReductionUsed: 0,
        camouflageTriggered: false,
        camouflageSuppressed: false,
    };
}

export function recordAttackEvents(
    state: MatchState,
    choice: AttackChoice,
    attack: MonsterAttack,
    cost: number,
    outcome: AttackOutcome,
): void {
    const { attacker, target, score } = choice;
    const player = state.currentPlayer;
    const monster = attacker.monster;
    const description = outcome.supportEffect
        ? `${monster.name} ${outcome.supportEffect} sur ${outcome.target}.`
        : `${monster.name} utilise « ${attack.name} » sur ${outcome.target}` +
          `${outcome.damage ? ` (${outcome.damage} dégât(s))` : ""}.`;
    if (outcome.damage === 0 && !outcome.supportEffect) {
        state.statistics[player].ineffectiveActions++;
    }
    const monsterFields = {
        monsterId: attacker.id,
        monsterTypeId: monster.id,
        monsterName: monster.name,
    };
    addEvent(state, {
        turn: state.turn,
        player,
        type: "strategy",
        description: `Priorité d'action : score tactique ${score}.`,
        ...monsterFields,
        target: outcome.target,
        ...(state.debug
            ? {
                  debug: {
                      situation: `base J${player}=${state.health[player]}, base adverse=${state.health[opposingPlayer(player)]}`,
                      candidates: 1,
                      depth: 1,
                      positionsExplored: state.monsters.length,
                      selectedAction: description,
                  },
              }
            : {}),
    });
    addEvent(state, {
        turn: state.turn,
        player,
        type: "attack",
        description,
        ...monsterFields,
        attackName: attack.name,
        target: outcome.target,
        cost,
        damage: outcome.damage,
        targetsHit: outcome.targetsHit,
        damageToMonsters: outcome.damageToEnemies + outcome.damageToAllies,
        damageToEnemies: outcome.damageToEnemies,
        damageToAllies: outcome.damageToAllies,
        damageToBase: outcome.damageToBase,
        overkillDamage: outcome.overkillDamage,
        criticalDamageBonus: outcome.criticalDamageBonus,
        healingDone: outcome.healingDone,
        healingWaste: outcome.healingWaste,
        effectsCleared: outcome.effectsCleared,
        buffsApplied: outcome.buffsApplied,
        cooldownReductionUsed: outcome.cooldownReductionUsed,
        ...(outcome.camouflageTriggered ? { camouflageTriggered: true } : {}),
        ...(outcome.camouflageSuppressed ? { camouflageSuppressed: true } : {}),
        to: target,
    });
}
