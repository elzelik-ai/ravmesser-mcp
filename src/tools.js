// MCP tool definitions for Rav Messer (Responder Live API V2).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const id = z.union([z.number().int(), z.string().regex(/^\d+$/)]).describe("Numeric ID");
const listId = id.describe("List ID (from list_lists)");
const subscriberId = id.describe("Subscriber ID (from get_subscriber / search_subscribers)");
const confirm = z.literal(true).describe("Must be true. Only set it after the user explicitly confirmed this action.");
const personalFields = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
  .describe('Personal field values keyed by field ID, e.g. {"123": "Tel Aviv"} (IDs from get_personal_fields)');
const who = z.object({
  subscriber_id: id.optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
}).refine((v) => v.subscriber_id || v.email || v.phone, "Give subscriber_id, email or phone");

const FIELD_TYPES = "type_id: 1-8 (8 = yes/no). Check existing fields with get_personal_fields for the types in use.";

const json = (data) => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const toInt = (v) => Number(v);

/**
 * @param {import("./responder.js").ResponderClient} client
 * @param {{readOnly?: boolean}} opts
 */
export function buildServer(client, { readOnly = false } = {}) {
  const server = new McpServer({ name: "ravmesser", version: "2.0.0" });

  const tool = (name, { write = false, destructive = false, ...def }, handler) => {
    if (write && readOnly) return;
    server.registerTool(name, {
      ...def,
      annotations: { readOnlyHint: !write, destructiveHint: destructive, openWorldHint: true },
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
    description: "Get all mailing lists in the Rav Messer account (id, name, subscriber count, flags).",
    inputSchema: {},
  }, () => client.getLists());

  tool("get_list", {
    title: "Get list",
    description: "Get one list's details by ID.",
    inputSchema: { list_id: listId },
  }, ({ list_id }) => client.getList(list_id));

  tool("create_list", {
    write: true, title: "Create list",
    description: "Create a new mailing list.",
    inputSchema: {
      name: z.string(),
      public_name: z.string().optional().describe("Name shown to subscribers"),
      sender_id: id.optional(),
      is_double_opt_in: z.boolean().optional(),
      is_hidden: z.boolean().optional(),
      tags: z.array(id).optional().describe("Tag IDs"),
    },
  }, ({ tags, sender_id, ...rest }) =>
    client.createList({ ...rest, ...(sender_id ? { sender_id: toInt(sender_id) } : {}), ...(tags ? { tags: tags.map(toInt) } : {}) }));

  tool("get_list_subscribers", {
    title: "Get list subscribers",
    description: "Get subscriptions in a list (subscriber_id, active/inactive/pending, join dates). The API returns the whole list; this tool pages it with limit/offset. Use get_subscriber for names/emails.",
    inputSchema: {
      list_id: listId,
      limit: z.number().int().min(1).max(1000).optional().describe("Default 100"),
      offset: z.number().int().min(0).optional(),
    },
  }, async ({ list_id, limit = 100, offset = 0 }) => {
    const r = await client.getListSubscribers(list_id);
    const data = Array.isArray(r?.data) ? r.data : [];
    return { total: r?.total ?? data.length, offset, returned: Math.min(limit, Math.max(0, data.length - offset)), data: data.slice(offset, offset + limit) };
  });

  tool("get_list_fields", {
    title: "Get list fields",
    description: "Get the fields available in a list, including list-specific and account-wide personal fields.",
    inputSchema: { list_id: listId },
  }, ({ list_id }) => client.getListFields(list_id));

  // ---------------- Subscribers
  tool("get_subscriber", {
    title: "Get subscriber",
    description: "Look up one subscriber by email, phone or subscriber ID: details, lists, personal fields.",
    inputSchema: { identifier: z.string().describe("Email, phone or subscriber ID") },
  }, ({ identifier }) => client.getSubscriber(identifier));

  tool("search_subscribers", {
    title: "Search subscribers in list",
    description: "Search subscribers in a list by keyword (name, email, phone).",
    inputSchema: {
      list_id: listId,
      search: z.string(),
      offset: z.number().int().min(0).optional(),
      size: z.number().int().min(1).max(500).optional().describe("Default 50"),
    },
  }, ({ list_id, search, offset, size }) => client.searchSubscribers(list_id, search, offset ?? 0, size ?? 50));

  tool("add_subscriber", {
    write: true, title: "Add subscriber",
    description: "Add a subscriber to one or more lists. If the email already exists, set override/rejoin to update and re-activate.",
    inputSchema: {
      email: z.string(),
      list_ids: z.array(id).min(1),
      first: z.string().optional(),
      last: z.string().optional(),
      phone: z.string().optional(),
      personal_fields: personalFields.optional(),
      tags: z.array(id).optional().describe("Existing tag IDs"),
      tags_names: z.array(z.string()).optional().describe("Tag names (created if missing)"),
      override: z.boolean().optional().describe("Overwrite details of an existing subscriber"),
      rejoin: z.boolean().optional().describe("Re-activate if previously removed from the list"),
      disable_notification: z.boolean().optional().describe("Don't email the account owner about the new subscriber"),
    },
  }, ({ list_ids, tags, ...rest }) =>
    client.createSubscriber({ ...rest, list_ids: list_ids.map(toInt), ...(tags ? { tags: tags.map(toInt) } : {}) }));

  tool("update_subscriber", {
    write: true, title: "Update subscriber",
    description: "Update a subscriber's details (name, email, phone, personal fields, add tags by name).",
    inputSchema: {
      subscriber_id: subscriberId,
      first: z.string().optional(),
      last: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      personal_fields: personalFields.optional(),
      tags_names: z.array(z.string()).optional(),
    },
  }, ({ subscriber_id, ...body }) => client.updateSubscriber(subscriber_id, body));

  tool("set_list_subscription", {
    write: true, title: "Activate / deactivate in list",
    description: "Change a subscriber's status inside one list (inactive/pending).",
    inputSchema: {
      list_id: listId, subscriber_id: subscriberId,
      inactive: z.boolean().optional(),
      pending: z.boolean().optional(),
    },
  }, ({ list_id, subscriber_id, ...body }) => client.updateListSubscription(list_id, subscriber_id, body));

  tool("unsubscribe", {
    write: true, title: "Unsubscribe",
    description: "Mark a subscriber as unsubscribed (stops mailing; keeps history). Prefer this over deleting.",
    inputSchema: { who },
  }, ({ who: w }) => client.unsubscribe(w.subscriber_id ? { subscriber_id: toInt(w.subscriber_id) } : w.email ? { email: w.email } : { phone: w.phone }));

  tool("resubscribe", {
    write: true, title: "Re-subscribe",
    description: "Mark a previously unsubscribed subscriber as subscribed again. Only with the person's consent.",
    inputSchema: { who },
  }, ({ who: w }) => client.resubscribe(w.subscriber_id ? { subscriber_id: toInt(w.subscriber_id) } : w.email ? { email: w.email } : { phone: w.phone }));

  tool("remove_from_list", {
    write: true, destructive: true, title: "Remove from list",
    description: "Remove a subscriber from one list (stays in the account). Confirm with the user first.",
    inputSchema: { list_id: listId, subscriber_id: subscriberId, confirm },
  }, ({ list_id, subscriber_id }) => client.removeFromList(list_id, subscriber_id));

  tool("delete_subscriber", {
    write: true, destructive: true, title: "Delete subscriber",
    description: "Permanently delete a subscriber from the whole account, including history. Irreversible - prefer unsubscribe. Confirm with the user first.",
    inputSchema: { subscriber_id: subscriberId, confirm },
  }, ({ subscriber_id }) => client.deleteSubscriber(subscriber_id));

  // ---------------- Personal fields
  tool("get_personal_fields", {
    title: "Get personal fields",
    description: "Get custom (personal) fields - for the whole account, or for one list if list_id is given.",
    inputSchema: { list_id: listId.optional() },
  }, ({ list_id }) => (list_id ? client.getListPersonalFields(list_id) : client.getPersonalFields()));

  tool("create_personal_field", {
    write: true, title: "Create personal field",
    description: `Create a custom field in the account, or in one list if list_id is given. ${FIELD_TYPES}`,
    inputSchema: {
      name: z.string(),
      type_id: z.number().int().min(1).max(8),
      list_id: listId.optional(),
      default: z.string().optional(),
      hidden: z.union([z.literal(0), z.literal(1)]).optional(),
      options: z.array(z.object({ name: z.string(), is_default: z.union([z.literal(0), z.literal(1)]).optional() })).optional()
        .describe("Choices, for selection-type fields"),
    },
  }, ({ list_id, ...body }) => client.createPersonalField({ ...body, ...(list_id ? { list_id: toInt(list_id) } : {}) }));

  tool("update_personal_field", {
    write: true, title: "Update personal field",
    description: `Update a custom field. name and type_id are required by the API (send the current values if unchanged). ${FIELD_TYPES}`,
    inputSchema: {
      field_id: id,
      name: z.string(),
      type_id: z.number().int().min(1).max(8),
      default: z.string().optional(),
      hidden: z.union([z.literal(0), z.literal(1)]).optional(),
      options: z.array(z.object({ id: id.optional(), name: z.string(), is_default: z.union([z.literal(0), z.literal(1)]).optional() })).optional(),
    },
  }, ({ field_id, ...body }) => client.updatePersonalField(field_id, body));

  // ---------------- Tags
  tool("list_tags", {
    title: "List tags",
    description: "Get all subscriber tags in the account.",
    inputSchema: {},
  }, () => client.getTags());

  tool("get_subscriber_tags", {
    title: "Get subscriber's tags",
    description: "Get the tags of one subscriber.",
    inputSchema: { subscriber_id: subscriberId },
  }, ({ subscriber_id }) => client.getSubscriberTags(subscriber_id));

  tool("create_tag", {
    write: true, title: "Create tag",
    description: "Create a new subscriber tag. To tag a subscriber, use update_subscriber with tags_names.",
    inputSchema: { name: z.string() },
  }, ({ name }) => client.createTag(name));

  tool("remove_tag", {
    write: true, title: "Remove tag from subscriber",
    description: "Remove a tag from a subscriber.",
    inputSchema: { subscriber_id: subscriberId, tag_id: id },
  }, ({ subscriber_id, tag_id }) => client.removeTag(subscriber_id, tag_id));

  // ---------------- Do-not-mail lists
  tool("list_blocked", {
    title: "List blocked emails / phones",
    description: "Get the account's do-not-contact list (unwanted emails or phones).",
    inputSchema: { kind: z.enum(["email", "phone"]) },
  }, ({ kind }) => (kind === "email" ? client.getUnwantedEmails() : client.getUnwantedPhones()));

  tool("block_contact", {
    write: true, title: "Block email / phone",
    description: "Add an email or phone to the do-not-contact list - it will never be mailed/texted.",
    inputSchema: { email: z.string().optional(), phone: z.string().optional() },
  }, ({ email, phone }) => {
    if (!email && !phone) throw new Error("Give email or phone");
    return email ? client.addUnwantedEmail(email) : client.addUnwantedPhone(phone);
  });

  tool("unblock_contact", {
    write: true, title: "Unblock email / phone",
    description: "Remove an email or phone from the do-not-contact list. Only with the person's consent.",
    inputSchema: { email: z.string().optional(), phone: z.string().optional() },
  }, ({ email, phone }) => {
    if (!email && !phone) throw new Error("Give email or phone");
    return email ? client.removeUnwantedEmail(email) : client.removeUnwantedPhone(phone);
  });

  return server;
}
