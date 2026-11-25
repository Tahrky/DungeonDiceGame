import { BOT_PROFILE_LABELS } from "../../game/botStrategy";
import { PLAYER_IDS } from "../../game/matchRules";
import type { OutcomeRate, SimulationAnalytics } from "../../simulation/analysis";
import { BOT_PROFILES } from "../../simulation/types";

interface OutcomeRow {
    readonly key: string;
    readonly label: string;
    readonly outcome: OutcomeRate;
}

function formatPercentage(value: number): string {
    return `${(value * 100).toFixed(1)} %`;
}

function formatRate({ wins, matches, winRate, confidenceInterval }: OutcomeRate): string {
    if (winRate === null || !confidenceInterval) return "Indisponible";
    const { lowerBound, upperBound } = confidenceInterval;
    return `${wins}/${matches} · ${formatPercentage(winRate)} (${formatPercentage(lowerBound)}–${formatPercentage(upperBound)})`;
}

function getOutcomeRows(analytics: SimulationAnalytics): OutcomeRow[] {
    return [
        ...PLAYER_IDS.map((player) => ({
            key: `player-${player}`,
            label: `J${player}`,
            outcome: analytics.playerOutcomes[player],
        })),
        ...PLAYER_IDS.map((player) => ({
            key: `starting-player-${player}`,
            label: `J${player} commence`,
            outcome: analytics.startingPlayerOutcomes[player],
        })),
        ...BOT_PROFILES.flatMap((profile) => {
            const outcome = analytics.profileOutcomes[profile];
            return outcome ? [{ key: profile, label: BOT_PROFILE_LABELS[profile], outcome }] : [];
        }),
    ];
}

export function OutcomeTable({ analytics }: { readonly analytics: SimulationAnalytics }) {
    return (
        <table className="simulation-table">
            <thead>
                <tr>
                    <th scope="col">Comparaison</th>
                    <th scope="col">Victoires / matchs · taux (IC 95 %)</th>
                    <th scope="col">Nuls</th>
                </tr>
            </thead>
            <tbody>
                {getOutcomeRows(analytics).map(({ key, label, outcome }) => (
                    <tr key={key}>
                        <th scope="row">{label}</th>
                        <td>{formatRate(outcome)}</td>
                        <td>{outcome.draws}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
