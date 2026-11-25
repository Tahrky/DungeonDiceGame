import { useEffect, useRef } from "react";

interface UnsavedChangesDialogProps {
    readonly onSave: () => void;
    readonly onDiscard: () => void;
    readonly onCancel: () => void;
}

export function UnsavedChangesDialog({ onSave, onDiscard, onCancel }: UnsavedChangesDialogProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        dialog.showModal();
        return () => {
            if (dialog.open) dialog.close();
        };
    }, []);

    return (
        <dialog
            ref={dialogRef}
            className="unsaved-changes-dialog"
            aria-labelledby="unsaved-changes-title"
            aria-describedby="unsaved-changes-description"
            onCancel={(event) => {
                event.preventDefault();
                onCancel();
            }}
        >
            <h2 id="unsaved-changes-title">Modifications non enregistrées</h2>
            <p id="unsaved-changes-description">
                Voulez-vous enregistrer vos modifications avant de quitter cette page ?
            </p>
            <div className="unsaved-changes-actions">
                <button className="primary-button" type="button" onClick={onSave}>
                    Enregistrer et quitter
                </button>
                <button className="secondary-button" type="button" onClick={onDiscard}>
                    Quitter sans enregistrer
                </button>
                <button className="secondary-button" type="button" onClick={onCancel}>
                    Continuer les modifications
                </button>
            </div>
        </dialog>
    );
}
