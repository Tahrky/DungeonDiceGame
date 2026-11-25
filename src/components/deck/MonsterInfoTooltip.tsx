import { useState } from "react";

import {
    describeMonsterAttack,
    describeMonsterMovement,
    describeMonsterTraits,
} from "../../game/monsterDescriptions";
import type { Monster } from "../../types/GameTypes";
import { MonsterIdlePreview } from "./MonsterIdlePreview";
import { formatMonsterSummary } from "./monsterSummary";

interface MonsterTooltipState {
    readonly monster: Monster;
    readonly left: number;
    readonly top: number;
}

export function useMonsterTooltip() {
    const [tooltip, setTooltip] = useState<MonsterTooltipState | null>(null);

    function show(monster: Monster, element: HTMLElement): void {
        const bounds = element.getBoundingClientRect();
        const tooltipWidth = Math.min(360, window.innerWidth - 24);
        const tooltipHeight = Math.min(380, window.innerHeight - 24);
        const showOnRight = bounds.right + tooltipWidth + 12 <= window.innerWidth;
        const left = showOnRight
            ? bounds.right + 12
            : Math.max(12, bounds.left - tooltipWidth - 12);
        const top = Math.max(12, Math.min(bounds.top, window.innerHeight - tooltipHeight - 12));
        setTooltip({ monster, left, top });
    }

    return { tooltip, show, hide: () => setTooltip(null) };
}

export function MonsterInfoTooltip({ monster, left, top }: MonsterTooltipState) {
    return (
        <aside className="monster-info-tooltip" role="tooltip" style={{ left, top }}>
            <div className="monster-info-heading">
                <MonsterIdlePreview monster={monster} />
                <div>
                    <strong>{monster.name}</strong>
                    {describeMonsterTraits(monster).map((trait) => (
                        <small key={trait}>{trait}</small>
                    ))}
                </div>
            </div>
            <p>{formatMonsterSummary(monster)}</p>
            <div className="monster-info-attacks">
                {monster.attacks.map((attack) => (
                    <p key={`${monster.id}-${attack.name}`}>{describeMonsterAttack(attack)}</p>
                ))}
            </div>
            <p>{describeMonsterMovement(monster)}</p>
            {monster.bonusDamageFromBehind !== undefined && (
                <p>Bonus de dos : +{monster.bonusDamageFromBehind} dégâts</p>
            )}
        </aside>
    );
}
