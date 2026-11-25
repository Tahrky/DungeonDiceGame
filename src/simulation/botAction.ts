import type { SymbolConversionChoice, ObjectiveMovement } from "../game/botStrategy";
import type { PlacedMonster, PlayerId } from "../types/GameTypes";
import type { AttackChoice } from "./combat/attackChoices";
import type { DeploymentDecision } from "./deployment";

export type BotAction =
    | { type: "roll"; player: PlayerId }
    | { type: "convert"; player: PlayerId; choice: SymbolConversionChoice }
    | { type: "summon"; decision: DeploymentDecision }
    | { type: "attack"; choice: AttackChoice }
    | {
          type: "move";
          monster: PlacedMonster;
          movement: ObjectiveMovement;
          cost: number;
          description: string;
      }
    | { type: "endTurn"; player: PlayerId };
