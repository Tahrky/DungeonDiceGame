import { useEffect, useRef } from "react";

interface ResetLocalDataDialogProps {
    readonly isResetting: boolean;
    readonly onConfirm: () => void;
    readonly onCancel: () => void;
}

export function ResetLocalDataDialog({
    isResetting,
    onConfirm,
    onCancel,
}: ResetLocalDataDialogProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const cancelRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        dialog.showModal();
        cancelRef.current?.focus();
        return () => {
            if (dialog.open) dialog.close();
        };
    }, []);

    return (
        <dialog
            ref={dialogRef}
            className="unsaved-changes-dialog"
            aria-labelledby="reset-local-data-title"
            aria-describedby="reset-local-data-description"
            onCancel={(event) => {
                event.preventDefault();
                if (!isResetting) onCancel();
            }}
        >
            <h2 id="reset-local-data-title">Effacer les données locales ?</h2>
            <p id="reset-local-data-description">
                Les règles, le deck et toutes les sauvegardes de parties et de simulations sur cet
                appareil seront supprimés. Fermez les autres onglets du jeu avant de continuer.
                L’application sera rechargée avec les valeurs par défaut de la version installée.
            </p>
            <div className="unsaved-changes-actions">
                <button
                    className="primary-button"
                    type="button"
                    onClick={onConfirm}
                    disabled={isResetting}
                >
                    {isResetting ? "Suppression…" : "Tout effacer"}
                </button>
                <button
                    ref={cancelRef}
                    className="secondary-button"
                    type="button"
                    onClick={onCancel}
                    disabled={isResetting}
                >
                    Annuler
                </button>
            </div>
        </dialog>
    );
}
