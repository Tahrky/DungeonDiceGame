import { loadEnv, defineConfig, type Plugin } from "vite";

import { createAblyTokenResponse } from "./api/ably-token";

function localAblyTokenApi(): Plugin {
    return {
        name: "local-ably-token-api",
        configureServer(server) {
            server.middlewares.use(async (request, response, next) => {
                const url = new URL(request.url ?? "/", "http://localhost");
                if (url.pathname !== "/api/ably-token") {
                    next();
                    return;
                }

                const result = await createAblyTokenResponse(
                    request.method,
                    url.searchParams.get("roomCode"),
                );
                response.statusCode = result.status;
                response.setHeader("Content-Type", "application/json");
                if (result.status === 405) response.setHeader("Allow", "GET");
                response.end(JSON.stringify(result.body));
            });
        },
    };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");
    if (!process.env.ABLY_API_KEY && env.ABLY_API_KEY) {
        process.env.ABLY_API_KEY = env.ABLY_API_KEY;
    }

    return { plugins: [localAblyTokenApi()] };
});
