import type { IncomingMessage, ServerResponse } from "node:http";
import { createApplication } from "../server/index.ts";
import { runtimeConfig } from "../server/runtime.ts";

let application: ReturnType<typeof createApplication> | undefined;
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  try {
    if (!application) {
      runtimeConfig();
      application = createApplication();
    }
    const url = new URL(req.url || "/", "https://warehouse.invalid");
    if (!url.pathname.startsWith("/api/v1/")) {
      const route = url.searchParams.get("__route");
      if (
        !route ||
        /[?#\\]/.test(route) ||
        route.startsWith("/") ||
        route.split("/").includes("..")
      ) {
        res.writeHead(404).end();
        return;
      }
      req.url = "/api/v1/" + route;
    }
    await application.handler(req, res);
  } catch {
    res.writeHead(503, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(
      JSON.stringify({
        error:
          "Service configuration is incomplete. Please contact the workspace administrator.",
      }),
    );
  }
}
