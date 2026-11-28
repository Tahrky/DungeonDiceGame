import type {
    Monster,
    MonsterAttack,
    MonsterTurnBuffs,
    PlacedMonster,
    PlayerId,
    Position,
} from "../types/GameTypes";
import { getFacingFromMovement, isSamePosition } from "./geometry";

export * from "./attackZones";
export * from "./movementPaths";
export {
    getFacingFromMovement,
    getGridDistance,
    hasLineOfSight,
    isBehind,
    isWithinRadius,
} from "./geometry";

type AreaAttackShape = Pick<MonsterAttack, "hitsAllies" | "movesToZone" | "pattern">;

export function isAreaAttack(attack: AreaAttackShape): boolean {
    return (
        attack.hitsAllies === true ||
        attack.movesToZone === true ||
        attack.pattern.type === "directionalArea" ||
        attack.pattern.type === "selfRadius" ||
        attack.pattern.type === "line" ||
        attack.pattern.type === "radius" ||
        attack.pattern.type === "area" ||
        attack.pattern.type === "jumpArea"
    );
}

export function isDirectlyTargetable(monster: Pick<PlacedMonster, "isCamouflaged">): boolean {
    return monster.isCamouflaged !== true;
}

export function clearCamouflageOnFirstAction(monster: PlacedMonster): void {
    if (monster.monster.id === "thief" && monster.isCamouflaged) {
        monster.isCamouflaged = false;
    }
}

export function clearCamouflageForMovement(
    monster: PlacedMonster,
    path: readonly Position[],
): boolean {
    if (path.length < 2) return false;
    const wasCamouflaged = monster.isCamouflaged === true;
    clearCamouflageOnFirstAction(monster);
    return wasCamouflaged && !monster.isCamouflaged;
}

export function canDirectlyTargetMonster(
    attack: AreaAttackShape & Pick<MonsterAttack, "targetsAlliesOnly">,
    target: Pick<PlacedMonster, "isCamouflaged">,
): boolean {
    if (isDirectlyTargetable(target)) return true;
    return isAreaAttack(attack) && attack.targetsAlliesOnly !== true;
}

export function getInitialAttackCooldowns(monster: Pick<Monster, "attacks">): number[] {
    return monster.attacks.map(
        (attack) => attack.initialCooldownTurns ?? attack.cooldownTurns ?? 0,
    );
}

export function getInitialAttackUses(monster: Pick<Monster, "attacks">): number[] {
    return monster.attacks.map(() => 0);
}

export function createPlacedMonster(
    id: string,
    monster: Monster,
    owner: PlayerId,
    position: Position,
    cells: Position[],
    summonedOnTurn: number,
): PlacedMonster {
    return {
        id,
        monster,
        owner,
        position,
        facing: owner === 1 ? "east" : "west",
        currentHp: monster.hp,
        cells,
        summonedOnTurn,
        attacksUsedThisTurn: 0,
        attackUsesThisTurn: getInitialAttackUses(monster),
        movementsUsedThisTurn: 0,
        attackCooldowns: getInitialAttackCooldowns(monster),
        statusEffects: [],
        isCamouflaged: false,
    };
}

export function getMovementRange(monster: Pick<Monster, "movementRange">, bonus = 0): number {
    return Math.max(0, monster.movementRange + bonus);
}

export function getMovementCost(monster: Pick<Monster, "movementCost">, reduction = 0): number {
    return Math.max(0, (monster.movementCost ?? 1) - reduction);
}

export function getMonsterArmor(monster: Pick<Monster, "armor">): number {
    return Number.isFinite(monster.armor) ? Math.max(0, monster.armor ?? 0) : 0;
}

export function getAttackCost(attack: Pick<MonsterAttack, "cost">, reduction = 0): number {
    return Math.max(0, attack.cost - reduction);
}

export function getAttackDamage(attack: Pick<MonsterAttack, "damage">, bonus = 0): number {
    return attack.damage + bonus;
}

export function getBuffedAttackCost(
    attacker: Pick<PlacedMonster, "turnBuffs">,
    attack: Pick<MonsterAttack, "cost">,
): number {
    return getAttackCost(attack, attacker.turnBuffs?.attackCostReduction ?? 0);
}

export function getBuffedAttackDamage(
    attacker: Pick<PlacedMonster, "turnBuffs">,
    attack: Pick<MonsterAttack, "damage">,
): number {
    return getAttackDamage(attack, attacker.turnBuffs?.attackDamageBonus ?? 0);
}

export function hasTurnBuff(buff: Partial<Record<keyof MonsterTurnBuffs, unknown>>): boolean {
    return (
        buff.movementRangeBonus !== undefined ||
        buff.movementCostReduction !== undefined ||
        buff.attackDamageBonus !== undefined ||
        buff.attackCostReduction !== undefined
    );
}

export function registerAttackUse(
    attacker: PlacedMonster,
    attackIndex: number,
    target: Position,
): void {
    const cooldown = attacker.monster.attacks[attackIndex]?.cooldownTurns;
    clearCamouflageOnFirstAction(attacker);
    consumeAttackTurnBuff(attacker);
    attacker.facing = getFacingFromMovement(attacker.position, target, attacker.facing);
    attacker.attacksUsedThisTurn++;
    attacker.attackUsesThisTurn[attackIndex] = (attacker.attackUsesThisTurn[attackIndex] ?? 0) + 1;
    if (cooldown !== undefined) attacker.attackCooldowns[attackIndex] = cooldown;
}

export function reduceAttackCooldowns(
    monster: Pick<PlacedMonster, "attackCooldowns">,
    reduction: number,
): number {
    const previous = monster.attackCooldowns;
    monster.attackCooldowns = previous.map((cooldown) => Math.max(0, cooldown - reduction));
    return previous.filter((cooldown, index) => cooldown > monster.attackCooldowns[index]).length;
}

export function applyMonsterTurnBuff(
    monster: Pick<PlacedMonster, "turnBuffs">,
    buff: MonsterTurnBuffs,
): void {
    const current = monster.turnBuffs ?? {};
    monster.turnBuffs = {
        movementRangeBonus: (current.movementRangeBonus ?? 0) + (buff.movementRangeBonus ?? 0),
        movementCostReduction:
            (current.movementCostReduction ?? 0) + (buff.movementCostReduction ?? 0),
        attackDamageBonus: (current.attackDamageBonus ?? 0) + (buff.attackDamageBonus ?? 0),
        attackCostReduction: (current.attackCostReduction ?? 0) + (buff.attackCostReduction ?? 0),
    };
}

export function consumeMovementTurnBuff(monster: Pick<PlacedMonster, "turnBuffs">): void {
    if (!monster.turnBuffs) return;
    monster.turnBuffs.movementRangeBonus = 0;
    monster.turnBuffs.movementCostReduction = 0;
}

export function applyMonsterMovement(
    monster: PlacedMonster,
    path: readonly Position[],
): { from: Position; camouflageCleared: boolean } {
    const destination = path[path.length - 1];
    if (path.length < 2 || !destination || !isSamePosition(path[0]!, monster.position)) {
        throw new Error("Le chemin de déplacement du monstre est invalide.");
    }
    const from = monster.position;
    consumeMovementTurnBuff(monster);
    monster.statusEffects = monster.statusEffects.filter((effect) => effect.type !== "movementSlow");
    const camouflageCleared = clearCamouflageForMovement(monster, path);
    monster.movementsUsedThisTurn++;
    monster.facing = getFacingFromMovement(from, destination, monster.facing);
    monster.position = { ...destination };
    return { from, camouflageCleared };
}

export function consumeAttackTurnBuff(monster: Pick<PlacedMonster, "turnBuffs">): void {
    if (!monster.turnBuffs) return;
    monster.turnBuffs.attackDamageBonus = 0;
    monster.turnBuffs.attackCostReduction = 0;
}

export function clearMonsterTurnBuff(monster: Pick<PlacedMonster, "turnBuffs">): void {
    monster.turnBuffs = undefined;
}

export function canPassHostileMonsters(
    monster: Pick<Monster, "flying" | "canPassHostiles">,
): boolean {
    return monster.flying === true || monster.canPassHostiles === true;
}

export function getMovementActionsPerTurn(
    monster: Pick<Monster, "movementActionsPerTurn">,
): number {
    return monster.movementActionsPerTurn ?? 1;
}

export function getAttackActionsPerTurn(monster: Pick<Monster, "attackActionsPerTurn">): number {
    return monster.attackActionsPerTurn ?? 1;
}

export function canUseActionThisTurn(actionsUsed: number, actionLimit: number): boolean {
    return actionsUsed < actionLimit;
}

export function canAttackBaseThisTurn(
    summonedOnTurn: number | undefined,
    currentTurn: number,
    allowAttackOnSummonTurn = true,
): boolean {
    return allowAttackOnSummonTurn || summonedOnTurn !== currentTurn;
}

export function canUseMonsterAttackThisTurn(
    attack: Pick<MonsterAttack, "usesPerTurn">,
    usesThisTurn: number,
): boolean {
    return attack.usesPerTurn === undefined || usesThisTurn < attack.usesPerTurn;
}

export function advanceAttackCooldowns(cooldowns: readonly number[]): number[] {
    return cooldowns.map((cooldown) => Math.max(0, cooldown - 1));
}

export function resetAttackTurnState(
    monster: Pick<
        PlacedMonster,
        "monster" | "attacksUsedThisTurn" | "attackUsesThisTurn" | "attackCooldowns"
    >,
): void {
    monster.attacksUsedThisTurn = 0;
    monster.attackUsesThisTurn = getInitialAttackUses(monster.monster);
    monster.attackCooldowns = advanceAttackCooldowns(monster.attackCooldowns);
}

export function canAttackMonster(
    attacker: Monster,
    attack: MonsterAttack,
    target: Monster,
): boolean {
    if (!target.highAltitude) return true;
    return (
        attacker.flying === true ||
        (attack.pattern.type !== "adjacent" && attack.pattern.type !== "directionalArea")
    );
}

export function canTargetMonsterOwner(
    attack: Pick<MonsterAttack, "hitsAllies" | "targetsAlliesOnly">,
    targetOwner: PlayerId,
    currentPlayer: PlayerId,
): boolean {
    if (attack.targetsAlliesOnly) return targetOwner === currentPlayer;
    return attack.hitsAllies === true || targetOwner !== currentPlayer;
}
