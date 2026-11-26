import { useMemo, useState } from "react";
import { BOT_PROFILES, BOT_PROFILE_LABELS } from "../../game/botStrategy";
import { analyzeProfileData, type SimulationData } from "../../simulation/analysis";
import { SelectField } from "../common/FormFields";
import { getAnalysisMonsterColumns } from "./analysisMonsterColumns";
import { MetricBarChart } from "./MetricBarChart";
import { SortableTable } from "./SortableTable";

interface ProfileStatisticsProps {
    readonly data: SimulationData;
}

export function ProfileStatistics({ data }: ProfileStatisticsProps) {
    const profiles = useMemo(() => {
        const present = new Set(data.matches.flatMap((match) => Object.values(match.profiles)));
        return BOT_PROFILES.filter((profile) => present.has(profile));
    }, [data]);
    const [selectedProfile, setSelectedProfile] = useState(profiles[0]);
    const profile = profiles.includes(selectedProfile) ? selectedProfile : profiles[0];
    const analytics = useMemo(() => analyzeProfileData(data, profile), [data, profile]);
    const metrics: [string, string | number][] = [
        ["Matchs analysés", analytics.matchCount],
        ["Tours moyens", analytics.averageTurns?.toFixed(1) ?? "—"],
        [
            "Taux de victoire",
            analytics.winRate === null ? "—" : `${(analytics.winRate * 100).toFixed(1)} %`,
        ],
        ["Victoires · J1", analytics.winsByPlayer[1]],
        ["Victoires · J2", analytics.winsByPlayer[2]],
        ["Victoires · PV de la base à 0", analytics.winsByFinishReason.baseDestroyed],
        [
            "Victoires · élimination des monstres adverses",
            analytics.winsByFinishReason.monstersEliminated,
        ],
        ["Matchs nuls", analytics.draws],
    ];

    return (
        <section>
            <SelectField
                label="Profil du bot"
                value={profile}
                onChange={(value) => {
                    const selected = profiles.find((candidate) => candidate === value);
                    if (selected) setSelectedProfile(selected);
                }}
            >
                {profiles.map((candidate) => (
                    <option key={candidate} value={candidate}>
                        {BOT_PROFILE_LABELS[candidate]}
                    </option>
                ))}
            </SelectField>
            <p className="simulation-description">
                Un match est compté une seule fois même si les deux joueurs utilisent ce profil ;
                les invocations et actions des deux joueurs sont alors incluses.
                Les matchs nuls sont inclus dans le calcul du taux de victoire.
            </p>
            {!analytics.hasDetailedHistory && (
                <p className="simulation-description" role="status">
                    Les résultats légers ne conservent pas les actions détaillées. Les statistiques
                    d’attaques, de dégâts et de déplacements par monstre ne sont pas disponibles.
                </p>
            )}
            <div className="simulation-metrics">
                {metrics.map(([label, value]) => (
                    <div className="simulation-metric-card" key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                    </div>
                ))}
            </div>
            <div className="simulation-chart-grid">
                <MetricBarChart
                    title="Durée des parties"
                    valueLabel="matchs"
                    bars={analytics.turnDistribution.map(({ turns, matches }) => ({
                        label: `${turns} tours`,
                        value: matches,
                    }))}
                />
                <MetricBarChart
                    title="Apparitions par monstre"
                    valueLabel="invocations"
                    bars={analytics.monsters.map((monster) => ({
                        label: monster.name,
                        value: monster.appearances,
                    }))}
                />
            </div>
            <div className="simulation-table-wrap">
                <h4>Tableau général par monstre</h4>
                <SortableTable
                    rows={analytics.monsters}
                    columns={getAnalysisMonsterColumns(
                        analytics.matchCount,
                        analytics.hasDetailedHistory,
                    )}
                    getRowKey={(monster) => monster.id}
                />
            </div>
        </section>
    );
}
