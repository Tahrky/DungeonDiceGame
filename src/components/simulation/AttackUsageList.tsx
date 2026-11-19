import type { MonsterAttackUsage } from "../../simulation/analysis";

interface AttackUsageListProps {
    readonly attacks: readonly MonsterAttackUsage[];
}

export function AttackUsageList({ attacks }: AttackUsageListProps) {
    if (attacks.length === 0) return null;
    return (
        <ul className="simulation-attack-list">
            {attacks.map((attack) => (
                <li key={attack.name}>
                    {attack.name} × {attack.uses}
                </li>
            ))}
        </ul>
    );
}
