import { useMemo, useState } from "react";
import { MONSTERS } from "../../data/monsters";
import { analyzeMonsters, type MonsterBalance } from "../../simulation/monsterBalance";
import { SortableTable, type SortableColumn } from "./SortableTable";

interface ComparisonRow {
    label: string;
    first: number | null;
    second: number | null;
    lowerIsBetter?: boolean;
}

function format(value: number | null): string {
    if (value === null || !Number.isFinite(value) || value === 0) return "";
    return value.toFixed(2).replace(/\.?0+$/, "");
}

function isBetter(value: number | null, other: number | null, lowerIsBetter = false): boolean {
    return (
        value !== null &&
        Number.isFinite(value) &&
        other !== null &&
        Number.isFinite(other) &&
        (lowerIsBetter ? value < other : value > other)
    );
}

const BALANCE_COLUMNS: SortableColumn<MonsterBalance>[] = [
    { key: "name", label: "Monstre", getValue: (monster) => monster.name, rowHeader: true },
    {
        key: "total",
        label: "Score global / 10",
        headerTitle:
            "Moyenne pondérée des six sous-scores, chacun ramené sur 10 :\n\nRobustesse : 20 %\nAttaque : 25 %\nPortée / zone : 15 %\nMobilité : 15 %\nUtilité : 15 %\nÉconomie d’actions : 10 %",
        getValue: (monster) => monster.scores.total,
        render: (monster) => format(monster.scores.total),
    },
    {
        key: "summonCost",
        label: "Coût invoc",
        getValue: (monster) => monster.summonCost,
        render: (monster) => format(monster.summonCost),
    },
    {
        key: "hp",
        label: "PV",
        getValue: (monster) => monster.hp,
        render: (monster) => format(monster.hp),
    },
    {
        key: "armor",
        label: "Armure",
        getValue: (monster) => monster.armor,
        render: (monster) => monster.armor.toString(),
    },
    {
        key: "averageAttacks",
        label: "Attaques moyennes nécessaires",
        headerTitle:
            "Nombre moyen d’attaques capables de blesser nécessaires pour éliminer le monstre. Les attaques neutralisées par l’armure sont exclues.",
        getValue: (monster) => monster.averageAttacksToEliminate,
        render: (monster) => format(monster.averageAttacksToEliminate),
    },
    {
        key: "averageAttackDamage",
        label: "Attaque moyenne (dégâts/cible)",
        headerTitle:
            "Dégâts moyens par attaque et par cible, pondérés par les utilisations réalisables sur 12 tours; cooldowns et limites d’utilisation inclus. Les attaques de zone ne sont pas multipliées par leurs cibles potentielles.",
        getValue: (monster) => monster.averageDamagePerAttack,
        render: (monster) =>
            monster.averageDamagePerAttack === null
                ? "–"
                : format(monster.averageDamagePerAttack),
    },
    {
        key: "durability",
        label: "Robustesse",
        headerTitle:
            "Nombre moyen d’attaques nécessaires pour éliminer le monstre, normalisé à partir des PV et de l’armure.",
        getValue: (monster) => monster.scores.durability,
        render: (monster) => format(monster.scores.durability),
    },
    {
        key: "entryCost",
        label: "Coût d’entrée estimé",
        headerTitle:
            "coût d’invocation + le coût d’une attaque immédiatement disponible + le coût d’un déplacement. L’attaque retenue est celle que le calculateur juge la plus intéressante par ressource parmi celles sans temps de recharge initial.",
        getValue: (monster) => monster.economy.standardEntryCost,
        render: (monster) => format(monster.economy.standardEntryCost),
    },
    {
        key: "operatingCost",
        label: "Coût opérationnel / tour",
        headerTitle:
            "Coût moyen des attaques retenues sur 12 tours, plus le coût de tous les déplacements que le monstre peut effectuer dans un tour.",
        getValue: (monster) => monster.economy.averageOperatingCostPerTurn,
        render: (monster) => format(monster.economy.averageOperatingCostPerTurn),
    },
    {
        key: "grossCost",
        label: "Coût équivalent / tour",
        headerTitle: "Coût opérationnel + coût d'invocation + déficit par catégorie de symbole.",
        getValue: (monster) => monster.economy.grossEquivalentCostPerTurn,
        render: (monster) => format(monster.economy.grossEquivalentCostPerTurn),
    },
    {
        key: "optimum",
        label: "Optimum / tour",
        headerTitle:
            "Nombre de fois ou un monstre peut effectuer la totalité de ses actions par tour avec 5 ressources.",
        getValue: (monster) =>
            monster.economy.grossEquivalentPressurePercent > 0
                ? 100 / monster.economy.grossEquivalentPressurePercent
                : null,
        render: (monster) =>
            monster.economy.grossEquivalentPressurePercent > 0
                ? format(100 / monster.economy.grossEquivalentPressurePercent)
                : "",
    },
    {
        key: "efficiency",
        label: "Efficacité d’invocation / tour",
        headerTitle:
            "Score tactique global divisé par le coût d’invocation. C’est un score relatif par symbole d’invocation.",
        getValue: (monster) => monster.economy.invocationEfficiency,
        render: (monster) => format(monster.economy.invocationEfficiency),
    },
    {
        key: "offense",
        label: "Attaque",
        headerTitle:
            "Dégâts directs et différés pondérés par les ressources, la portée, la zone d’effet et la disponibilité des attaques.",
        getValue: (monster) => monster.scores.offense,
        render: (monster) => format(monster.scores.offense),
    },
    {
        key: "range",
        label: "Portée / zone",
        headerTitle: "Portée utile et nombre potentiel de cases affectées par les attaques.",
        getValue: (monster) => monster.scores.rangeControl,
        render: (monster) => format(monster.scores.rangeControl),
    },
    {
        key: "mobility",
        label: "Mobilité",
        headerTitle:
            "Portée atteignable, nombre et coût des déplacements, avec vol et traversée des ennemis.",
        getValue: (monster) => monster.scores.mobility,
        render: (monster) => format(monster.scores.mobility),
    },
    {
        key: "actionEconomy",
        label: "Économie d’action",
        headerTitle:
            "Valeur moyenne des attaques et déplacements réellement réalisables avec les ressources disponibles, les usages par tour et les cooldowns.",
        getValue: (monster) => monster.scores.actionEconomy,
        render: (monster) => format(monster.scores.actionEconomy),
    },
    {
        key: "utility",
        label: "Utilité",
        headerTitle:
            "Soins, suppression d’effets, buffs, réductions de recharge/coût et effets défensifs comme le camouflage.",
        getValue: (monster) => monster.scores.utility,
        render: (monster) => format(monster.scores.utility),
    },
];

export function MonsterBalancePanel() {
    const reports = useMemo(() => analyzeMonsters(MONSTERS), []);
    const [selectedId, setSelectedId] = useState(MONSTERS[0]?.id ?? "");
    const [comparisonId, setComparisonId] = useState(
        MONSTERS.find((monster) => monster.id !== MONSTERS[0]?.id)?.id ?? "",
    );
    const selected = reports.find((report) => report.id === selectedId) ?? reports[0];
    const comparison =
        reports.find((report) => report.id === comparisonId && report.id !== selected?.id) ??
        reports.find((report) => report.id !== selected?.id);
    if (!selected || !comparison) return null;

    const comparisonRows: ComparisonRow[] = [
        { label: "PV", first: selected.hp, second: comparison.hp },
        { label: "Armure", first: selected.armor, second: comparison.armor },
        {
            label: "Attaque moyenne (dégâts/cible)",
            first: selected.averageDamagePerAttack,
            second: comparison.averageDamagePerAttack,
        },
        {
            label: "Attaques moyennes nécessaires",
            first: selected.averageAttacksToEliminate,
            second: comparison.averageAttacksToEliminate,
            lowerIsBetter: false,
        },
        {
            label: "Coût d’invocation",
            first: selected.summonCost,
            second: comparison.summonCost,
            lowerIsBetter: true,
        },
        {
            label: "Portée de déplacement",
            first: selected.movementRange,
            second: comparison.movementRange,
        },
        {
            label: "Robustesse / 10",
            first: selected.scores.durability,
            second: comparison.scores.durability,
        },
        {
            label: "Attaque / 10",
            first: selected.scores.offense,
            second: comparison.scores.offense,
        },
        {
            label: "Portée et zone / 10",
            first: selected.scores.rangeControl,
            second: comparison.scores.rangeControl,
        },
        {
            label: "Mobilité / 10",
            first: selected.scores.mobility,
            second: comparison.scores.mobility,
        },
        {
            label: "Utilité / 10",
            first: selected.scores.utility,
            second: comparison.scores.utility,
        },
        {
            label: "Économie d’actions / 10",
            first: selected.scores.actionEconomy,
            second: comparison.scores.actionEconomy,
        },
        {
            label: "Score global / 10",
            first: selected.scores.total,
            second: comparison.scores.total,
        },
        {
            label: "Coût d’entrée standard",
            first: selected.economy.standardEntryCost,
            second: comparison.economy.standardEntryCost,
            lowerIsBetter: true,
        },
        {
            label: "Coût du premier tour complet",
            first: selected.economy.fullFirstTurnCost,
            second: comparison.economy.fullFirstTurnCost,
            lowerIsBetter: true,
        },
        {
            label: "Coût opérationnel moyen / tour",
            first: selected.economy.averageOperatingCostPerTurn,
            second: comparison.economy.averageOperatingCostPerTurn,
            lowerIsBetter: true,
        },
        {
            label: "Coût équivalent moyen / tour",
            first: selected.economy.grossEquivalentCostPerTurn,
            second: comparison.economy.grossEquivalentCostPerTurn,
            lowerIsBetter: true,
        },
        {
            label: "Pression sur les ressources (%)",
            first: selected.economy.grossEquivalentPressurePercent,
            second: comparison.economy.grossEquivalentPressurePercent,
            lowerIsBetter: true,
        },
        {
            label: "Efficacité des dégâts à long terme",
            first: selected.economy.longTermDamageEfficiency,
            second: comparison.economy.longTermDamageEfficiency,
        },
    ];

    return (
        <section className="simulation-analysis" aria-labelledby="monster-balance-title">
            <h3 id="monster-balance-title">Équilibrage des monstres</h3>
            <p className="simulation-description">
                Analyse calculée depuis les caractéristiques de <code>monsters.ts</code> et les
                hypothèses par défaut de l’analyseur fourni.
            </p>
            <div className="simulation-table-wrap">
                <h4>Indicateurs globaux — tous les monstres</h4>
                <SortableTable
                    rows={reports}
                    columns={BALANCE_COLUMNS}
                    getRowKey={(monster) => monster.id}
                />
            </div>
            <div className="simulation-balance-grid">
                <label className="simulation-balance-select">
                    Monstre
                    <select
                        value={selected.id}
                        onChange={(event) => {
                            const nextId = event.currentTarget.value;
                            setSelectedId(nextId);
                            if (comparison.id === nextId) {
                                const nextComparison = MONSTERS.find(
                                    (monster) => monster.id !== nextId,
                                );
                                if (nextComparison) setComparisonId(nextComparison.id);
                            }
                        }}
                    >
                        {MONSTERS.map((monster) => (
                            <option key={monster.id} value={monster.id}>
                                {monster.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="simulation-balance-select">
                    Comparer avec
                    <select
                        value={comparison.id}
                        onChange={(event) => setComparisonId(event.currentTarget.value)}
                    >
                        {MONSTERS.filter((monster) => monster.id !== selected.id).map((monster) => (
                            <option key={monster.id} value={monster.id}>
                                {monster.name}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            <div className="simulation-table-wrap">
                <table className="simulation-table simulation-comparison-table">
                    <thead>
                        <tr>
                            <th scope="col">Indicateur</th>
                            <th scope="col">{selected.name}</th>
                            <th scope="col">{comparison.name}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {comparisonRows.map((row) => (
                            <tr key={row.label}>
                                <th scope="row">{row.label}</th>
                                <td>
                                    {isBetter(row.first, row.second, row.lowerIsBetter) && (
                                        <strong className="simulation-comparison-maximum">
                                            {format(row.first)}
                                        </strong>
                                    )}
                                    {!isBetter(row.first, row.second, row.lowerIsBetter) &&
                                        format(row.first)}
                                </td>
                                <td>
                                    {isBetter(row.second, row.first, row.lowerIsBetter) && (
                                        <strong className="simulation-comparison-maximum">
                                            {format(row.second)}
                                        </strong>
                                    )}
                                    {!isBetter(row.second, row.first, row.lowerIsBetter) &&
                                        format(row.second)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="simulation-footnote">
                Estimations basées sur un plateau 19 × 13, 5 ressources par tour, 15 % d’ennemis, 10
                % d’alliés et un horizon de 12 tours.
            </p>
        </section>
    );
}
