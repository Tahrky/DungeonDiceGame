import { useState } from "react";
import { resetLocalData } from "../persistence/resetLocalData";
import { formatFailure } from "../utils/errors";
import { ChoiceIcon, MenuCard } from "./common/MenuCard";
import { MenuScreen } from "./common/MenuScreen";
import { Notice } from "./common/Notice";
import { ResetLocalDataDialog } from "./settings/ResetLocalDataDialog";

interface OptionsMenuProps {
    readonly onBack: () => void;
    readonly onConfigureRules: () => void;
    readonly onConfigureMonsters: () => void;
    readonly onOpenSimulation: () => void;
}

export function OptionsMenu({
    onBack,
    onConfigureRules,
    onConfigureMonsters,
    onOpenSimulation,
}: OptionsMenuProps) {
    const [confirmReset, setConfirmReset] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [resetError, setResetError] = useState("");

    async function reset(): Promise<void> {
        setIsResetting(true);
        setResetError("");
        try {
            await resetLocalData();
            window.location.reload();
        } catch (error) {
            setResetError(
                formatFailure(
                    "Suppression incomplète ; certaines données ont peut-être été effacées",
                    error,
                ),
            );
            setConfirmReset(false);
            setIsResetting(false);
        }
    }

    return (
        <MenuScreen
            isLive
            onBack={onBack}
            title="Options"
            dialog={
                confirmReset && (
                    <ResetLocalDataDialog
                        isResetting={isResetting}
                        onConfirm={() => void reset()}
                        onCancel={() => setConfirmReset(false)}
                    />
                )
            }
        >
            <div className="menu-card-grid">
                <MenuCard
                    icon={<ChoiceIcon>⚙</ChoiceIcon>}
                    label="Règles"
                    onClick={onConfigureRules}
                />
                <MenuCard
                    icon={
                        <svg className="choice-book-icon" viewBox="0 0 48 48" aria-hidden="true">
                            <path d="M24 13c-5-4-10-4-17-3v26c7-1 12 0 17 4 5-4 10-5 17-4V10c-7-1-12-1-17 3Z" />
                            <path d="M24 13v27M7 16c7-1 12 0 17 4m17-4c-7-1-12 0-17 4" />
                        </svg>
                    }
                    label={
                        <>
                            Configuration
                            <br />
                            monstres
                        </>
                    }
                    onClick={onConfigureMonsters}
                />
                <MenuCard
                    icon={<ChoiceIcon>⚗</ChoiceIcon>}
                    label="Simulations"
                    onClick={onOpenSimulation}
                />
            </div>
            <div className="options-reset">
                <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setConfirmReset(true)}
                >
                    Effacer les données locales
                </button>
                {resetError && <Notice role="alert">{resetError}</Notice>}
            </div>
        </MenuScreen>
    );
}
