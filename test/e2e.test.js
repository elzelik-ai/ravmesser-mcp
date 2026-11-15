import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const CREDS = { c_key: "CK", c_sec: "CS", u_key: "UK", u_sec: "US" };
const TOKEN = "t".repeat(32);
const calls = [];
let mock, proc, client;

before(async () => {
  // Fake Rav Messer API that verifies the auth header like the real one would.
  mock = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const auth = Object.fromEntries((req.headers.authorization || "").split(",").map((p) => p.split("=").map(decodeURIComponent)));
      const ok = auth.c_key === CREDS.c_key && auth.u_key === CREDS.u_key &&
        auth.c_secret === md5(CREDS.c_sec + auth.nonce) && auth.u_secret === md5(CREDS.u_sec + auth.nonce) &&
        Math.abs(Date.now() / 1000 - Number(auth.timestamp)) < 60;
      calls.push({ method: req.method, url: req.url, form: Object.fromEntries(new URLSearchParams(body)), ok });
      res.setHeader("content-type", "application/json");
      if (!ok) { res.statusCode = 401; return res.end('{"error":"bad auth"}'); }
      if (req.url.startsWith("/main/lists?") || req.url === "/main/lists") return res.end(JSON.stringify({ LISTS: [{ ID: 1, DESCRIPTION: "רשימה" }] }));
      res.end(JSON.stringify({ echo: true }));
    });
  });
  await new Promise((r) => mock.listen(0, r));

  const port = 3900 + Math.floor(Math.random() * 90);
  proc = spawn(process.execPath, ["src/http.js"], {
    env: { ...process.env, PORT: String(port), MCP_ACCESS_TOKEN: TOKEN,
      RESPONDER_CLIENT_KEY: CREDS.c_key, RESPONDER_CLIENT_SECRET: CREDS.c_sec,
      RESPONDER_USER_KEY: CREDS.u_key, RESPONDER_USER_SECRET: CREDS.u_sec,
      RESPONDER_BASE_URL: `http://127.0.0.1:${mock.address().port}/main` },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise((r) => proc.stdout.once("data", r));
  globalThis.base = `http://127.0.0.1:${port}`;
  client = new Client({ name: "test", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp/${TOKEN}`)));
});

after(async () => { await client?.close(); proc?.kill(); mock?.close(); });

test("rejects bad token", async () => {
  const r = await fetch(`${base}/mcp/wrong`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(r.status, 401);
  const r2 = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(r2.status, 401);
});

test("lists tools", async () => {
  const { tools } = await client.listTools();
  assert.ok(tools.length >= 20);
  assert.equal(tools.find((t) => t.name === "send_message").annotations.destructiveHint, true);
});

test("list_lists signs request and returns data", async () => {
  const r = await client.callTool({ name: "list_lists", arguments: { list_ids: [1, 2], limit: 10 } });
  assert.ok(!r.isError, r.content[0].text);
  assert.match(r.content[0].text, /רשימה/);
  const c = calls.at(-1);
  assert.ok(c.ok);
  assert.equal(c.method, "GET");
  assert.equal(c.url, "/main/lists?limit=10&list_ids=1%2C2");
});

test("add_subscribers sends JSON string in form field", async () => {
  const subs = [{ EMAIL: "a@b.co", NAME: "דוד", PERSONAL_FIELDS: { "3": "ירושלים" } }];
  const r = await client.callTool({ name: "add_subscribers", arguments: { list_id: 5, subscribers: subs } });
  assert.ok(!r.isError, r.content[0].text);
  const c = calls.at(-1);
  assert.equal(c.method, "POST");
  assert.equal(c.url, "/main/lists/5/subscribers");
  assert.deepEqual(JSON.parse(c.form.subscribers), subs);
});

test("send_message requires confirm=true", async () => {
  const n = calls.length;
  const r = await client.callTool({ name: "send_message", arguments: { list_id: 5, message_id: 9 } });
  assert.ok(r.isError);
  assert.equal(calls.length, n);
  const ok = await client.callTool({ name: "send_message", arguments: { list_id: 5, message_id: 9, confirm: true } });
  assert.ok(!ok.isError, ok.content[0].text);
  assert.equal(calls.at(-1).url, "/main/lists/5/messages/9");
});

test("delete_views uses DELETE with views field", async () => {
  await client.callTool({ name: "delete_views", arguments: { list_id: 5, view_ids: [7], confirm: true } });
  const c = calls.at(-1);
  assert.equal(c.method, "DELETE");
  assert.deepEqual(JSON.parse(c.form.views), [{ ID: 7 }]);
});

test("update_message injects ID", async () => {
  await client.callTool({ name: "update_message", arguments: { list_id: 5, message_id: 42, info: { SUBJECT: "שלום" } } });
  assert.deepEqual(JSON.parse(calls.at(-1).form.info), { SUBJECT: "שלום", ID: "42" });
});
