// Client for the Rav Messer "Responder Live" API (V2).
// Spec: https://app.swaggerhub.com/apis/Responder/responder/V2.0
// Auth: POST /oauth/token with client_id, client_secret, user_token -> { token } (valid 14 days),
// then "Authorization: Bearer <token>" on every call.

const TOKEN_TTL_MS = 13 * 24 * 60 * 60 * 1000; // refresh a day before the documented 14-day expiry

export class ResponderClient {
  constructor({ clientId, clientSecret, userToken, baseUrl, timeoutMs } = {}) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.userToken = userToken;
    this.baseUrl = (baseUrl || "https://graph.responder.live/v2").replace(/\/+$/, "");
    this.timeoutMs = timeoutMs || 30000;
    this.token = null;
    this.tokenAt = 0;
    this.missing = [
      ["RESPONDER_CLIENT_ID", clientId],
      ["RESPONDER_CLIENT_SECRET", clientSecret],
      ["RESPONDER_USER_TOKEN", userToken],
    ].filter(([, v]) => !v).map(([k]) => k);
  }

  static fromEnv(env = process.env) {
    const c = new ResponderClient({
      clientId: env.RESPONDER_CLIENT_ID,
      clientSecret: env.RESPONDER_CLIENT_SECRET,
      userToken: env.RESPONDER_USER_TOKEN,
      baseUrl: env.RESPONDER_BASE_URL,
    });
    if (c.missing.length) console.error(`Warning: missing environment variables: ${c.missing.join(", ")}`);
    return c;
  }

  async #fetchJson(method, path, { query, body, auth = true } = {}) {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(query || {})) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (auth) headers.Authorization = `Bearer ${this.token}`;
    const res = await fetch(url, {
      method, headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { res, data, url };
  }

  async #login() {
    const { res, data } = await this.#fetchJson("POST", "/oauth/token", {
      auth: false,
      body: {
        grant_type: "client_credentials",
        scope: "*",
        client_id: /^\d+$/.test(String(this.clientId)) ? Number(this.clientId) : this.clientId,
        client_secret: this.clientSecret,
        user_token: this.userToken,
      },
    });
    if (!res.ok || !data?.token) {
      const msg = (data && (data.message || data.error)) || `HTTP ${res.status}`;
      throw new Error(`Rav Messer login failed: ${typeof msg === "string" ? msg : JSON.stringify(msg)}. Check Client ID, Client Secret and User Token, and that API access is turned on in Rav Messer settings.`);
    }
    this.token = data.token;
    this.tokenAt = Date.now();
  }

  async request(method, path, opts = {}) {
    if (this.missing.length) {
      throw new Error(`Rav Messer keys are not configured on the server. Missing: ${this.missing.join(", ")}`);
    }
    if (!this.token || Date.now() - this.tokenAt > TOKEN_TTL_MS) await this.#login();
    let r = await this.#fetchJson(method, path, opts);
    if (r.res.status === 401) { // token revoked/expired early - log in again once
      await this.#login();
      r = await this.#fetchJson(method, path, opts);
    }
    if (!r.res.ok) {
      const detail = typeof r.data === "string" ? r.data.slice(0, 500) : JSON.stringify(r.data);
      const err = new Error(`Rav Messer API ${method} ${r.url.pathname} failed: HTTP ${r.res.status} ${detail}`);
      err.status = r.res.status;
      throw err;
    }
    return r.data;
  }

  // ---- Lists
  getLists() { return this.request("GET", "/lists"); }
  getList(id) { return this.request("GET", `/lists/${id}`); }
  createList(body) { return this.request("POST", "/lists", { body }); }
  getListSubscribers(id) { return this.request("GET", `/lists/${id}/subscribers`); }
  getListFields(id) { return this.request("GET", `/lists/${id}/fields`); }
  getListPersonalFields(id) { return this.request("GET", `/lists/${id}/personal-fields`); }
  updateListSubscription(listId, subId, body) { return this.request("PUT", `/lists/${listId}/subscribers/${subId}`, { body }); }
  removeFromList(listId, subId) { return this.request("DELETE", `/lists/${listId}/subscribers/${subId}`); }

  // ---- Subscribers
  getSubscriber(identifier) { return this.request("GET", `/subscribers/identifier/${encodeURIComponent(identifier)}`); }
  searchSubscribers(listId, searchKey, offset = 0, size = 50) {
    return this.request("POST", "/subscribers/search", { query: { listId, searchKey, offset, size } });
  }
  createSubscriber(body) { return this.request("POST", "/subscribers", { body }); }
  updateSubscriber(id, body) { return this.request("PUT", `/subscribers/${id}`, { body }); }
  deleteSubscriber(id) { return this.request("DELETE", `/subscribers/${id}`); }
  unsubscribe(body) { return this.request("POST", "/req/unsubscribe", { body }); }
  resubscribe(body) { return this.request("POST", "/req/subscribe", { body }); }

  // ---- Personal fields
  getPersonalFields() { return this.request("GET", "/personal-fields"); }
  createPersonalField(body) { return this.request("POST", "/personal-fields", { body }); }
  updatePersonalField(id, body) { return this.request("PUT", `/personal-fields/${id}`, { body }); }

  // ---- Tags
  getTags() { return this.request("GET", "/tags/subscribers"); }
  getSubscriberTags(subscriberId) { return this.request("GET", `/tags/subscribers/${subscriberId}`); }
  createTag(name) { return this.request("POST", "/tags/subscribers", { body: { name } }); }
  removeTag(subscriberId, tagId) { return this.request("DELETE", `/subscribers/${subscriberId}/tags/${tagId}`); }

  // ---- Do-not-mail ("unwanted") lists
  getUnwantedEmails() { return this.request("GET", "/emails/unwanted"); }
  addUnwantedEmail(email) { return this.request("POST", "/emails/unwanted", { body: { email } }); }
  removeUnwantedEmail(email) { return this.request("POST", "/emails/unwanted/delete", { body: { email } }); }
  getUnwantedPhones() { return this.request("GET", "/phones/unwanted"); }
  addUnwantedPhone(phone) { return this.request("POST", "/phones/unwanted", { body: { phone } }); }
  removeUnwantedPhone(phone) { return this.request("POST", "/phones/unwanted/delete", { body: { phone } }); }
}
