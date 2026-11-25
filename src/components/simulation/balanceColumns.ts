import type { MonsterBalance } from "../../simulation/monsterBalance";
import { nameColumn } from "./monsterColumns";
import type { SortableColumn } from "./SortableTable";

interface MetricColumnSpec {
    readonly key: string;
    readonly label: string;
    readonly headerTitle?: string;
    readonly getValue: (monster: MonsterBalance) => number | null;
}

export function formatBalanceValue(value: number | null): string {
    if (value === null || !Number.isFinite(value) || value === 0) return "";
    return value.toFixed(2).replace(/\.?0+$/, "");
}

function metricColumn({ getValue, ...column }: MetricColumnSpec): SortableColumn<MonsterBalance> {
    return { ...column, getValue, render: (monster) => formatBalanceValue(getValue(monster)) };
}

export const BALANCE_COLUMNS: SortableColumn<MonsterBalance>[] = [
    nameColumn(),
    metricColumn({
        key: "total",
        label: "Score global / 10",
        headerTitle:
            "Moyenne pondérée des cinq indicateurs principaux, chacun ramené sur 10 :\n\nRobustesse : 4/17\nAttaque : 5/17\nMobilité : 3/17\nUtilité : 3/17\nÉconomie d’actions : 2/17\n\nLa portée et les zones restent affichées à part; leurs effets sur les cibles attendues sont déjà intégrés à l’offensive.",
        getValue: (monster) => monster.scores.total,
    }),
    metricColumn({ key: "summonCost", label: "Coût invoc", getValue: (m) => m.summonCost }),
    metricColumn({ key: "hp", label: "PV", getValue: (monster) => monster.hp }),
    {
        key: "armor",
        label: "Armure",
        getValue: (monster) => monster.armor,
        render: (monster) => monster.armor.toString(),
    },
    metricColumn({
        key: "averageAttacks",
        label: "Attaques moyennes nécessaires",
        headerTitle:
            "Nombre moyen d’attaques capables de blesser nécessaires pour éliminer le monstre. Les attaques neutralisées par l’armure sont exclues.",
        getValue: (monster) => monster.averageAttacksToEliminate,
    }),
    {
        ...metricColumn({
            key: "averageAttackDamage",
            label: "Attaque moyenne (dégâts/cible)",
            headerTitle:
                "Dégâts moyens par attaque et par cible, pondérés par les utilisations réalisables sur 12 tours; cooldowns et limites d’utilisation inclus. Les attaques de zone ne sont pas multipliées par leurs cibles potentielles.",
            getValue: (monster) => monster.averageDamagePerAttack,
        }),
        render: (monster) =>
            monster.averageDamagePerAttack === null
                ? "–"
                : formatBalanceValue(monster.averageDamagePerAttack),
    },
    metricColumn({
        key: "durability",
        label: "Robustesse",
        headerTitle:
            "Nombre moyen d’attaques nécessaires pour éliminer le monstre, normalisé à partir des PV et de l’armure.",
        getValue: (monster) => monster.scores.durability,
    }),
    metricColumn({
        key: "entryCost",
        label: "Coût d’entrée estimé",
        headerTitle:
            "coût d’invocation + le coût d’une attaque immédiatement disponible + le coût d’un déplacement. L’attaque retenue est celle que le calculateur juge la plus intéressante par ressource parmi celles sans temps de recharge initial.",
        getValue: (monster) => monster.economy.standardEntryCost,
    }),
    metricColumn({
        key: "operatingCost",
        label: "Coût opérationnel / tour",
        headerTitle:
            "Coût moyen des attaques retenues sur 12 tours, plus le coût de tous les déplacements que le monstre peut effectuer dans un tour.",
        getValue: (monster) => monster.economy.averageOperatingCostPerTurn,
    }),
    metricColumn({
        key: "grossCost",
        label: "Coût équivalent / tour",
        headerTitle: "Coût opérationnel + coût d'invocation + déficit par catégorie de symbole.",
        getValue: (monster) => monster.economy.grossEquivalentCostPerTurn,
    }),
    metricColumn({
        key: "optimum",
        label: "Optimum / tour",
        headerTitle:
            "Nombre de fois ou un monstre peut effectuer la totalité de ses actions par tour avec 5 ressources.",
        getValue: ({ economy }) =>
            economy.grossEquivalentPressurePercent > 0
                ? 100 / economy.grossEquivalentPressurePercent
                : null,
    }),
    metricColumn({
        key: "efficiency",
        label: "Efficacité d’invocation / tour",
        headerTitle:
            "Score tactique global divisé par le coût d’invocation. C’est un score relatif par symbole d’invocation.",
        getValue: (monster) => monster.economy.invocationEfficiency,
    }),
    metricColumn({
        key: "offense",
        label: "Attaque",
        headerTitle:
            "Dégâts directs et différés pondérés par les ressources, la portée, la zone d’effet et la disponibilité des attaques.",
        getValue: (monster) => monster.scores.offense,
    }),
    metricColumn({
        key: "range",
        label: "Portée / zone (complémentaire)",
        headerTitle:
            "Diagnostic de portée utile et de zone, affiché hors score global pour éviter un double comptage avec les dégâts attendus.",
        getValue: (monster) => monster.scores.rangeControl,
    }),
    metricColumn({
        key: "mobility",
        label: "Mobilité",
        headerTitle:
            "Portée atteignable, nombre et coût des déplacements, avec vol et traversée des ennemis.",
        getValue: (monster) => monster.scores.mobility,
    }),
    metricColumn({
        key: "actionEconomy",
        label: "Économie d’action",
        headerTitle:
            "Valeur moyenne des attaques et déplacements réellement réalisables avec les ressources disponibles, les usages par tour et les cooldowns.",
        getValue: (monster) => monster.scores.actionEconomy,
    }),
    metricColumn({
        key: "utility",
        label: "Utilité",
        headerTitle:
            "Soins, suppression d’effets, buffs, réductions de recharge/coût et effets défensifs comme le camouflage.",
        getValue: (monster) => monster.scores.utility,
    }),
];
