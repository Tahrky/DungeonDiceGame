import { ChoiceIcon, MenuCard } from "./common/MenuCard";
import { MenuScreen } from "./common/MenuScreen";

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
    return (
        <MenuScreen isLive onBack={onBack} title="Options">
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
        </MenuScreen>
    );
}
