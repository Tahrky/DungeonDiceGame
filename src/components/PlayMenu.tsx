import type { BotProfile } from "../game/botStrategy";
import { ProfileSelect } from "./common/FormFields";
import { ChoiceIcon, MenuCard } from "./common/MenuCard";
import { MenuScreen } from "./common/MenuScreen";

interface PlayMenuProps {
    readonly canPlay: boolean;
    readonly showOnlineOptions: boolean;
    readonly opponentProfile: BotProfile;
    readonly onBack: () => void;
    readonly onPlay: (profile: BotProfile) => void;
    readonly onOpponentProfileChange: (profile: BotProfile) => void;
    readonly onLocalPlay: () => void;
    readonly onOnline: () => void;
}

export function PlayMenu({
    canPlay,
    showOnlineOptions,
    opponentProfile,
    onBack,
    onPlay,
    onOpponentProfileChange,
    onLocalPlay,
    onOnline,
}: PlayMenuProps) {
    return (
        <MenuScreen isLive onBack={onBack} title="Jouer">
            <ProfileSelect
                label="Profil de l’ordinateur"
                value={opponentProfile}
                onChange={onOpponentProfileChange}
            />
            <div className={`menu-card-grid${showOnlineOptions ? "" : " menu-card-grid--two"}`}>
                <MenuCard
                    icon={
                        <svg className="choice-monitor-icon" viewBox="0 0 48 48" aria-hidden="true">
                            <rect x="5" y="7" width="38" height="27" rx="2" />
                            <path d="M18 41h12m-6-7v7" />
                            <path d="M10 12h28v17H10z" className="monitor-screen" />
                        </svg>
                    }
                    label="Ordinateur"
                    onClick={() => onPlay(opponentProfile)}
                    disabled={!canPlay}
                />
                <MenuCard
                    icon={<ChoiceIcon>⚔</ChoiceIcon>}
                    label="Local"
                    onClick={onLocalPlay}
                    disabled={!canPlay}
                />
                {showOnlineOptions && (
                    <MenuCard
                        icon={<ChoiceIcon>⌂</ChoiceIcon>}
                        label="En ligne"
                        onClick={onOnline}
                    />
                )}
            </div>
        </MenuScreen>
    );
}
