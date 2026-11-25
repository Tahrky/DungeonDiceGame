import type { ReactNode } from "react";

interface MenuScreenProps {
    readonly panelId?: string;
    readonly screenClassName?: string;
    readonly isLive?: boolean;
    readonly backLabel?: string;
    readonly isBackDisabled?: boolean;
    readonly onBack?: () => void;
    readonly eyebrow?: string;
    readonly title?: ReactNode;
    readonly description?: ReactNode;
    readonly dialog?: ReactNode;
    readonly children: ReactNode;
}

export function MenuScreen({
    panelId,
    screenClassName,
    isLive,
    backLabel = "Retour à l’accueil",
    isBackDisabled,
    onBack,
    eyebrow,
    title,
    description,
    dialog,
    children,
}: MenuScreenProps) {
    return (
        <section
            id="menu-screen"
            className={screenClassName}
            aria-live={isLive ? "polite" : undefined}
        >
            <section id={panelId} className="menu-panel">
                {onBack && (
                    <button className="back-button" onClick={onBack} disabled={isBackDisabled}>
                        {`← ${backLabel}`}
                    </button>
                )}
                {eyebrow && <p className="eyebrow">{eyebrow}</p>}
                {title && <h2>{title}</h2>}
                {description && <p className="panel-description">{description}</p>}
                {children}
            </section>
            {dialog}
        </section>
    );
}
