// Local MCP server over stdio - for Claude Desktop / Claude Code on your own computer.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ResponderClient } from "./responder.js";
import { buildServer } from "./tools.js";

const readOnly = /^(1|true|yes)$/i.test(process.env.RESPONDER_READ_ONLY || "");
const server = buildServer(ResponderClient.fromEnv(), { readOnly });
await server.connect(new StdioServerTransport());
