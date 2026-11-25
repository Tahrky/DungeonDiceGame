import type { Monster } from "../../types/GameTypes";
import { toCssColor } from "../../utils/color";

export function MonsterSymbol({ monster }: { readonly monster: Monster }) {
    return (
        <span className="monster-symbol" style={{ color: toCssColor(monster.color) }}>
            {monster.symbol}
        </span>
    );
}
