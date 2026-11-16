import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const TOKEN = "t".repeat(32);
const calls = [];
let logins = 0, expireNext = false, mock, proc, client, base;

before(async () => {
  // Fake Responder Live API
  mock = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      const j = body ? JSON.parse(body) : undefined;
      if (req.url === "/v2/oauth/token") {
        logins++;
        const ok = j.client_id === 45 && j.client_secret === "SEC" && j.user_token === "UT" && j.grant_type === "client_credentials";
        if (!ok) { res.statusCode = 401; return res.end('{"message":"bad"}'); }
        return res.end(JSON.stringify({ status: true, token: `jwt${logins}` }));
      }
      const auth = req.headers.authorization;
      calls.push({ method: req.method, url: req.url, body: j, auth });
      if (expireNext) { expireNext = false; res.statusCode = 401; return res.end('{"message":"expired"}'); }
      if (!/^Bearer jwt\d+$/.test(auth || "")) { res.statusCode = 401; return res.end("{}"); }
      if (req.url === "/v2/lists") return res.end(JSON.stringify({ status: "true", data: [{ id: 1, name: "רשימה" }] }));
      if (req.url === "/v2/lists/7/subscribers") return res.end(JSON.stringify({ status: true, total: 250, data: Array.from({ length: 250 }, (_, i) => ({ subscriber_id: i })) }));
      res.end(JSON.stringify({ status: true }));
    });
  });
  await new Promise((r) => mock.listen(0, r));

  const port = 3900 + Math.floor(Math.random() * 90);
  proc = spawn(process.execPath, ["src/http.js"], {
    env: { ...process.env, PORT: String(port), MCP_ACCESS_TOKEN: TOKEN,
      RESPONDER_CLIENT_ID: "45", RESPONDER_CLIENT_SECRET: "SEC", RESPONDER_USER_TOKEN: "UT",
      RESPONDER_BASE_URL: `http://127.0.0.1:${mock.address().port}/v2` },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise((r) => proc.stdout.once("data", r));
  base = `http://127.0.0.1:${port}`;
  client = new Client({ name: "test", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp/${TOKEN}`)));
});

after(async () => { await client?.close(); proc?.kill(); mock?.close(); });

const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  return { ...r, text: r.content[0].text };
};

test("rejects bad token", async () => {
  for (const p of ["/mcp/wrong", "/mcp"]) {
    const r = await fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(r.status, 401);
  }
});

test("lists tools with safety annotations", async () => {
  const { tools } = await client.listTools();
  assert.ok(tools.length >= 20, String(tools.length));
  assert.ok(!tools.some((t) => t.name.startsWith("old_")), "no old-system tools without its keys");
  assert.equal(tools.find((t) => t.name === "delete_subscriber").annotations.destructiveHint, true);
  assert.equal(tools.find((t) => t.name === "list_lists").annotations.readOnlyHint, true);
});

test("logs in once and reuses the bearer token", async () => {
  const r = await call("list_lists", {});
  assert.ok(!r.isError, r.text);
  assert.match(r.text, /רשימה/);
  await call("list_lists", {});
  assert.equal(logins, 1);
  assert.equal(calls.at(-1).auth, "Bearer jwt1");
});

test("re-logs in on 401 and retries", async () => {
  expireNext = true;
  const r = await call("list_tags", {});
  assert.ok(!r.isError, r.text);
  assert.equal(logins, 2);
  assert.equal(calls.at(-1).auth, "Bearer jwt2");
  assert.equal(calls.at(-1).url, "/v2/tags/subscribers");
});

test("add_subscriber sends JSON with numeric list ids", async () => {
  const r = await call("add_subscriber", { email: "a@b.co", first: "דוד", list_ids: ["5"], personal_fields: { "3": "ירושלים" }, rejoin: true });
  assert.ok(!r.isError, r.text);
  const c = calls.at(-1);
  assert.equal(c.method, "POST");
  assert.equal(c.url, "/v2/subscribers");
  assert.deepEqual(c.body, { email: "a@b.co", first: "דוד", list_ids: [5], personal_fields: { "3": "ירושלים" }, rejoin: true });
});

test("get_list_subscribers pages client-side", async () => {
  const r = JSON.parse((await call("get_list_subscribers", { list_id: 7, limit: 10, offset: 240 })).text);
  assert.equal(r.total, 250);
  assert.equal(r.data.length, 10);
  assert.equal(r.data[0].subscriber_id, 240);
});

test("search uses query params", async () => {
  await call("search_subscribers", { list_id: 7, search: "דוד" });
  assert.equal(calls.at(-1).url, `/v2/subscribers/search?listId=7&searchKey=${encodeURIComponent("דוד")}&offset=0&size=50`);
});

test("delete requires confirm=true", async () => {
  const n = calls.length;
  const r = await call("delete_subscriber", { subscriber_id: 9 });
  assert.ok(r.isError);
  assert.equal(calls.length, n);
  const ok = await call("delete_subscriber", { subscriber_id: 9, confirm: true });
  assert.ok(!ok.isError, ok.text);
  assert.equal(calls.at(-1).method, "DELETE");
  assert.equal(calls.at(-1).url, "/v2/subscribers/9");
});

test("unsubscribe by email", async () => {
  await call("unsubscribe", { who: { email: "x@y.co" } });
  assert.deepEqual(calls.at(-1).body, { email: "x@y.co" });
  assert.equal(calls.at(-1).url, "/v2/req/unsubscribe");
});
