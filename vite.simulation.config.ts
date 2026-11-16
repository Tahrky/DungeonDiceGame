import { defineConfig } from "vite";

export default defineConfig({
    build: {
        ssr: "src/simulation/cli.ts",
        outDir: "dist/simulation",
        emptyOutDir: true,
        rollupOptions: {
            output: {
                entryFileNames: "run-simulations.mjs",
            },
        },
    },
});
