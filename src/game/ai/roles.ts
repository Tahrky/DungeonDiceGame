import { getStartingPositions } from "../boards";
import { positionKey } from "../geometry";
import { opposingPlayer } from "../matchRules";
import type { PlacedMonster, PlayerId, Position } from "../../types/GameTypes";
import { getStrategicBoard, livingMonsters, pickBest } from "./common";
import { getSupportValue } from "./monsterValue";
import {
    getAdvanceTarget,
    getDefensiveTarget,
    getInterceptTarget,
    getPatrolTarget,
} from "./roleTargets";
import { analyzeDefensiveRoutes } from "./routeCoverage";
import type { RoleAssignment, StrategicSnapshot } from "./types";

const DEFENDER_SHARE = 2 / 3;

function getHealthRatio(monster: PlacedMonster): number {
    return monster.currentHp / monster.monster.hp;
}

function findSupportTarget(
    monster: PlacedMonster,
    allies: readonly PlacedMonster[],
    claimedTargets: ReadonlySet<string>,
): Position | undefined {
    const wounded = allies.filter(
        (ally) =>
            ally.id !== monster.id &&
            ally.currentHp < ally.monster.hp &&
            !claimedTargets.has(positionKey(ally.position)),
    );
    return pickBest(wounded, (first, second) => getHealthRatio(first) - getHealthRatio(second))
        ?.position;
}

export function assignMonsterRoles(
    snapshot: StrategicSnapshot,
    player: PlayerId,
): RoleAssignment[] {
    const starts = getStartingPositions(snapshot.board);
    const ownStart = starts[player];
    const enemyStart = starts[opposingPlayer(player)];
    const enemies = livingMonsters(snapshot, opposingPlayer(player));
    const allies = livingMonsters(snapshot, player);
    const tactic = snapshot.tactics[player];
    const routeBoard = getStrategicBoard(snapshot, starts);
    const defense =
        tactic === "defense" ? analyzeDefensiveRoutes(routeBoard, ownStart, enemies) : undefined;
    const defendersNeeded =
        defense?.baseThreatened && allies.length > 0
            ? Math.ceil(allies.length * DEFENDER_SHARE)
            : 0;
    const claimedTargets = new Set<string>();
    let assignedDefenders = 0;

    const claim = (target: Position): Position => {
        claimedTargets.add(positionKey(target));
        return target;
    };

    const assignRole = (monster: PlacedMonster, support: number): RoleAssignment => {
        const supportTarget =
            support > 0 ? findSupportTarget(monster, allies, claimedTargets) : undefined;
        if (supportTarget) {
            return { monsterId: monster.id, role: "support", target: claim(supportTarget) };
        }

        if (defense && assignedDefenders < defendersNeeded) {
            assignedDefenders++;
            const target = getDefensiveTarget(
                routeBoard,
                monster,
                ownStart,
                defense.coverage,
                claimedTargets,
            );
            return { monsterId: monster.id, role: "defend", target: claim(target) };
        }

        if ((tactic === "defense" || tactic === "hunt") && enemies.length > 0) {
            const target = getInterceptTarget(routeBoard, monster, enemies, allies, claimedTargets);
            if (target) return { monsterId: monster.id, role: "intercept", target: claim(target) };
        }

        const shouldPatrol =
            tactic === "defense" &&
            enemies.length === 0 &&
            allies.length > 1 &&
            claimedTargets.size === 0;
        const target = shouldPatrol
            ? getPatrolTarget(routeBoard, monster, ownStart, enemyStart, claimedTargets)
            : getAdvanceTarget(routeBoard, monster, enemyStart, claimedTargets);
        return {
            monsterId: monster.id,
            role: shouldPatrol ? "patrol" : "advance",
            target: claim(target),
        };
    };

    return allies
        .map((monster) => ({ monster, support: getSupportValue(monster.monster) }))
        .sort((first, second) => {
            if (tactic !== "defense") return second.support - first.support;
            return (
                second.support - first.support ||
                getHealthRatio(second.monster) - getHealthRatio(first.monster) ||
                first.monster.id.localeCompare(second.monster.id)
            );
        })
        .map(({ monster, support }) => assignRole(monster, support));
}
