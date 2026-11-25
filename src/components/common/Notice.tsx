import type { ComponentProps } from "react";

export function Notice(props: ComponentProps<"output">) {
    return <output className="notice" {...props} />;
}
