import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { SwsdClient, SwsdApiError } from "../dist/client.js";
import { registerTools } from "../dist/tools.js";

const api = () => new SwsdClient({ token: "test-token" });

test("GET retries rate limits and transient failures, then returns the response", async (t) => {
  const responses = [
    new Response("busy", { status: 429, headers: { "Retry-After": "0" } }),
    new Response("busy", { status: 503, headers: { "Retry-After": "Thu, 01 Jan 1970 00:00:00 GMT" } }),
    Response.json([{ id: 1 }]),
  ];
  const fetch = t.mock.method(globalThis, "fetch", async () => responses.shift());
  assert.deepEqual(await api().get("incidents.json"), [{ id: 1 }]);
  assert.equal(fetch.mock.callCount(), 3);
});

test("GET retries are bounded; permanent errors and long Retry-After delays surface immediately", async (t) => {
  for (const [status, retryAfter, attempts] of [[503, "0", 3], [401, "0", 1], [429, "60", 1], [429, new Date(Date.now() + 60_000).toUTCString(), 1]]) {
    const fetch = t.mock.method(globalThis, "fetch", async () => new Response("failed", {
      status, headers: { "Retry-After": retryAfter },
    }));
    await assert.rejects(api().get("incidents.json"), (error) => {
      assert.ok(error instanceof SwsdApiError);
      assert.equal(error.status, status);
      assert.ok(error.message.includes(`Retry-After: ${retryAfter}`));
      return true;
    });
    assert.equal(fetch.mock.callCount(), attempts);
    fetch.mock.restore();
  }
});

test("network read failures retry, but POST and PUT never retry", async (t) => {
  let attempts = 0;
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    if (++attempts === 1) throw new TypeError("fetch failed");
    return Response.json({ id: 1 });
  });
  assert.deepEqual(await api().get("incidents/1.json"), { id: 1 });
  assert.equal(attempts, 2);
  fetch.mock.restore();
  for (const method of ["post", "put"]) {
    for (const failure of ["network", "http"]) {
      const writeFetch = t.mock.method(globalThis, "fetch", async () => {
        if (failure === "network") throw new TypeError("fetch failed");
        return new Response("busy", { status: 503, headers: { "Retry-After": "0" } });
      });
      await assert.rejects(api()[method]("incidents.json", { incident: { name: "test" } }));
      assert.equal(writeFetch.mock.callCount(), 1);
      writeFetch.mock.restore();
    }
  }
});

test("timeouts cover response bodies, bound GET attempts, and warn about uncertain writes", async (t) => {
  // Keep the event loop alive while AbortSignal.timeout's unref'd timers run.
  const keepAlive = setInterval(() => {}, 1000);
  t.after(() => clearInterval(keepAlive));
  for (const method of ["get", "post", "put"]) {
    const fetch = t.mock.method(globalThis, "fetch", async (_url, { signal }) => ({
      headers: new Headers(),
      text: () => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    }));
    const client = new SwsdClient({ token: "test-token", timeoutMs: 10 });
    await assert.rejects(client[method]("incidents.json"), method === "get" ? /timed out/ : /write may have succeeded/);
    assert.equal(fetch.mock.callCount(), method === "get" ? 3 : 1);
    fetch.mock.restore();
  }
  assert.throws(() => new SwsdClient({ timeoutMs: 0 }), /timeoutMs/);
});

test("MCP exposes safe write schemas and explicit scan completeness across resources", async (t) => {
  let get = async () => [];
  const writes = [];
  const server = new McpServer({ name: "test-swsd", version: "1" });
  registerTools(server, {
    get: (...args) => get(...args),
    post: async (path, body) => { writes.push({ path, body }); return body; },
    put: async (path, body) => { writes.push({ path, body }); return body; },
  });
  const client = new Client({ name: "test-client", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(async () => { await client.close(); await server.close(); });
  const { tools } = await client.listTools();
  assert.equal(tools.length, 22);

  for (const resource of ["incident", "problem", "change"]) {
    const update = tools.find((tool) => tool.name === `swsd_update_${resource}`);
    assert.equal(update.annotations.destructiveHint, true);
    assert.equal(update.annotations.idempotentHint, false);
    assert.deepEqual(update.inputSchema.properties.payload.required, [resource]);
    for (const operation of ["create", "update"]) {
      const name = `swsd_${operation}_${resource}`;
      for (const payload of [{}, { name: "unwrapped" }, { [resource]: {} }, { [resource]: { name: 42 } }, { [resource]: { name: "test" }, typo: true }]) {
        const before = writes.length;
        assert.equal((await client.callTool({ name, arguments: { id: 1, payload } })).isError, true);
        assert.equal(writes.length, before);
      }
      const payload = { [resource]: { name: "test", custom_fields_values: [{ name: "Team", value: "ICT" }] } };
      const result = await client.callTool({ name, arguments: { id: 1, payload } });
      assert.notEqual(result.isError, true);
      assert.deepEqual(writes.at(-1).body, payload);
    }

    // No matches on a full final page must not imply there are no assigned records.
    get = async () => [{ id: 1, assignee: { id: 99 }, state: "Assigned" }];
    let result = await client.callTool({ name: `swsd_list_${resource}s`, arguments: {
      query: { per_page: 1 }, assignee: { id: 42 }, max_pages: 1,
    } });
    assert.deepEqual(result.structuredContent[`${resource}s`], []);
    assert.equal(result.structuredContent.meta.complete, false);
    assert.equal(result.structuredContent.meta.truncated, true);
    assert.match(result.structuredContent.meta.warning, /incomplete/);

    get = async (_path, query) => query.page === 1 ? [{ id: 1, assignee: { id: 42 } }] : [];
    result = await client.callTool({ name: `swsd_list_${resource}s`, arguments: {
      query: { per_page: 1 }, assignee: { id: 42 }, max_pages: 2,
    } });
    assert.equal(result.structuredContent.meta.complete, true);
    assert.equal(result.structuredContent.meta.truncated, false);
    assert.equal(result.structuredContent.meta.pages_scanned, 2);
    assert.equal(result.structuredContent[`${resource}s`].length, 1);
  }

  // A later exhausted state must not hide an earlier state's capped scan.
  get = async (_path, query) => query.state === "Assigned" ? [{ id: 1, assignee: { id: 42 } }] : [];
  const states = await client.callTool({ name: "swsd_list_incidents", arguments: {
    query: { per_page: 1, state: ["Assigned", "On Hold"] }, assignee: { id: 42 }, max_pages: 1,
  } });
  assert.equal(states.structuredContent.meta.truncated, true);
  assert.equal(states.structuredContent.meta.pages_scanned, 2);

  get = async () => [{ id: 1, state: "Assigned" }];
  for (const resource of ["problems", "changes"]) {
    const result = await client.callTool({ name: `swsd_list_${resource}`, arguments: {
      query: { per_page: 1, state: "On Hold" }, max_pages: 1,
    } });
    assert.equal(result.structuredContent.meta.complete, false);
  }

  await client.callTool({ name: "swsd_create_private_incident_comment", arguments: {
    incident_id: 1, body: "private test", extra_comment_fields: { is_private: false },
  } });
  assert.equal(writes.at(-1).body.comment.is_private, true);
});
