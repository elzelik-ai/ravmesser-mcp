// Remote MCP server (Streamable HTTP) - for hosting and adding as a custom connector in Claude.
import crypto from "node:crypto";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ResponderClient } from "./responder.js";
import { buildServer } from "./tools.js";

const client = ResponderClient.fromEnv();
const readOnly = /^(1|true|yes)$/i.test(process.env.RESPONDER_READ_ONLY || "");
const accessToken = process.env.MCP_ACCESS_TOKEN || "";
if (accessToken.length < 24) {
  console.error("MCP_ACCESS_TOKEN must be set to a random string of at least 24 characters (e.g. `openssl rand -hex 32`).");
  process.exit(1);
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "4mb" }));

app.get("/healthz", (_req, res) => res.json({ ok: true }));

// Token in the path (/mcp/<token>) - works with Claude custom connectors, which take only a URL -
// or as "Authorization: Bearer <token>" on /mcp.
function authorize(req, res, next) {
  const bearer = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (safeEqual(req.params.token ?? bearer, accessToken)) return next();
  res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
}

async function handle(req, res) {
  // Stateless: a fresh server + transport per request.
  const server = buildServer(client, { readOnly });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
  }
}

const notAllowed = (_req, res) =>
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });

for (const path of ["/mcp", "/mcp/:token"]) {
  app.post(path, authorize, handle);
  app.get(path, authorize, notAllowed);
  app.delete(path, authorize, notAllowed);
}

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Rav Messer MCP listening on :${port}${readOnly ? " (read-only)" : ""}`));
