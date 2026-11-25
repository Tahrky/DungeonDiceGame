import { useRef } from "react";

interface JsonFileButtonProps {
    readonly label: string;
    readonly onFile: (file: File) => void;
}

export function JsonFileButton({ label, onFile }: JsonFileButtonProps) {
    const inputRef = useRef<HTMLInputElement>(null);

    return (
        <>
            <button className="secondary-button" onClick={() => inputRef.current?.click()}>
                {label}
            </button>
            <input
                ref={inputRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    if (file) onFile(file);
                }}
            />
        </>
    );
}
