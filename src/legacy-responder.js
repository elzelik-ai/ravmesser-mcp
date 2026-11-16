// Client for the OLD Rav Messer system (api.responder.co.il) REST API.
// Docs: https://github.com/responder/restapi
import crypto from "node:crypto";

const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");

export class LegacyResponderClient {
  constructor({ clientKey, clientSecret, userKey, userSecret, baseUrl, timeoutMs } = {}) {
    this.clientKey = clientKey;
    this.clientSecret = clientSecret;
    this.userKey = userKey;
    this.userSecret = userSecret;
    this.baseUrl = (baseUrl || "https://api.responder.co.il/main").replace(/\/+$/, "");
    this.timeoutMs = timeoutMs || 30000;
  }

  static fromEnv(env = process.env) {
    const c = new LegacyResponderClient({
      clientKey: env.OLD_RESPONDER_CLIENT_KEY,
      clientSecret: env.OLD_RESPONDER_CLIENT_SECRET,
      userKey: env.OLD_RESPONDER_USER_KEY,
      userSecret: env.OLD_RESPONDER_USER_SECRET,
      baseUrl: env.OLD_RESPONDER_BASE_URL,
    });
    const missing = [
      ["OLD_RESPONDER_CLIENT_KEY", c.clientKey],
      ["OLD_RESPONDER_CLIENT_SECRET", c.clientSecret],
      ["OLD_RESPONDER_USER_KEY", c.userKey],
      ["OLD_RESPONDER_USER_SECRET", c.userSecret],
    ].filter(([, v]) => !v).map(([k]) => k);
    c.missing = missing;
    return c;
  }

  // Authorization: c_key=..,c_secret=md5(secret+nonce),u_key=..,u_secret=md5(secret+nonce),nonce=..,timestamp=..
  authHeader() {
    const nonce = md5(`${process.hrtime.bigint()}${crypto.randomBytes(16).toString("hex")}`);
    const timestamp = Math.floor(Date.now() / 1000);
    const parts = {
      c_key: this.clientKey,
      c_secret: md5(this.clientSecret + nonce),
      u_key: this.userKey,
      u_secret: md5(this.userSecret + nonce),
      nonce,
      timestamp: String(timestamp),
    };
    return Object.entries(parts).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join(",");
  }

  /**
   * @param {string} method GET | POST | PUT | DELETE
   * @param {string} path   e.g. "/lists/123/subscribers"
   * @param {object} [opts]
   * @param {object} [opts.query] query-string params (undefined values dropped; arrays/objects JSON-encoded)
   * @param {object} [opts.form]  form fields; object/array values are JSON-stringified, as the API requires
   */
  async request(method, path, { query, form } = {}) {
    if (this.missing?.length) {
      throw new Error(`Old Rav Messer system keys are not configured on the server. Missing: ${this.missing.join(", ")}`);
    }
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(query || {})) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
    const headers = { Authorization: this.authHeader(), Accept: "application/json" };
    let body;
    if (form) {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(form)) {
        if (v === undefined) continue;
        p.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
      }
      body = p.toString();
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    }

    const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(this.timeoutMs) });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const err = new Error(`Old Rav Messer API ${method} ${url.pathname} failed: HTTP ${res.status} ${typeof data === "string" ? data.slice(0, 500) : JSON.stringify(data)}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // ---- Lists
  getLists(q) { return this.request("GET", "/lists", { query: q }); }
  createList(info) { return this.request("POST", "/lists", { form: { info } }); }
  updateList(listId, info) { return this.request("PUT", `/lists/${listId}`, { form: { info } }); }
  deleteList(listId) { return this.request("DELETE", `/lists/${listId}`); }

  // ---- Subscribers (by list)
  getSubscribers(listId, q) { return this.request("GET", `/lists/${listId}/subscribers`, { query: q }); }
  createSubscribers(listId, subscribers) { return this.request("POST", `/lists/${listId}/subscribers`, { form: { subscribers } }); }
  updateSubscribers(listId, subscribers) { return this.request("PUT", `/lists/${listId}/subscribers`, { form: { subscribers } }); }
  deleteSubscribers(listId, subscribers) { return this.request("DELETE", `/lists/${listId}/subscribers`, { form: { subscribers } }); }

  // ---- Personal fields
  getPersonalFields(listId, q) { return this.request("GET", `/lists/${listId}/personal_fields`, { query: q }); }
  createPersonalFields(listId, personal_fields) { return this.request("POST", `/lists/${listId}/personal_fields`, { form: { personal_fields } }); }
  updatePersonalFields(listId, personal_fields) { return this.request("PUT", `/lists/${listId}/personal_fields`, { form: { personal_fields } }); }
  deletePersonalFields(listId, personal_fields) { return this.request("DELETE", `/lists/${listId}/personal_fields`, { form: { personal_fields } }); }

  // ---- Views (segments / "kvutzot mishloach")
  getViews(listId, q) { return this.request("GET", `/lists/${listId}/views`, { query: q }); }
  createViews(listId, views) { return this.request("POST", `/lists/${listId}/views`, { form: { views } }); }
  updateViews(listId, views) { return this.request("PUT", `/lists/${listId}/views`, { form: { views } }); }
  deleteViews(listId, views) { return this.request("DELETE", `/lists/${listId}/views`, { form: { views } }); }
  getViewSubscribers(listId, viewId, q) { return this.request("GET", `/lists/${listId}/views/${viewId}/subscribers`, { query: q }); }
  addViewSubscribers(listId, viewId, subscribers) { return this.request("POST", `/lists/${listId}/views/${viewId}/subscribers`, { form: { subscribers } }); }
  removeViewSubscribers(listId, viewId, subscribers) { return this.request("DELETE", `/lists/${listId}/views/${viewId}/subscribers`, { form: { subscribers } }); }

  // ---- Messages
  getMessages(listId, q) { return this.request("GET", `/lists/${listId}/messages`, { query: q }); }
  getMessage(listId, messageId) { return this.request("GET", `/lists/${listId}/messages/${messageId}`); }
  createMessage(listId, info) { return this.request("POST", `/lists/${listId}/messages`, { form: { info } }); }
  updateMessage(listId, messageId, info) { return this.request("PUT", `/lists/${listId}/messages/${messageId}`, { form: { info: { ...info, ID: String(messageId) } } }); }
  testMessage(listId, messageId, data) { return this.request("POST", `/lists/${listId}/messages/${messageId}/test`, { form: { data } }); }
  sendMessage(listId, messageId) { return this.request("POST", `/lists/${listId}/messages/${messageId}`); }
  deleteMessages(listId, messages_ids) { return this.request("DELETE", `/lists/${listId}/messages`, { form: { messages_ids } }); }
}
