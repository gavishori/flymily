// Flight-search server for FLYMILY.
// The site is static, so it can't read fares itself or hold a secret key. This Worker asks SerpApi's
// Google Flights engine for live prices, keeps only flights the airline itself sells, and returns JSON.
//
// GET /search?to=LHR,LGW&depart=2026-12-01&return=2026-12-08&adults=2&children=0&infants=0&tricks=1
//   → { results, tricks, insights, hiddenAgentOnly, searchesLeft }
// GET /booking?token=<booking_token>&from=ATH&to=LHR&depart=2026-12-01   →   the airline's own offer for one flight
//
// SERPAPI_KEY is a Worker secret: npx wrangler secret put SERPAPI_KEY

const ORIGIN_AIRPORT = "TLV";
const ALLOWED_ORIGINS = ["https://gavishori.github.io", "http://localhost:5500", "http://localhost:5210"];
// Airports reachable cheaply from Tel Aviv, tried as a stopover on separate tickets
const HUBS = ["ATH", "LCA", "BUD", "OTP", "SOF", "VIE", "FCO", "LTN"];
const RESULT_COUNT = 5;
const LEG_POOL = 8;          // cheapest flights kept per direction before pairing them
const MAX_LEG_REPEATS = 2;   // so the five results aren't one flight paired five ways
const MAX_VERIFY_CALLS = 10; // each airline-price check costs one SerpApi search
const MIN_CONNECTION_MIN = 180;
const MAX_CONNECTION_MIN = 20 * 60;
const CACHE_SECONDS = 3600;  // same as SerpApi's free cache window

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin");
    const headers = corsHeaders(origin);
    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "GET") return reply({ error: "method" }, 405, headers);
    if (!ALLOWED_ORIGINS.includes(origin)) return reply({ error: "origin" }, 403, headers);
    if (!env.SERPAPI_KEY) return reply({ error: "no-key" }, 503, headers);

    const url = new URL(request.url);
    try {
      const query = readQuery(url);
      if (url.pathname === "/search") return reply(await search(query, env, ctx), 200, headers);
      if (url.pathname === "/booking") {
        const token = url.searchParams.get("token");
        const from = (url.searchParams.get("from") || "").toUpperCase();
        if (!token) throw new BadRequest("token");
        if (!/^[A-Z]{3}$/.test(from)) throw new BadRequest("from");
        return reply({ offer: await airlineOffer(token, oneWayParams(from, query.to, query.depart, query), env, ctx) }, 200, headers);
      }
      return reply({ error: "not-found" }, 404, headers);
    } catch (e) {
      if (e instanceof BadRequest) return reply({ error: "bad-request", field: e.message }, 400, headers);
      console.error(e);
      return reply({ error: "upstream", detail: String(e.message || e) }, 502, headers);
    }
  },
};

class BadRequest extends Error {}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Vary": "Origin",
  };
}

function reply(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}

function readQuery(url) {
  const p = url.searchParams;
  const to = (p.get("to") || "").toUpperCase();
  if (!/^[A-Z]{3}(,[A-Z]{3})*$/.test(to)) throw new BadRequest("to");
  const depart = p.get("depart") || "";
  const back = p.get("return") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(depart)) throw new BadRequest("depart");
  if (back && (!/^\d{4}-\d{2}-\d{2}$/.test(back) || back < depart)) throw new BadRequest("return");
  const count = (name, min, max) => {
    const n = parseInt(p.get(name) || String(min), 10);
    if (!(n >= min && n <= max)) throw new BadRequest(name);
    return n;
  };
  return {
    to, depart, back,
    adults: count("adults", 1, 9),
    children: count("children", 0, 8),
    infants: count("infants", 0, 4),
    tricks: p.get("tricks") === "1",
  };
}

async function search(q, env, ctx) {
  const out = await oneWay(ORIGIN_AIRPORT, q.to, q.depart, q, env, ctx);
  const back = q.back ? await oneWay(q.to, ORIGIN_AIRPORT, q.back, q, env, ctx) : null;
  const roundTrip = q.back ? await serp(roundTripParams(q), env, ctx) : null;

  const candidates = q.back
    ? [...pairOneWays(out.flights, back.flights), ...roundTripCandidates(roundTrip)].sort(byPrice)
    : out.flights.map(f => ({ type: "oneway", total: f.price, legs: [f] }));

  const { results, hiddenAgentOnly } = await keepAirlineSold(candidates, q, env, ctx);
  const tricks = q.tricks ? await findTricks(q, out.flights, back?.flights, env, ctx) : [];
  return {
    currency: "ILS",
    results,
    tricks,
    hiddenAgentOnly,
    insights: readInsights(roundTrip || out.raw),
    searchesLeft: await searchesLeft(env),
  };
}

function baseParams(q) {
  return {
    engine: "google_flights", gl: "il", hl: "en", currency: "ILS", sort_by: 2, show_hidden: "true",
    adults: q.adults, children: q.children, infants_on_lap: q.infants,
  };
}

function roundTripParams(q) {
  return { ...baseParams(q), type: 1, departure_id: ORIGIN_AIRPORT, arrival_id: q.to, outbound_date: q.depart, return_date: q.back };
}

function oneWayParams(from, to, date, q) {
  return { ...baseParams(q), type: 2, departure_id: from, arrival_id: to, outbound_date: date };
}

async function oneWay(from, to, date, q, env, ctx) {
  const raw = await serp(oneWayParams(from, to, date, q), env, ctx);
  return { raw, flights: readFlights(raw).slice(0, LEG_POOL) };
}

function readFlights(raw) {
  return [...(raw.best_flights || []), ...(raw.other_flights || [])]
    .filter(f => Number.isFinite(f.price) && f.flights?.length)
    .map(readLeg)
    .sort((a, b) => a.price - b.price);
}

function readLeg(f) {
  const first = f.flights[0], last = f.flights[f.flights.length - 1];
  return {
    price: f.price,
    token: f.booking_token || null,
    departureToken: f.departure_token || null,
    airlines: [...new Set(f.flights.map(s => s.airline))],
    logo: f.airline_logo || first.airline_logo || null,
    flightNumbers: f.flights.map(s => s.flight_number).filter(Boolean),
    from: first.departure_airport?.id,
    to: last.arrival_airport?.id,
    departs: first.departure_airport?.time,
    arrives: last.arrival_airport?.time,
    minutes: f.total_duration,
    stops: (f.layovers || []).map(l => ({ airport: l.id, minutes: l.duration, overnight: !!l.overnight })),
  };
}

function pairOneWays(outbound, inbound) {
  const pairs = [];
  for (const a of outbound) for (const b of inbound) pairs.push({ type: "two-tickets", total: a.price + b.price, legs: [a, b] });
  return pairs.sort(byPrice).filter(limitRepeats());
}

function limitRepeats() {
  const seen = new Map();
  return c => {
    const tooMany = c.legs.some(l => (seen.get(legKey(l)) || 0) >= MAX_LEG_REPEATS);
    if (tooMany) return false;
    c.legs.forEach(l => seen.set(legKey(l), (seen.get(legKey(l)) || 0) + 1));
    return true;
  };
}

const legKey = l => `${l.flightNumbers.join("+")}@${l.departs}`;
const byPrice = (a, b) => a.total - b.total;

function roundTripCandidates(raw) {
  return readFlights(raw).filter(f => f.departureToken)
    .map(f => ({ type: "round-trip", total: f.price, legs: [f] }));
}

// Google's list price can be an agent's. Walk up from the cheapest, ask who actually sells each flight,
// and keep the airline's own price; flights only agents sell are dropped.
async function keepAirlineSold(candidates, q, env, ctx) {
  const results = [];
  const offers = new Map();
  let calls = 0, hiddenAgentOnly = 0;

  // The same two flights can appear as a round-trip ticket and as two one-ways; show one, preferring the single ticket
  const addResult = (result) => {
    const key = result.legs.map(legKey).join("|");
    const same = results.findIndex(r => r.legs.map(legKey).join("|") === key);
    if (same < 0) { results.push(result); return; }
    const singleTicket = result.type === "round-trip" && result.total <= results[same].total;
    if (singleTicket || result.total < results[same].total) results[same] = result;
  };

  const offerFor = (token, params) => {
    if (!offers.has(token)) {
      calls++;
      offers.set(token, airlineOffer(token, params, env, ctx).catch(() => undefined));
    }
    return offers.get(token);
  };
  const legParams = (leg, i) => oneWayParams(leg.from, leg.to, i === 0 ? q.depart : q.back, q);

  for (const candidate of candidates) {
    if (results.length >= RESULT_COUNT) break;
    if (calls >= MAX_VERIFY_CALLS) { addResult({ ...candidate, verified: false }); continue; }
    if (candidate.type === "round-trip") {
      calls++;
      const returns = await serp({ ...roundTripParams(q), departure_token: candidate.legs[0].departureToken }, env, ctx).catch(() => null);
      const cheapest = returns && readFlights(returns)[0];
      if (!cheapest) { addResult({ ...candidate, verified: false }); continue; }
      candidate.legs = [candidate.legs[0], cheapest];
    }
    const checks = candidate.type === "round-trip"
      ? [[candidate.legs[1].token, roundTripParams(q)]]
      : candidate.legs.map((l, i) => [l.token, legParams(l, i)]);
    const found = await Promise.all(checks.map(([token, params]) => token ? offerFor(token, params) : undefined));
    if (found.includes(null)) { hiddenAgentOnly++; continue; }
    if (found.includes(undefined)) { addResult({ ...candidate, verified: false }); continue; }
    addResult({
      ...candidate,
      verified: true,
      total: found.reduce((sum, o) => sum + o.price, 0),
      offers: found,
    });
  }
  return { results: results.sort(byPrice), hiddenAgentOnly };
}

// The cheapest offer sold by the airline itself. null = only agents sell it; throws if the check failed.
async function airlineOffer(token, params, env, ctx) {
  const raw = await serp({ ...params, booking_token: token }, env, ctx);
  const offers = (raw.booking_options || [])
    .filter(o => !o.separate_tickets && o.together?.airline && Number.isFinite(o.together.price) && o.together.booking_request)
    .map(o => ({
      seller: o.together.book_with,
      price: o.together.price,
      fare: o.together.option_title || null,
      conditions: o.together.extensions || [],
      bags: o.together.baggage_prices || raw.baggage_prices?.together || [],
      url: o.together.booking_request.url,
      postData: o.together.booking_request.post_data,
    }))
    .sort((a, b) => a.price - b.price);
  return offers[0] || null;
}

// Fly to a cheap hub on one ticket and on to the destination on another. Compared with the cheapest
// regular flight per direction; only combinations that actually save money are returned.
async function findTricks(q, outbound, inbound, env, ctx) {
  const destinations = q.to.split(",");
  const hubs = HUBS.filter(h => !destinations.includes(h));
  const tricks = [];

  const toHub = readFlights(await serp(oneWayParams(ORIGIN_AIRPORT, hubs.join(","), q.depart, q), env, ctx));
  for (const firstLeg of cheapestPerHub(toHub, l => l.to)) {
    const onward = readFlights(await serp(oneWayParams(firstLeg.to, q.to, q.depart, q), env, ctx));
    pushTrick(tricks, "out", firstLeg.to, firstLeg, onward, outbound);
  }

  if (q.back) {
    const fromHub = readFlights(await serp(oneWayParams(hubs.join(","), ORIGIN_AIRPORT, q.back, q), env, ctx));
    for (const lastLeg of cheapestPerHub(fromHub, l => l.from)) {
      const toHubBack = readFlights(await serp(oneWayParams(q.to, lastLeg.from, q.back, q), env, ctx));
      pushTrick(tricks, "back", lastLeg.from, null, toHubBack, inbound, lastLeg);
    }
  }
  return tricks.sort((a, b) => b.saving - a.saving);
}

function cheapestPerHub(flights, hubOf) {
  const best = new Map();
  for (const f of flights) if (!best.has(hubOf(f))) best.set(hubOf(f), f);
  return [...best.values()].slice(0, 2);
}

function pushTrick(tricks, direction, hub, firstLeg, secondOptions, regular, lastLeg = null) {
  const cheapestRegular = regular?.[0]?.price;
  const pairs = firstLeg
    ? secondOptions.map(s => [firstLeg, s])
    : secondOptions.map(s => [s, lastLeg]);
  const best = pairs
    .filter(([a, b]) => connectionOk(a.arrives, b.departs))
    .sort((x, y) => (x[0].price + x[1].price) - (y[0].price + y[1].price))[0];
  if (!best) return;
  const total = best[0].price + best[1].price;
  if (cheapestRegular && total >= cheapestRegular) return;
  tricks.push({ direction, hub, total, saving: cheapestRegular ? cheapestRegular - total : null, legs: best });
}

function connectionOk(arrives, departs) {
  const gap = (Date.parse(departs?.replace(" ", "T")) - Date.parse(arrives?.replace(" ", "T"))) / 60000;
  return gap >= MIN_CONNECTION_MIN && gap <= MAX_CONNECTION_MIN;
}

function readInsights(raw) {
  const i = raw?.price_insights;
  if (!i) return null;
  return { level: i.price_level || null, lowest: i.lowest_price ?? null, typical: i.typical_price_range || null };
}

async function searchesLeft(env) {
  try {
    const r = await fetch(`https://serpapi.com/account.json?api_key=${env.SERPAPI_KEY}`);
    return (await r.json()).total_searches_left ?? null;
  } catch { return null; }
}

// Cached by query: repeating a search within the hour neither waits nor spends quota
async function serp(params, env, ctx) {
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  query.sort();
  const key = new Request("https://serp-cache.internal/?" + query);
  const hit = await caches.default.match(key);
  if (hit) return hit.json();

  query.set("api_key", env.SERPAPI_KEY);
  const r = await fetch("https://serpapi.com/search.json?" + query);
  const data = await r.json();
  // SerpApi reports "no flights for this search" as an error; that's an empty result, not a failure
  if (data.error && !/no results|hasn't returned any results/i.test(data.error)) throw new Error(data.error);
  ctx.waitUntil(caches.default.put(key, new Response(JSON.stringify(data), {
    headers: { "Cache-Control": `max-age=${CACHE_SECONDS}` },
  })));
  return data;
}
