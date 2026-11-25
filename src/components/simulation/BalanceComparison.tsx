import type { MonsterBalance } from "../../simulation/monsterBalance";
import { formatBalanceValue } from "./balanceColumns";

interface ComparisonRow {
    readonly label: string;
    readonly getValue: (monster: MonsterBalance) => number | null;
    readonly lowerIsBetter?: boolean;
}

interface ComparisonCellProps {
    readonly value: number | null;
    readonly other: number | null;
    readonly lowerIsBetter?: boolean;
}

interface BalanceComparisonProps {
    readonly first: MonsterBalance;
    readonly second: MonsterBalance;
}

const COMPARISON_ROWS: readonly ComparisonRow[] = [
    { label: "PV", getValue: (monster) => monster.hp },
    { label: "Armure", getValue: (monster) => monster.armor },
    {
        label: "Attaque moyenne (dégâts/cible)",
        getValue: (monster) => monster.averageDamagePerAttack,
    },
    {
        label: "Attaques moyennes nécessaires",
        getValue: (monster) => monster.averageAttacksToEliminate,
    },
    {
        label: "Coût d’invocation",
        getValue: (monster) => monster.summonCost,
        lowerIsBetter: true,
    },
    { label: "Portée de déplacement", getValue: (monster) => monster.movementRange },
    { label: "Robustesse / 10", getValue: (monster) => monster.scores.durability },
    { label: "Attaque / 10", getValue: (monster) => monster.scores.offense },
    {
        label: "Portée et zone / 10 · complémentaire",
        getValue: (monster) => monster.scores.rangeControl,
    },
    { label: "Mobilité / 10", getValue: (monster) => monster.scores.mobility },
    { label: "Utilité / 10", getValue: (monster) => monster.scores.utility },
    { label: "Économie d’actions / 10", getValue: (monster) => monster.scores.actionEconomy },
    { label: "Score global / 10", getValue: (monster) => monster.scores.total },
    {
        label: "Coût d’entrée standard",
        getValue: (monster) => monster.economy.standardEntryCost,
        lowerIsBetter: true,
    },
    {
        label: "Coût du premier tour complet",
        getValue: (monster) => monster.economy.fullFirstTurnCost,
        lowerIsBetter: true,
    },
    {
        label: "Coût opérationnel moyen / tour",
        getValue: (monster) => monster.economy.averageOperatingCostPerTurn,
        lowerIsBetter: true,
    },
    {
        label: "Coût équivalent moyen / tour",
        getValue: (monster) => monster.economy.grossEquivalentCostPerTurn,
        lowerIsBetter: true,
    },
    {
        label: "Pression sur les ressources (%)",
        getValue: (monster) => monster.economy.grossEquivalentPressurePercent,
        lowerIsBetter: true,
    },
    {
        label: "Efficacité des dégâts à long terme",
        getValue: (monster) => monster.economy.longTermDamageEfficiency,
    },
];

function isMeasured(value: number | null): value is number {
    return value !== null && Number.isFinite(value);
}

function isBetter(value: number | null, other: number | null, lowerIsBetter = false): boolean {
    if (!isMeasured(value) || !isMeasured(other)) return false;
    return lowerIsBetter ? value < other : value > other;
}

function ComparisonCell({ value, other, lowerIsBetter }: ComparisonCellProps) {
    const text = formatBalanceValue(value);
    return (
        <td>
            {isBetter(value, other, lowerIsBetter) ? (
                <strong className="simulation-comparison-maximum">{text}</strong>
            ) : (
                text
            )}
        </td>
    );
}

export function BalanceComparison({ first, second }: BalanceComparisonProps) {
    return (
        <div className="simulation-table-wrap">
            <table className="simulation-table simulation-comparison-table">
                <thead>
                    <tr>
                        <th scope="col">Indicateur</th>
                        <th scope="col">{first.name}</th>
                        <th scope="col">{second.name}</th>
                    </tr>
                </thead>
                <tbody>
                    {COMPARISON_ROWS.map(({ label, getValue, lowerIsBetter }) => {
                        const firstValue = getValue(first);
                        const secondValue = getValue(second);
                        return (
                            <tr key={label}>
                                <th scope="row">{label}</th>
                                <ComparisonCell
                                    value={firstValue}
                                    other={secondValue}
                                    lowerIsBetter={lowerIsBetter}
                                />
                                <ComparisonCell
                                    value={secondValue}
                                    other={firstValue}
                                    lowerIsBetter={lowerIsBetter}
                                />
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
