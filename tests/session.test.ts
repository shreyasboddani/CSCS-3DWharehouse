import test from "node:test";
import assert from "node:assert/strict";
import { api, returnToPath, useSession } from "../src/app/service.ts";
test("auth return paths remain inside the workspace", () => {
  assert.equal(
    returnToPath("/app/warehouses/abc?view=top"),
    "/app/warehouses/abc?view=top",
  );
  for (const path of [
    null,
    "https://other.test",
    "//other.test",
    "/app-other",
    "/app\\\\other.test",
    "/app/../../outside",
  ])
    assert.equal(returnToPath(path), "/app");
});
test("session initialization failures remain retryable and stale checks cannot replace a signed-in user", async () => {
  const originalFetch = globalThis.fetch;
  const user = {
    id: "qa",
    name: "QA",
    email: "qa@example.test",
    workspace: "QA workspace",
  };
  try {
    useSession.setState({ user: null, ready: false, initializationError: "" });
    globalThis.fetch = async () => {
      throw new Error("offline");
    };
    await useSession.getState().initialize();
    assert.ok(useSession.getState().initializationError);
    assert.equal(useSession.getState().ready, true);
    let resolveFetch!: (response: Response) => void;
    globalThis.fetch = () =>
      new Promise((resolve) => {
        resolveFetch = resolve;
      });
    const pending = useSession.getState().initialize();
    useSession.getState().setUser(user);
    resolveFetch(
      new Response(JSON.stringify({ user: null }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    await pending;
    assert.deepEqual(useSession.getState().user, user);
    assert.equal(useSession.getState().initializationError, "");
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ user }), {
        headers: { "Content-Type": "application/json" },
      });
    await useSession.getState().initialize();
    assert.deepEqual(useSession.getState().user, user);
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "Session expired" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    await assert.rejects(api("/warehouses"), /Session expired/);
    assert.equal(useSession.getState().user, null);
    useSession.getState().setUser(user);
    await useSession.getState().logout();
    assert.equal(useSession.getState().user, null);
    globalThis.fetch = () =>
      new Promise((resolve) => {
        resolveFetch = resolve;
      });
    const staleRefresh = useSession.getState().refresh();
    useSession.getState().setUser({ ...user, id: "different-user" });
    resolveFetch(
      new Response(
        JSON.stringify({ warehouses: [{ id: "old-private-warehouse" }] }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
    await staleRefresh;
    assert.deepEqual(useSession.getState().warehouses, []);
    const staleRequest = api("/warehouses");
    useSession.getState().setUser(user);
    resolveFetch(
      new Response(JSON.stringify({ error: "Old session expired" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await assert.rejects(staleRequest, /Old session expired/);
    assert.equal(useSession.getState().user!.id, user.id);
  } finally {
    globalThis.fetch = originalFetch;
    useSession.setState({
      user: null,
      ready: false,
      initializationError: "",
      warehouses: [],
    });
  }
});
