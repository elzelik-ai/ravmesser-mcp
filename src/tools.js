// MCP tool definitions for Rav Messer (Responder).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const id = z.union([z.number().int(), z.string().regex(/^\d+$/)]).describe("Numeric ID");
const listId = id.describe("List ID (from list_lists)");
const limit = z.number().int().min(1).max(500).optional().describe("Max results (1-500, API default 500)");
const offset = z.number().int().min(0).optional().describe("Start position for paging");
const personalFields = z.record(z.string(), z.string())
  .describe('Personal field values keyed by field ID, e.g. {"123": "Tel Aviv"} (IDs from get_personal_fields)');
const confirm = z.literal(true).describe("Must be true. Only set it after the user explicitly confirmed this action.");

const subscriberIn = z.object({
  EMAIL: z.string().optional(),
  NAME: z.string().optional(),
  PHONE: z.string().optional().describe("Israeli phone; prefixes 056/059 are rejected by the API"),
  DAY: z.number().int().optional().describe("Seniority day in the list (0 = start of the sequence)"),
  SEND_0: z.union([z.literal(0), z.literal(1)]).optional().describe("Send the list's first message (default 1)"),
  PHONE_IGNORE: z.boolean().optional().describe("Create even if phone is invalid (phone is dropped)"),
  NOTIFY: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional().describe("Notify list owner: 0 no, 1 yes, 2 per list settings"),
  PERSONAL_FIELDS: personalFields.optional(),
}).passthrough();

const idOrEmail = z.union([
  z.object({ ID: id }),
  z.object({ EMAIL: z.string() }),
]);

const listInfo = z.object({
  DESCRIPTION: z.string().optional().describe("List display name"),
  NAME: z.string().optional().describe("Internal English name"),
  SENDER_NAME: z.string().optional(),
  SENDER_EMAIL: z.string().optional(),
  SENDER_ADDRESS: z.string().optional(),
  REMOVE_TITLE: z.string().optional(),
  SITE_NAME: z.string().optional(),
  SITE_URL: z.string().optional(),
  LOGO: z.string().optional(),
  EMAIL_NOTIFY: z.array(z.string()).optional().describe("Owner notification emails (replaces existing on update)"),
  AUTOMATION: z.array(id).optional().describe("List IDs for automation (replaces existing on update)"),
}).passthrough();

const messageInfo = z.object({
  TYPE: z.enum(["0", "1", "2"]).optional().describe('"1" one-off message, "0" sequence (autoresponder), "2" date-based'),
  BODY_TYPE: z.string().optional().describe('"0" = regular HTML editor'),
  SUBJECT: z.string().optional(),
  BODY: z.string().optional().describe("HTML body"),
  FILTER: z.string().optional().describe("View (segment) ID to send to"),
  LANGUAGE: z.enum(["hebrew", "english"]).optional(),
  CHECK_LINKS: z.enum(["0", "1"]).optional(),
}).passthrough();

const json = (data) => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });

/**
 * @param {import("./responder.js").ResponderClient} client
 * @param {{readOnly?: boolean}} opts
 */
export function buildServer(client, { readOnly = false } = {}) {
  const server = new McpServer({ name: "ravmesser", version: "1.0.0" });

  const tool = (name, { write = false, destructive = false, ...def }, handler) => {
    if (write && readOnly) return;
    server.registerTool(name, {
      ...def,
      annotations: { readOnlyHint: !write, destructiveHint: destructive, openWorldHint: true, ...(def.annotations || {}) },
    }, async (args) => {
      try {
        return json(await handler(args));
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: String(e?.message || e) }] };
      }
    });
  };

  // ---------------- Lists
  tool("list_lists", {
    title: "List mailing lists",
    description: "Get the account's mailing lists (ID, name, sender details). Use list_ids to fetch specific ones.",
    inputSchema: { list_ids: z.array(id).optional(), limit, offset },
  }, ({ list_ids, ...q }) => client.getLists({ ...q, list_ids: list_ids?.join(",") }));

  tool("create_list", {
    write: true, title: "Create list",
    description: "Create a new mailing list.",
    inputSchema: { info: listInfo },
  }, ({ info }) => client.createList(info));

  tool("update_list", {
    write: true, title: "Update list",
    description: "Update list settings. Note: EMAIL_NOTIFY / AUTOMATION replace the existing values.",
    inputSchema: { list_id: listId, info: listInfo },
  }, ({ list_id, info }) => client.updateList(list_id, info));

  tool("delete_list", {
    write: true, destructive: true, title: "Delete list",
    description: "Permanently delete a list and its subscribers. Irreversible - confirm with the user first.",
    inputSchema: { list_id: listId, confirm },
  }, ({ list_id }) => client.deleteList(list_id));

  // ---------------- Subscribers
  tool("get_subscribers", {
    title: "Get subscribers",
    description: "Get subscribers of a list. Filter by a single subscriber (ID or email) or by join date. STATUS 1 = active; STATUS_NUM explains inactivity (0 automation, 1 removed/unsubscribed, 2 bounced).",
    inputSchema: {
      list_id: listId, limit, offset,
      dir: z.union([z.literal(0), z.literal(1)]).optional().describe("0 oldest first, 1 newest first"),
      subscriber_id: z.string().optional().describe("Subscriber ID or email"),
      min_join_date: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/).optional().describe('"YYYY-MM-DD HH:mm"'),
      max_join_date: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/).optional().describe('"YYYY-MM-DD HH:mm"'),
    },
  }, ({ list_id, ...q }) => client.getSubscribers(list_id, q));

  tool("add_subscribers", {
    write: true, title: "Add subscribers",
    description: "Add one or more subscribers to a list (needs EMAIL and/or PHONE). Response lists created, existing, invalid and banned entries.",
    inputSchema: { list_id: listId, subscribers: z.array(subscriberIn).min(1).max(500) },
  }, ({ list_id, subscribers }) => client.createSubscribers(list_id, subscribers));

  tool("update_subscribers", {
    write: true, title: "Update subscribers",
    description: "Update existing subscribers. Each item needs IDENTIFIER (subscriber ID or current email) plus fields to change.",
    inputSchema: {
      list_id: listId,
      subscribers: z.array(subscriberIn.extend({ IDENTIFIER: z.union([id, z.string()]) })).min(1).max(500),
    },
  }, ({ list_id, subscribers }) => client.updateSubscribers(list_id, subscribers));

  tool("delete_subscribers", {
    write: true, destructive: true, title: "Delete subscribers",
    description: "Delete subscribers from a list by ID or email. This erases their history; to stop mailing someone, prefer update with removal in the Rav Messer UI. Confirm with the user first.",
    inputSchema: { list_id: listId, subscribers: z.array(idOrEmail).min(1).max(500), confirm },
  }, ({ list_id, subscribers }) => client.deleteSubscribers(list_id, subscribers));

  // ---------------- Personal fields
  tool("get_personal_fields", {
    title: "Get personal fields",
    description: "Get a list's custom (personal) fields: ID, NAME, TYPE, default value.",
    inputSchema: { list_id: listId, limit, offset },
  }, ({ list_id, ...q }) => client.getPersonalFields(list_id, q));

  tool("create_personal_fields", {
    write: true, title: "Create personal fields",
    description: "Create custom fields in a list. TYPE 0 = text, 1 = date.",
    inputSchema: {
      list_id: listId,
      personal_fields: z.array(z.object({
        NAME: z.string(),
        TYPE: z.number().int().optional(),
        DEFAULT_VALUE: z.string().optional(),
        DIR: z.enum(["rtl", "ltr"]).optional(),
      }).passthrough()).min(1),
    },
  }, ({ list_id, personal_fields }) => client.createPersonalFields(list_id, personal_fields));

  tool("update_personal_fields", {
    write: true, title: "Update personal fields",
    description: "Update custom fields by ID.",
    inputSchema: {
      list_id: listId,
      personal_fields: z.array(z.object({
        ID: id, NAME: z.string().optional(), DEFAULT_VALUE: z.string().optional(), DIR: z.enum(["rtl", "ltr"]).optional(),
      }).passthrough()).min(1),
    },
  }, ({ list_id, personal_fields }) => client.updatePersonalFields(list_id, personal_fields));

  tool("delete_personal_fields", {
    write: true, destructive: true, title: "Delete personal fields",
    description: "Delete custom fields (and their stored values). Confirm with the user first.",
    inputSchema: { list_id: listId, field_ids: z.array(id).min(1), confirm },
  }, ({ list_id, field_ids }) => client.deletePersonalFields(list_id, field_ids.map((ID) => ({ ID }))));

  // ---------------- Views (segments)
  tool("get_views", {
    title: "Get views (segments)",
    description: "Get a list's views - the sending groups / segments (קבוצות משלוח).",
    inputSchema: { list_id: listId, limit, offset },
  }, ({ list_id, ...q }) => client.getViews(list_id, q));

  tool("create_views", {
    write: true, title: "Create views",
    description: "Create views (segments) in a list by name.",
    inputSchema: { list_id: listId, names: z.array(z.string()).min(1) },
  }, ({ list_id, names }) => client.createViews(list_id, names.map((NAME) => ({ NAME }))));

  tool("rename_views", {
    write: true, title: "Rename views",
    description: "Rename views by ID.",
    inputSchema: { list_id: listId, views: z.array(z.object({ ID: id, NAME: z.string() })).min(1) },
  }, ({ list_id, views }) => client.updateViews(list_id, views));

  tool("delete_views", {
    write: true, destructive: true, title: "Delete views",
    description: "Delete views (segments). Subscribers stay in the list. Confirm with the user first.",
    inputSchema: { list_id: listId, view_ids: z.array(id).min(1), confirm },
  }, ({ list_id, view_ids }) => client.deleteViews(list_id, view_ids.map((ID) => ({ ID }))));

  tool("get_view_subscribers", {
    title: "Get view subscribers",
    description: "Get subscriber IDs in a view (segment), with the date they were added.",
    inputSchema: { list_id: listId, view_id: id, limit, offset },
  }, ({ list_id, view_id, ...q }) => client.getViewSubscribers(list_id, view_id, q));

  tool("add_view_subscribers", {
    write: true, title: "Add subscribers to view",
    description: "Add existing list subscribers (by subscriber ID) to a view.",
    inputSchema: { list_id: listId, view_id: id, subscriber_ids: z.array(id).min(1).max(500) },
  }, ({ list_id, view_id, subscriber_ids }) =>
    client.addViewSubscribers(list_id, view_id, subscriber_ids.map((ID) => ({ ID: String(ID) }))));

  tool("remove_view_subscribers", {
    write: true, title: "Remove subscribers from view",
    description: "Remove subscribers from a view (they stay in the list).",
    inputSchema: { list_id: listId, view_id: id, subscribers: z.array(idOrEmail).min(1).max(500) },
  }, ({ list_id, view_id, subscribers }) => client.removeViewSubscribers(list_id, view_id, subscribers));

  // ---------------- Messages
  tool("get_messages", {
    title: "Get messages",
    description: "Get messages of a list, or one message with message_id. Includes stats (POSTED, OPENED, LINKED, REMOVED...). Message TYPE: 0 sequence, 1 one-off, 2 date-based.",
    inputSchema: {
      list_id: listId, message_id: id.optional(), limit, offset,
      types: z.array(z.enum(["0", "1", "2", "3", "4"])).optional(),
    },
  }, ({ list_id, message_id, types, ...q }) =>
    message_id ? client.getMessage(list_id, message_id) : client.getMessages(list_id, { ...q, type: types }));

  tool("create_message", {
    write: true, title: "Create message (draft)",
    description: "Create a message in a list. This does NOT send it - use test_message, then send_message.",
    inputSchema: { list_id: listId, info: messageInfo.extend({ SUBJECT: z.string(), BODY: z.string() }) },
  }, ({ list_id, info }) => client.createMessage(list_id, { TYPE: "1", BODY_TYPE: "0", ...info }));

  tool("update_message", {
    write: true, title: "Update message",
    description: "Update an existing message's subject, body, segment etc.",
    inputSchema: { list_id: listId, message_id: id, info: messageInfo },
  }, ({ list_id, message_id, info }) => client.updateMessage(list_id, message_id, info));

  tool("test_message", {
    write: true, title: "Send test message",
    description: "Send a test copy of a message to one email address.",
    inputSchema: {
      list_id: listId, message_id: id,
      email: z.string(), name: z.string().optional(), phone: z.string().optional(),
      personal_fields: personalFields.optional(),
    },
  }, ({ list_id, message_id, personal_fields, ...rest }) =>
    client.testMessage(list_id, message_id, { ...rest, ...(personal_fields ? { personal_fields: [personal_fields] } : {}) }));

  tool("send_message", {
    write: true, destructive: true, title: "Send message to list",
    description: "SEND a message to the list's subscribers (or its FILTER view). Cannot be undone. Show the user the list, subject and audience and get explicit confirmation first.",
    inputSchema: { list_id: listId, message_id: id, confirm },
  }, ({ list_id, message_id }) => client.sendMessage(list_id, message_id));

  tool("delete_messages", {
    write: true, destructive: true, title: "Delete messages",
    description: "Delete messages from a list. Confirm with the user first.",
    inputSchema: { list_id: listId, message_ids: z.array(id).min(1), confirm },
  }, ({ list_id, message_ids }) => client.deleteMessages(list_id, message_ids.map(String)));

  return server;
}
