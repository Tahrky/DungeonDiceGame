import type { GameConfiguration } from "../../game/gameConfiguration";
import { getMonsterEliminationWinner } from "../../game/matchRules";
import { clearMonsterTurnBuff } from "../../game/monsterActions";
import { beginMonsterTurn, finishMonsterTurn } from "../../game/statusEffects";
import type { PlacedMonster, PlayerId } from "../../types/GameTypes";
import { addEvent, type MatchState } from "../matchState";

function applyStatusDamage(state: MatchState, monster: PlacedMonster, player: PlayerId): void {
    const healthBefore = monster.currentHp;
    const source = monster.statusEffects.find(
        (effect) => effect.type === "damageOverTime" && effect.source,
    )?.source;
    const damage = beginMonsterTurn(monster);
    if (damage <= 0) return;

    const actualDamage = Math.min(damage, healthBefore);
    state.statistics[player].damageReceived += actualDamage;
    if (source) state.statistics[source.owner].damageDealt += actualDamage;
    addEvent(state, {
        turn: state.turn,
        player: source?.owner ?? player,
        type: "status",
        description: source
            ? `${source.name} inflige ${actualDamage} dégât(s) de poison à ${monster.monster.name} (J${player}).`
            : `${monster.monster.name} subit ${actualDamage} dégât(s) d'effet de statut.`,
        ...(source
            ? { monsterId: source.id, monsterTypeId: source.monsterId, monsterName: source.name }
            : {}),
        target: `${monster.monster.name} (J${player})`,
        damage: actualDamage,
    });
}

export function beginTurn(
    state: MatchState,
    configuration: GameConfiguration,
    player: PlayerId,
): void {
    state.currentPlayer = player;
    for (const monster of state.monsters.filter((monster) => monster.owner === player)) {
        applyStatusDamage(state, monster, player);
    }
    state.winner ??= getMonsterEliminationWinner(
        state.monsters,
        configuration.monstersKilledForVictory,
    );
    if (state.winner !== null) state.finishReason = "monstersEliminated";
    addEvent(state, {
        turn: state.turn,
        player,
        type: "turn",
        description: `Début du tour ${state.turn}.`,
    });
}

export function finishPlayerTurn(state: MatchState, player: PlayerId): void {
    for (const monster of state.monsters) {
        if (monster.owner === player) {
            clearMonsterTurnBuff(monster);
            finishMonsterTurn(monster);
        }
    }
    addEvent(state, {
        turn: state.turn,
        player,
        type: "turnEnd",
        description: `Fin du tour ${state.turn}.`,
    });
}
