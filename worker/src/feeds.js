// Trip expense feed: Chase purchases that the Gmail script finds in the trip owner's mailbox, plus cash
// expenses added on the shared page. Kept per trip in KV; the owner's FLYMILY copies them into the trip.
//
// POST /trips/:id/link      owner, signed in to FLYMILY   → { shareToken, ingestKey }   creates or updates the trip's link
// GET  /trips/:id/feed      owner, signed in to FLYMILY   → { items }
// POST /trips/:id/sync      owner, signed in to FLYMILY   → { updated, removed }   the owner's edits and deletions,
//                                                        and expenses added in the trip itself (ids trip_<expense id>)
// POST /chase               Gmail script, X-Ingest-Key     → { added }
// GET  /shared/:token       anyone with the link           → { trip, items }
// POST /shared/:token/cash  anyone with the link           → { item }

const PROJECT_ID = "travel-416ff";
const FIREBASE_KEYS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const MAX_BATCH = 100;
const MAX_ITEMS_PER_TRIP = 3000;
const CURRENCIES = ["USD", "ILS", "EUR"];
const CATEGORIES = ["טיסה", "לינה", "תקשורת", "רכב", "ביטוח בריאות", "מזון - מסעדות / סופר", "קניות", "אטרקציות", "אחר"];

// First match wins, so parking is transport before "park" can make it an attraction
const MERCHANT_CATEGORIES = [
  [/airline|airways|delta air|united air|american air|jetblue|alaska air|southwest|spirit air|frontier/i, "טיסה"],
  [/hotel|\binn\b|marriott|hilton|hyatt|airbnb|motel|resort|lodg|hostel|suites|vrbo/i, "לינה"],
  [/uber|lyft|taxi|\bcab\b|metro|\bmta\b|transit|parking|\bgas\b|shell|chevron|exxon|hertz|avis|enterprise rent|amtrak|greyhound|\bbart\b|orca/i, "רכב"],
  [/t-mobile|verizon|at&t|airalo|mint mobile/i, "תקשורת"],
  [/restaurant|cafe|coffee|starbucks|pizza|burger|grill|\bbar\b|kitchen|deli|bakery|taco|sushi|market|grocery|whole foods|trader joe|safeway|7-eleven|eats|doordash|mcdonald|chipotle|subway|dunkin|food/i, "מזון - מסעדות / סופר"],
  [/museum|ticket|zoo|tour|\bpark\b|theater|theatre|aquarium|stadium/i, "אטרקציות"],
  [/cvs|walgreens|target|walmart|amazon|apple|nike|macy|nordstrom|hudson|news|tj ?maxx|marshalls|ross|old navy|gap|h&m|zara|uniqlo|sephora|ulta|store|shop|outlet|mall|best buy|duane reade/i, "קניות"],
];

export class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
  }
}

// [body, status] for a feed route, or null when the path isn't one
export async function feedsRoute(request, url, env) {
  const path = url.pathname;
  const method = request.method;
  let m;
  if (path === "/chase" && method === "POST") return ingestChase(request, env);
  if ((m = path.match(/^\/trips\/([\w-]{1,64})\/link$/)) && method === "POST") return createLink(request, m[1], env);
  if ((m = path.match(/^\/trips\/([\w-]{1,64})\/feed$/)) && method === "GET") return ownerFeed(request, m[1], env);
  if ((m = path.match(/^\/trips\/([\w-]{1,64})\/sync$/)) && method === "POST") return syncFromOwner(request, m[1], env);
  if ((m = path.match(/^\/shared\/([a-f0-9]{32})$/)) && method === "GET") return sharedTrip(m[1], env);
  if ((m = path.match(/^\/shared\/([a-f0-9]{32})\/cash$/)) && method === "POST") return addCash(request, m[1], env);
  return null;
}

export const guessCategory = (merchant) => MERCHANT_CATEGORIES.find(([pattern]) => pattern.test(merchant))?.[1] || "אחר";

const randomHex = (bytes) => [...crypto.getRandomValues(new Uint8Array(bytes))].map(b => b.toString(16).padStart(2, "0")).join("");
const isDay = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const text = (v, max) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

async function readJson(request) {
  const raw = await request.text();
  if (raw.length > 100_000) throw new HttpError(413, "too-large");
  try { return JSON.parse(raw); } catch { throw new HttpError(400, "bad-json"); }
}

async function tripMeta(env, tripId) {
  const meta = await env.FEEDS.get(`trip:${tripId}`, "json");
  if (!meta) throw new HttpError(404, "no-link");
  return meta;
}

async function listItems(env, tripId) {
  const items = [];
  let cursor;
  do {
    const page = await env.FEEDS.list({ prefix: `item:${tripId}:`, cursor });
    page.keys.forEach(k => k.metadata && items.push(k.metadata));
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

// Kept whole in the key's metadata (under KV's 1 KB limit), so one list call returns the trip's items
const putItem = (env, tripId, item) => env.FEEDS.put(`item:${tripId}:${item.id}`, "", { metadata: item });

// ---------- Owner: a FLYMILY sign-in that owns the trip ----------

let firebaseKeys = { keys: [], fetchedAt: 0 };

async function verifyFirebaseToken(token) {
  const parts = (token || "").split(".");
  if (parts.length !== 3) throw new HttpError(401, "sign-in");
  let header, payload;
  try {
    [header, payload] = parts.slice(0, 2).map(part => JSON.parse(new TextDecoder().decode(base64url(part))));
  } catch {
    throw new HttpError(401, "sign-in");
  }
  if (Date.now() - firebaseKeys.fetchedAt > 3600_000 || !firebaseKeys.keys.some(k => k.kid === header.kid)) {
    firebaseKeys = { keys: (await (await fetch(FIREBASE_KEYS)).json()).keys || [], fetchedAt: Date.now() };
  }
  const jwk = firebaseKeys.keys.find(k => k.kid === header.kid);
  if (header.alg !== "RS256" || !jwk) throw new HttpError(401, "sign-in");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  const now = Date.now() / 1000;
  if (!valid || payload.aud !== PROJECT_ID || payload.iss !== `https://securetoken.google.com/${PROJECT_ID}` || !payload.sub || payload.exp < now) {
    throw new HttpError(401, "sign-in");
  }
  return payload;
}

function base64url(value) {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

// The trip is read from Firestore as the signed-in user, so its own security rules decide, and the owner is checked too
async function requireOwner(request, tripId) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer /, "");
  const user = await verifyFirebaseToken(token);
  const r = await fetch(`${FIRESTORE}/trips/${tripId}?mask.fieldPaths=ownerUid`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new HttpError(r.status === 404 ? 404 : 403, "not-owner");
  const doc = await r.json();
  if (doc.fields?.ownerUid?.stringValue !== user.sub) throw new HttpError(403, "not-owner");
  return user;
}

async function createLink(request, tripId, env) {
  const user = await requireOwner(request, tripId);
  const body = await readJson(request);
  if (!isDay(body.start) || !isDay(body.end) || body.end < body.start) throw new HttpError(400, "dates");
  const existing = await env.FEEDS.get(`trip:${tripId}`, "json");
  const meta = {
    ownerUid: user.sub,
    name: text(body.name, 80),
    start: body.start,
    end: body.end,
    budgetUsd: Number(body.budgetUsd) > 0 ? Math.round(Number(body.budgetUsd)) : null,
    shareToken: existing?.shareToken || randomHex(16),
    ingestKey: existing?.ingestKey || randomHex(32),
  };
  await env.FEEDS.put(`trip:${tripId}`, JSON.stringify(meta));
  await env.FEEDS.put(`share:${meta.shareToken}`, tripId);
  return [{ shareToken: meta.shareToken, ingestKey: meta.ingestKey, start: meta.start, end: meta.end }, 200];
}

async function ownerFeed(request, tripId, env) {
  await requireOwner(request, tripId);
  await tripMeta(env, tripId);
  return [{ items: await listItems(env, tripId) }, 200];
}

const OWNER_ITEM = /^trip_[\w-]{1,64}$/;

// The owner edited or deleted copied items in the trip, or added, changed or deleted expenses of the trip's
// own. A zero amount is allowed, for a purchase kept on record but not counted.
async function syncFromOwner(request, tripId, env) {
  await requireOwner(request, tripId);
  await tripMeta(env, tripId);
  const body = await readJson(request);
  const changes = Array.isArray(body.items) ? body.items.slice(0, MAX_BATCH) : [];
  const current = new Map((await listItems(env, tripId)).map(i => [i.id, i]));
  let updated = 0, removed = 0;
  for (const change of changes) {
    const ownItem = OWNER_ITEM.test(change?.id || "");
    const item = current.get(change?.id);
    if (!item && !ownItem) continue;
    if (change.deleted) {
      if (!item) continue;
      await env.FEEDS.delete(`item:${tripId}:${item.id}`);
      removed++;
      continue;
    }
    const amount = Math.round(Number(change.amount) * 100) / 100;
    // The trip's own expenses can be in any currency the trip uses
    const currencyOk = ownItem ? /^[A-Z]{3}$/.test(change.currency || "") : CURRENCIES.includes(change.currency);
    if (!(amount >= 0 && amount < 100_000) || !currencyOk) continue;
    const at = ownItem ? new Date(change.at) : null;
    if (ownItem && isNaN(at)) continue;
    await putItem(env, tripId, {
      ...(item || { id: change.id, source: "trip" }),
      ...(ownItem && { at: at.toISOString() }),
      amount,
      currency: change.currency,
      title: text(change.title, 80) || item.title,
      category: CATEGORIES.includes(change.category) ? change.category : item.category,
      note: text(change.note, 160),
    });
    updated++;
  }
  return [{ updated, removed }, 200];
}

// ---------- The Gmail script ----------

function sameKey(a, b) {
  if (typeof a !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function ingestChase(request, env) {
  const body = await readJson(request);
  const tripId = text(body.tripId, 64);
  const meta = await tripMeta(env, tripId);
  if (!sameKey(request.headers.get("X-Ingest-Key"), meta.ingestKey)) throw new HttpError(401, "key");
  const items = Array.isArray(body.items) ? body.items.slice(0, MAX_BATCH) : [];
  // A purchase counts from the first day of the trip through the day after it ends, for time zones
  const from = meta.start;
  const until = new Date(Date.parse(meta.end) + 2 * 864e5).toISOString().slice(0, 10);
  let added = 0;
  for (const raw of items) {
    const amount = Number(raw.amount);
    const at = typeof raw.at === "string" ? new Date(raw.at) : null;
    if (!/^[\w-]{1,40}$/.test(raw.id || "") || !(amount > 0 && amount < 100_000) || !at || isNaN(at)) continue;
    const day = at.toISOString().slice(0, 10);
    if (day < from || day >= until) continue;
    const title = text(raw.merchant, 80);
    await putItem(env, tripId, {
      id: `chase_${raw.id}`, source: "chase", at: at.toISOString(), amount, currency: "USD", title, category: guessCategory(title),
    });
    added++;
  }
  return [{ added }, 200];
}

// ---------- The shared page ----------

async function sharedTripId(env, token) {
  const tripId = await env.FEEDS.get(`share:${token}`);
  if (!tripId) throw new HttpError(404, "no-link");
  return tripId;
}

async function sharedTrip(token, env) {
  const tripId = await sharedTripId(env, token);
  const meta = await tripMeta(env, tripId);
  return [{ trip: { name: meta.name, start: meta.start, end: meta.end, budgetUsd: meta.budgetUsd }, items: await listItems(env, tripId) }, 200];
}

async function addCash(request, token, env) {
  const tripId = await sharedTripId(env, token);
  const meta = await tripMeta(env, tripId);
  const body = await readJson(request);
  const amount = Math.round(Number(body.amount) * 100) / 100;
  if (!(amount > 0 && amount < 100_000)) throw new HttpError(400, "amount");
  if (!CURRENCIES.includes(body.currency)) throw new HttpError(400, "currency");
  const title = text(body.title, 80);
  if (!title) throw new HttpError(400, "title");
  const category = CATEGORIES.includes(body.category) ? body.category : "אחר";
  const day = isDay(body.day) ? body.day : new Date().toISOString().slice(0, 10);
  if (day < meta.start || day > meta.end) throw new HttpError(400, "day");
  const page = await env.FEEDS.list({ prefix: `item:${tripId}:` });
  if (page.keys.length >= MAX_ITEMS_PER_TRIP) throw new HttpError(429, "full");
  // Today's cash keeps the moment it was added; an earlier day is placed at noon
  const at = day === new Date().toISOString().slice(0, 10) ? new Date().toISOString() : `${day}T12:00:00.000Z`;
  const item = { id: `cash_${randomHex(8)}`, source: "cash", at, amount, currency: body.currency, title, category };
  await putItem(env, tripId, item);
  return [{ item }, 200];
}
