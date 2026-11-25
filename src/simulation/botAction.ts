import type { SymbolConversionChoice, ObjectiveMovement } from "../game/botStrategy";
import type { PatternPlacement } from "../game/placement";
import type { PlayerId } from "../types/GameTypes";
import type { SerializedAttackChoice } from "./combat/attackChoices";

export type BotAction =
    | { type: "roll"; player: PlayerId }
    | { type: "convert"; player: PlayerId; choice: SymbolConversionChoice }
    | {
          type: "summon";
          monsterId: string;
          placement: PatternPlacement;
          candidateCount: number;
      }
    | { type: "attack"; choice: SerializedAttackChoice }
    | {
          type: "move";
          monsterId: string;
          movement: ObjectiveMovement;
          cost: number;
          description: string;
      }
    | { type: "endTurn"; player: PlayerId };
