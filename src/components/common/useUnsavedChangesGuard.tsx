import { useEffect, useState, type ReactNode } from "react";

import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

function useBeforeUnloadWarning(hasUnsavedChanges: boolean): void {
    useEffect(() => {
        if (!hasUnsavedChanges) return;

        const warnBeforeUnload = (event: BeforeUnloadEvent): void => {
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", warnBeforeUnload);
        return () => window.removeEventListener("beforeunload", warnBeforeUnload);
    }, [hasUnsavedChanges]);
}

export function useUnsavedChangesGuard(
    isDirty: boolean,
    onBack: () => void,
    save: () => boolean,
): { readonly requestBack: () => void; readonly dialog: ReactNode } {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    useBeforeUnloadWarning(isDirty);

    function requestBack(): void {
        if (isDirty) {
            setIsDialogOpen(true);
            return;
        }
        onBack();
    }

    function saveAndLeave(): void {
        if (save()) {
            onBack();
        } else {
            setIsDialogOpen(false);
        }
    }

    const dialog = isDialogOpen && (
        <UnsavedChangesDialog
            onSave={saveAndLeave}
            onDiscard={onBack}
            onCancel={() => setIsDialogOpen(false)}
        />
    );
    return { requestBack, dialog };
}
