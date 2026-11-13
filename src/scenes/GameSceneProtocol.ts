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
        case "startAttack":
        case "startMovement":
        case "cancelBoardAction":
        case "finishTurn":
        case "debugAddSymbols":
            return true;
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
        "actionHistory" in value &&
        Array.isArray(value.actionHistory)
    );
}
