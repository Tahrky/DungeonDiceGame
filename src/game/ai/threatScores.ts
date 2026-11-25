import type { BoardDefinition } from "../boards";
import { isInsideBoard } from "../boards";
import { positionKey } from "../geometry";
import {
    canAttackMonster,
    getAttackDamage,
    getAttackZoneOptions,
    isAreaAttack,
} from "../monsterActions";
import { opposingPlayer } from "../matchRules";
import type { PlacedMonster } from "../../types/GameTypes";

function getAttackerThreats(
    board: BoardDefinition,
    attacker: PlacedMonster,
    target: PlacedMonster,
    willMove: boolean,
): Map<string, number> {
    const threats = new Map<string, number>();
    for (const [attackIndex, attack] of attacker.monster.attacks.entries()) {
        if (attack.targetsAlliesOnly || (attacker.attackCooldowns[attackIndex] ?? 0) > 1) continue;

        const areaAttack = isAreaAttack(attack);
        if (target.isCamouflaged && !willMove && !areaAttack) continue;
        if (!canAttackMonster(attacker.monster, attack, target.monster)) continue;

        const damage =
            getAttackDamage(attack, attacker.turnBuffs?.attackDamageBonus ?? 0) +
            (attack.statusEffect?.damagePerTurn ?? 0);
        const zones = getAttackZoneOptions(
            attacker.position,
            attacker.facing,
            attack.pattern,
            attack.targetsSelf,
        );
        for (const option of zones) {
            for (const cell of areaAttack ? option.cells : [option.target]) {
                if (!isInsideBoard(board, cell)) continue;
                const key = positionKey(cell);
                threats.set(key, Math.max(threats.get(key) ?? 0, damage));
            }
        }
    }
    return threats;
}

export function createThreatScores(
    board: BoardDefinition,
    monsters: readonly PlacedMonster[],
    threatenedMonsterId: string,
    willMove = false,
): ReadonlyMap<string, number> {
    const threatened = monsters.find((monster) => monster.id === threatenedMonsterId);
    if (!threatened) return new Map();

    const opponent = opposingPlayer(threatened.owner);
    const threatScores = new Map<string, number>();
    for (const attacker of monsters) {
        if (attacker.owner !== opponent || attacker.currentHp <= 0) continue;

        for (const [key, damage] of getAttackerThreats(board, attacker, threatened, willMove)) {
            const lethalBonus = damage >= threatened.currentHp ? 4 : 0;
            threatScores.set(key, (threatScores.get(key) ?? 0) + damage + lethalBonus);
        }
    }
    return threatScores;
}
