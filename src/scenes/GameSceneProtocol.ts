import type { GameSnapshot, RemoteGameCommand } from "../types/GameTypes";

export function isRemoteGameCommand(value: unknown): value is RemoteGameCommand {
    if (typeof value !== "object" || value === null || !("type" in value)) return false;

    switch (value.type) {
        case "rollDice":
        case "rotatePattern":
        case "mirrorPattern":
        case "togglePatternSelector":
        case "toggleInvocationMenu":
        case "cancelInvocation":
        case "cancelBoardAction":
        case "startAttack":
        case "startMovement":
        case "finishTurn":
        case "debugAddSymbols":
            return true;
        case "selectReserveSymbol":
            return "symbol" in value && isDiceSymbol(value.symbol);
        case "convertReserveSymbols":
            return "targetSymbol" in value && isDiceSymbol(value.targetSymbol);
        case "changeCellHeight":
            return (
                "delta" in value &&
                (value.delta === 1 || value.delta === -1) &&
                "position" in value &&
                isPosition(value.position)
            );
        case "selectMonster":
            return "monsterId" in value && typeof value.monsterId === "string";
        case "selectPattern":
        case "selectAttack":
        case "storeDie":
            return "index" in value
                ? Number.isInteger(value.index)
                : "attackIndex" in value
                  ? Number.isInteger(value.attackIndex)
                  : "dieIndex" in value && Number.isInteger(value.dieIndex);
        case "boardClick":
            return (
                "position" in value &&
                typeof value.position === "object" &&
                value.position !== null &&
                "x" in value.position &&
                "y" in value.position &&
                Number.isInteger(value.position.x) &&
                Number.isInteger(value.position.y)
            );
        default:
            return false;
    }
}

function isDiceSymbol(value: unknown): value is "invocation" | "attack" | "movement" {
    return value === "invocation" || value === "attack" || value === "movement";
}

export function isGameSnapshot(value: unknown): value is GameSnapshot {
    if (typeof value !== "object" || value === null) return false;

    return (
        "currentPlayer" in value &&
        (value.currentPlayer === 1 || value.currentPlayer === 2) &&
        "turnNumber" in value &&
        typeof value.turnNumber === "number" &&
        Number.isInteger(value.turnNumber) &&
        value.turnNumber > 0 &&
        "playerHealth" in value &&
        typeof value.playerHealth === "object" &&
        value.playerHealth !== null &&
        "rolledDice" in value &&
        Array.isArray(value.rolledDice) &&
        "diceReserves" in value &&
        typeof value.diceReserves === "object" &&
        value.diceReserves !== null &&
        "placedMonsters" in value &&
        Array.isArray(value.placedMonsters) &&
        "obstacles" in value &&
        Array.isArray(value.obstacles) &&
        value.obstacles.every(
            (obstacle) =>
                typeof obstacle === "object" &&
                obstacle !== null &&
                "height" in obstacle &&
                (obstacle.height === 1 || obstacle.height === -1) &&
                "position" in obstacle &&
                isPosition(obstacle.position),
        ) &&
        "actionHistory" in value &&
        Array.isArray(value.actionHistory)
    );
}

function isPosition(value: unknown): value is { x: number; y: number } {
    return (
        typeof value === "object" &&
        value !== null &&
        "x" in value &&
        Number.isInteger(value.x) &&
        "y" in value &&
        Number.isInteger(value.y)
    );
}
