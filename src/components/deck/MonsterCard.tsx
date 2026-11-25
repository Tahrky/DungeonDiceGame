import type { Monster } from "../../types/GameTypes";
import { MonsterSymbol } from "./MonsterSymbol";
import { formatMonsterSummary } from "./monsterSummary";

interface MonsterCardProps {
    readonly monster: Monster;
    readonly selected: boolean;
    readonly onToggle: (monsterId: string) => void;
    readonly onShowInfo: (monster: Monster, element: HTMLElement) => void;
    readonly onHideInfo: () => void;
}

export function MonsterCard({
    monster,
    selected,
    onToggle,
    onShowInfo,
    onHideInfo,
}: MonsterCardProps) {
    return (
        <button
            type="button"
            className={`monster-card${selected ? " selected" : ""}`}
            aria-pressed={selected}
            onClick={() => onToggle(monster.id)}
            onPointerEnter={(event) => onShowInfo(monster, event.currentTarget)}
            onPointerLeave={onHideInfo}
            onFocus={(event) => onShowInfo(monster, event.currentTarget)}
            onBlur={onHideInfo}
        >
            <MonsterSymbol monster={monster} />
            <span>
                <strong>{monster.name}</strong>
                <small>{formatMonsterSummary(monster)}</small>
            </span>
        </button>
    );
}
