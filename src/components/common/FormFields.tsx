import type { ReactNode } from "react";

import { BOT_PROFILES, BOT_PROFILE_LABELS, type BotProfile } from "../../game/botStrategy";

interface NumberFieldProps {
    readonly label: ReactNode;
    readonly min: number;
    readonly max: number;
    readonly value: number | string;
    readonly onChange: (value: string) => void;
}

interface ToggleFieldProps {
    readonly label: ReactNode;
    readonly checked: boolean;
    readonly onChange: (checked: boolean) => void;
}

interface SelectFieldProps {
    readonly label: ReactNode;
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly id?: string;
    readonly className?: string;
    readonly children: ReactNode;
}

interface ProfileSelectProps {
    readonly label: string;
    readonly value: BotProfile;
    readonly onChange: (profile: BotProfile) => void;
}

export function NumberField({ label, min, max, value, onChange }: NumberFieldProps) {
    return (
        <label className="settings-field">
            {label}
            <input
                type="number"
                min={min}
                max={max}
                step="1"
                value={value}
                onChange={(event) => onChange(event.currentTarget.value)}
            />
        </label>
    );
}

export function ToggleField({ label, checked, onChange }: ToggleFieldProps) {
    return (
        <label className="settings-toggle">
            <input
                type="checkbox"
                checked={checked}
                onChange={(event) => onChange(event.currentTarget.checked)}
            />
            {label}
        </label>
    );
}

export function SelectField({
    label,
    value,
    onChange,
    id,
    className = "settings-field",
    children,
}: SelectFieldProps) {
    return (
        <label className={className} htmlFor={id}>
            {label}
            <select id={id} value={value} onChange={(event) => onChange(event.currentTarget.value)}>
                {children}
            </select>
        </label>
    );
}

export function ProfileSelect({ label, value, onChange }: ProfileSelectProps) {
    return (
        <SelectField
            label={label}
            value={value}
            onChange={(profile) => onChange(profile as BotProfile)}
        >
            {BOT_PROFILES.map((profile) => (
                <option key={profile} value={profile}>
                    {BOT_PROFILE_LABELS[profile]}
                </option>
            ))}
        </SelectField>
    );
}
