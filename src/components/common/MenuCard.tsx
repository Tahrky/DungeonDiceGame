import type { ReactNode } from "react";

interface MenuCardProps {
    readonly icon: ReactNode;
    readonly label: ReactNode;
    readonly onClick: () => void;
    readonly disabled?: boolean;
}

export function ChoiceIcon({ children }: { readonly children: string }) {
    return (
        <span className="choice-icon" aria-hidden="true">
            {children}
        </span>
    );
}

export function MenuCard({ icon, label, onClick, disabled }: MenuCardProps) {
    return (
        <button className="menu-card" onClick={onClick} disabled={disabled}>
            {icon}
            <strong>{label}</strong>
        </button>
    );
}
