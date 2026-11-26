import type { AnalyzableMatch, SimulationAnalysisConfiguration } from "../../simulation/analysis";
import { SelectField } from "../common/FormFields";
import { MatchDetails } from "./MatchDetails";

interface MatchInspectorProps {
    readonly matches: readonly AnalyzableMatch[];
    readonly configuration: SimulationAnalysisConfiguration;
    readonly selectedMatchId: string;
    readonly onMatchChange: (id: string) => void;
}

export function MatchInspector({
    matches,
    configuration,
    selectedMatchId,
    onMatchChange,
}: MatchInspectorProps) {
    const match = matches.find((candidate) => candidate.id === Number(selectedMatchId));

    return (
        <section className="simulation-match-inspector">
            <div className="simulation-inspector-heading">
                <div>
                    <h4>Plateau et historique d’un match</h4>
                    <p className="simulation-description">
                        Sélectionnez un match pour consulter son état final et ses actions.
                    </p>
                </div>
                <SelectField label="Match" value={selectedMatchId} onChange={onMatchChange}>
                    {matches.map((item) => (
                        <option key={item.id} value={item.id}>
                            #{item.id} · {item.turns} tours ·{" "}
                            {item.winner ? `J${item.winner} gagne` : "égalité"}
                        </option>
                    ))}
                </SelectField>
            </div>
            {match && <MatchDetails match={match} configuration={configuration} />}
        </section>
    );
}
