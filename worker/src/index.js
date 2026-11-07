// Flight-search server for FLYMILY.
// The site is static, so it can't read fares itself or hold a secret key. This Worker asks SerpApi's
// Google Flights engine for live prices, keeps only flights the airline itself sells, and returns JSON.
// Nothing an agent sells, and nothing that couldn't be confirmed as the airline's own offer, is ever returned.
//
// GET /search?to=LHR,LGW&depart=2026-12-01&return=2026-12-08&adults=2&children=0&infants=0&tricks=1
//     optional departTimes=5,11 and returnTimes=18,23: first and last takeoff hour on each direction
//     optional nearby=1 also checks three days either side of the dates (six more queries, plus up to four to confirm)
//     optional bag=1 adds one checked bag per passenger; flex=1 keeps only fares with a free change or full refund
//   → { results, tricks, insights, hiddenAgentOnly, hiddenByTerms, hiddenUnchecked, searchesLeft }
//   With &stream=1 the answer is one JSON object per line: { stage, done, total, final } while it works,
//   then { result } or { error }.
//
// GET /hotels?place=Seattle&checkIn=2026-12-01&checkOut=2026-12-05&adults=2&children=0
//     &available=1&freeCancel=1&breakfast=1&wellness=1   →   { hotels, hidden, searchesLeft }
//
// Trip expense feeds (Chase alerts and cash, shared with one person per trip) are in feeds.js.
//
// SERPAPI_KEY is a Worker secret: npx wrangler secret put SERPAPI_KEY

import { feedsRoute, HttpError } from "./feeds.js";

const ORIGIN_AIRPORT = "TLV";
const ALLOWED_ORIGINS = ["https://gavishori.github.io", "http://localhost:5500", "http://localhost:5210"];
// Airports reachable cheaply from Tel Aviv, tried as a stopover on separate tickets
const HUBS = ["ATH", "LCA", "BUD", "OTP", "SOF", "VIE", "FCO", "LTN"];
const RESULT_COUNT = 5;
const LEG_POOL = 8;          // cheapest flights kept per direction before pairing them
const MAX_LEG_REPEATS = 2;   // so the five results aren't one flight paired five ways
const MAX_VERIFY_CALLS = 10; // each airline-price check costs one SerpApi search
const MAX_VERIFY_CALLS_FLEX = 16; // most fares fail the free-change test, so more have to be checked
const MAX_TRICKS = 2;        // each trick shown costs two airline checks
const NEARBY_DAYS = [-3, -2, -1, 1, 2, 3];
const NEARBY_CHECKS = 2;     // nearby dates are only suggested once the airline's own price confirms the saving
const FREE_BREAKFAST_AMENITY = 9; // Google Hotels' amenity id
const MIN_CONNECTION_MIN = 180;
const MAX_CONNECTION_MIN = 20 * 60;

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin");
    const headers = corsHeaders(origin);
    if (request.method === "OPTIONS") return new Response(null, { headers });
    const url = new URL(request.url);

    // The Gmail script runs on Google's servers with no Origin; it proves itself with the trip's key instead
    if (url.pathname !== "/chase" && !ALLOWED_ORIGINS.includes(origin)) return reply({ error: "origin" }, 403, headers);
    try {
      const feed = await feedsRoute(request, url, env);
      if (feed) return reply(feed[0], feed[1], headers);
    } catch (e) {
      if (e instanceof HttpError) return reply({ error: e.message }, e.status, headers);
      console.error(e);
      return reply({ error: "upstream" }, 502, headers);
    }

    if (request.method !== "GET") return reply({ error: "method" }, 405, headers);
    if (!env.SERPAPI_KEY) return reply({ error: "no-key" }, 503, headers);
    try {
      if (url.pathname === "/hotels") return reply(await hotels(readHotelQuery(url), env), 200, headers);
      const query = readQuery(url);
      if (url.pathname === "/search") {
        if (url.searchParams.get("stream") === "1") return streamSearch(query, env, ctx, headers);
        return reply(await search(query, env), 200, headers);
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
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
  const hours = (name) => {
    const value = p.get(name) || "";
    if (value && !/^([01]?\d|2[0-3]),([01]?\d|2[0-3])$/.test(value)) throw new BadRequest(name);
    return value;
  };
  const count = (name, min, max) => {
    const n = parseInt(p.get(name) || String(min), 10);
    if (!(n >= min && n <= max)) throw new BadRequest(name);
    return n;
  };
  return {
    to, depart, back,
    departTimes: hours("departTimes"),
    returnTimes: hours("returnTimes"),
    adults: count("adults", 1, 9),
    children: count("children", 0, 8),
    infants: count("infants", 0, 4),
    tricks: p.get("tricks") === "1",
    nearby: p.get("nearby") === "1",
    bag: p.get("bag") === "1",
    flex: p.get("flex") === "1",
  };
}

function shiftDay(day, delta) {
  const date = new Date(day + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

// Same trip length, up to three days earlier or later. The dates' list prices only pick what to check;
// a date is suggested only if the airline's own offer beats today's best.
async function cheaperNearbyDates(q, baseline, env, report) {
  const today = new Date().toISOString().slice(0, 10);
  const days = NEARBY_DAYS.map(delta => ({ depart: shiftDay(q.depart, delta), back: q.back ? shiftDay(q.back, delta) : "" }))
    .filter(d => d.depart >= today);
  let looked = 0;
  report("dates", 0, days.length);

  const priced = await Promise.all(days.map(async (d) => {
    const params = q.back ? roundTripParams({ ...q, ...d }) : oneWayParams(ORIGIN_AIRPORT, q.to, d.depart, q, q.departTimes);
    const raw = await serp(params, env).catch(() => null);
    report("dates", ++looked, days.length);
    const flight = raw && readFlights(raw)[0];
    return flight && flight.price < baseline ? { ...d, params, flight } : null;
  }));

  const candidates = priced.filter(Boolean).sort((a, b) => a.flight.price - b.flight.price).slice(0, NEARBY_CHECKS);
  let found = null;
  for (const c of candidates) {
    const offer = await nearbyOffer(c, q, env).catch(() => null);
    if (!offer) continue;
    const total = offer.price + offer.bagCost;
    if (total < baseline) {
      found = { depart: c.depart, back: c.back, total, saving: Number.isFinite(baseline) ? baseline - total : null, seller: offer.seller };
      break;
    }
  }
  report("dates", days.length, days.length, true);
  return found;
}

async function nearbyOffer({ params, flight }, q, env) {
  if (!q.back) return flight.token ? airlineOffer(flight.token, params, q, env, 1) : null;
  const returns = await serp({ ...params, departure_token: flight.departureToken }, env);
  const homeward = readFlights(returns)[0];
  return homeward?.token ? airlineOffer(homeward.token, params, q, env, 2) : null;
}

function readHotelQuery(url) {
  const p = url.searchParams;
  const place = (p.get("place") || "").trim();
  if (!/^[\p{L}\p{N} .,'’-]{2,60}$/u.test(place)) throw new BadRequest("place");
  const checkIn = p.get("checkIn") || "";
  const checkOut = p.get("checkOut") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) throw new BadRequest("checkIn");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || checkOut <= checkIn) throw new BadRequest("checkOut");
  const adults = Number(p.get("adults") || 2);
  const children = Number(p.get("children") || 0);
  if (!(adults >= 1 && adults <= 9)) throw new BadRequest("adults");
  if (!(children >= 0 && children <= 6)) throw new BadRequest("children");
  return {
    place, checkIn, checkOut, adults, children,
    available: p.get("available") !== "0",
    freeCancel: p.get("freeCancel") === "1",
    breakfast: p.get("breakfast") === "1",
    wellness: p.get("wellness") === "1",
  };
}

// Google Hotels has no filter for these, so they're read from each hotel's own list of amenities
const WELLNESS = [[/jacuzzi|hot tub|whirlpool/i, "ג׳קוזי"], [/sauna/i, "סאונה"]];

function readHotel(h) {
  const amenities = h.amenities || [];
  const text = [h.name, ...amenities].join(" | ");
  return {
    name: h.name,
    lat: h.gps_coordinates?.latitude ?? null,
    lng: h.gps_coordinates?.longitude ?? null,
    nightly: h.rate_per_night?.extracted_lowest ?? null,
    total: h.total_rate?.extracted_lowest ?? null,
    rating: h.overall_rating ?? null,
    reviews: h.reviews ?? null,
    image: h.images?.[0]?.thumbnail ?? null,
    link: h.link || null,
    freeCancel: (h.prices || []).some(price => price.free_cancellation),
    breakfast: amenities.some(a => /breakfast/i.test(a)),
    wellness: WELLNESS.filter(([pattern]) => pattern.test(text)).map(([, label]) => label),
  };
}

async function hotels(q, env) {
  const raw = await serp({
    engine: "google_hotels", gl: "il", hl: "en", currency: "ILS",
    q: q.wellness ? `hotels with hot tub or sauna in ${q.place}` : `hotels in ${q.place}`,
    check_in_date: q.checkIn, check_out_date: q.checkOut, adults: q.adults, children: q.children,
    ...(q.children && { children_ages: Array(q.children).fill(8).join(",") }),
    ...(q.freeCancel && { free_cancellation: "true" }),
    ...(q.breakfast && { amenities: FREE_BREAKFAST_AMENITY }),
  }, env);
  // With the filter on, Google has already confirmed free cancellation for every hotel it returns
  const all = (raw.properties || []).map(readHotel).map(h => (q.freeCancel ? { ...h, freeCancel: true } : h));
  const kept = all.filter(h => (!q.available || h.nightly != null) && (!q.wellness || h.wellness.length));
  return { hotels: kept, hidden: all.length - kept.length, searchesLeft: await searchesLeft(env) };
}

function streamSearch(q, env, ctx, headers) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  // A closed page makes writes fail; the search has nothing left to tell it, so that's ignored
  const send = (message) => writer.write(encoder.encode(JSON.stringify(message) + "\n")).catch(() => {});

  ctx.waitUntil((async () => {
    try {
      const result = await search(q, env, (stage, done, total, final = false) => send({ stage, done, total, final }));
      await send({ result });
    } catch (e) {
      console.error(e);
      await send({ error: "upstream" });
    }
    await writer.close().catch(() => {});
  })());

  return new Response(readable, {
    headers: { ...headers, "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function search(q, env, report = () => {}) {
  const searches = q.back ? 3 : 1;
  let searched = 0;
  const counted = (work) => work.then(value => {
    searched++;
    report("search", searched, searches, searched === searches);
    return value;
  });

  report("search", 0, searches);
  const [out, back, roundTrip] = await Promise.all([
    counted(oneWay(ORIGIN_AIRPORT, q.to, q.depart, q.departTimes, q, env)),
    q.back ? counted(oneWay(q.to, ORIGIN_AIRPORT, q.back, q.returnTimes, q, env)) : null,
    q.back ? counted(serp(roundTripParams(q), env)) : null,
  ]);

  const candidates = q.back
    ? [...pairOneWays(out.flights, back.flights), ...roundTripCandidates(roundTrip)].sort(byPrice)
    : out.flights.map(f => ({ type: "oneway", total: f.price, legs: [f] }));

  const [{ results, hiddenAgentOnly, hiddenByTerms, hiddenUnchecked }, tricks] = await Promise.all([
    keepAirlineSold(candidates, q, env, report),
    q.tricks ? findTricks(q, out.flights, back?.flights, env, report) : [],
  ]);
  const nearby = q.nearby ? await cheaperNearbyDates(q, results[0]?.total ?? Infinity, env, report) : null;
  return {
    currency: "ILS",
    results,
    tricks,
    nearby,
    hiddenAgentOnly,
    hiddenByTerms,
    hiddenUnchecked,
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
  return {
    ...baseParams(q), type: 1, departure_id: ORIGIN_AIRPORT, arrival_id: q.to, outbound_date: q.depart, return_date: q.back,
    ...(q.departTimes && { outbound_times: q.departTimes }),
    ...(q.returnTimes && { return_times: q.returnTimes }),
  };
}

function oneWayParams(from, to, date, q, times = "") {
  return { ...baseParams(q), type: 2, departure_id: from, arrival_id: to, outbound_date: date, ...(times && { outbound_times: times }) };
}

async function oneWay(from, to, date, times, q, env) {
  const raw = await serp(oneWayParams(from, to, date, q, times), env);
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
// and keep the airline's own price. A flight stays only once its airline is confirmed as the seller.
async function keepAirlineSold(candidates, q, env, report) {
  const results = [];
  const offers = new Map();
  const maxCalls = q.flex ? MAX_VERIFY_CALLS_FLEX : MAX_VERIFY_CALLS;
  let calls = 0, checked = 0, hiddenAgentOnly = 0, hiddenByTerms = 0, hiddenUnchecked = 0;
  const countCheck = (value) => {
    report("verify", ++checked, calls);
    return value;
  };

  // The same two flights can appear as a round-trip ticket and as two one-ways; show one, preferring the single ticket
  const addResult = (result) => {
    const key = result.legs.map(legKey).join("|");
    const same = results.findIndex(r => r.legs.map(legKey).join("|") === key);
    if (same < 0) { results.push(result); return; }
    const singleTicket = result.type === "round-trip" && result.total <= results[same].total;
    if (singleTicket || result.total < results[same].total) results[same] = result;
  };

  const offerFor = (token, params, legs) => {
    if (!offers.has(token)) {
      calls++;
      offers.set(token, airlineOffer(token, params, q, env, legs).catch(() => undefined).then(countCheck));
    }
    return offers.get(token);
  };
  const legParams = (leg, i) => oneWayParams(leg.from, leg.to, i === 0 ? q.depart : q.back, q);

  report("verify", 0, 0);

  // The cheapest will almost certainly be needed, so check them together instead of one by one
  for (const c of candidates.slice(0, RESULT_COUNT)) {
    if (c.type !== "round-trip") c.legs.forEach((l, i) => { if (l.token) offerFor(l.token, legParams(l, i), 1); });
  }

  for (const candidate of candidates) {
    if (results.length >= RESULT_COUNT) break;
    if (calls >= maxCalls) { hiddenUnchecked = candidates.length - candidates.indexOf(candidate); break; }
    if (candidate.type === "round-trip") {
      calls++;
      const returns = await serp({ ...roundTripParams(q), departure_token: candidate.legs[0].departureToken }, env).catch(() => null).then(countCheck);
      const cheapest = returns && readFlights(returns)[0];
      if (!cheapest) { hiddenUnchecked++; continue; }
      candidate.legs = [candidate.legs[0], cheapest];
    }
    const checks = candidate.type === "round-trip"
      ? [[candidate.legs[1].token, roundTripParams(q), 2]]
      : candidate.legs.map((l, i) => [l.token, legParams(l, i), 1]);
    const found = await Promise.all(checks.map(([token, params, legs]) => token ? offerFor(token, params, legs) : undefined));
    if (found.includes(null)) { hiddenAgentOnly++; continue; }
    if (found.includes(undefined)) { hiddenUnchecked++; continue; }
    if (found.includes(false)) { hiddenByTerms++; continue; }
    addResult({ ...candidate, verified: true, total: offersTotal(found), offers: found });
  }
  report("verify", checked, checked, true);
  return { results: results.sort(byPrice), hiddenAgentOnly, hiddenByTerms, hiddenUnchecked };
}

const offersTotal = (offers) => offers.reduce((sum, o) => sum + o.price + o.bagCost, 0);

// Wording as Google shows it, for example "Free change" or "No refunds"
const hasFreeChangeOrRefund = (conditions) => conditions.some(c => /free (change|cancel)|no change fee|fully refundable|full refund/i.test(c));

// What one checked bag costs per passenger on one leg. Fees come without a currency and are taken to be
// in the search's currency; a range such as "99-187" counts at its top, so the total never reads low.
function readBag(bags) {
  const text = bags.join(" | ");
  if (/no checked bags/i.test(text)) return { bag: "none", fee: 0 };
  if (/1st checked bag[^|]*free/i.test(text)) return { bag: "included", fee: 0 };
  const fee = text.match(/1st checked bag:\s*[^\d|]*([\d,.]+)(?:\s*-\s*[^\d|]*([\d,.]+))?/i);
  if (fee) return { bag: "fee", fee: Number((fee[2] || fee[1]).replace(/,/g, "")) };
  return { bag: "unknown", fee: 0 };
}

// The cheapest offer sold by the airline itself that fits the search's terms. null = only agents sell it,
// false = the airline sells it but not on those terms; throws if the check failed.
async function airlineOffer(token, params, q, env, legs) {
  const raw = await serp({ ...params, booking_token: token }, env);
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
    .map(o => {
      const { bag, fee } = readBag(o.bags);
      return { ...o, bag, bagCost: q.bag ? fee * (q.adults + q.children) * legs : 0 };
    });
  if (!offers.length) return null;
  const fitting = offers
    .filter(o => (!q.flex || hasFreeChangeOrRefund(o.conditions)) && (!q.bag || o.bag !== "none"))
    .sort((a, b) => (a.price + a.bagCost) - (b.price + b.bagCost));
  return fitting[0] || false;
}

// Fly to a cheap hub on one ticket and on to the destination on another. Compared with the cheapest
// regular flight per direction; only combinations that actually save money are returned.
async function findTricks(q, outbound, inbound, env, report) {
  const destinations = q.to.split(",");
  const hubs = HUBS.filter(h => !destinations.includes(h));
  const tricks = [];
  const lookups = q.back ? 6 : 3;
  let looked = 0;
  const lookup = async (params) => {
    const flights = readFlights(await serp(params, env));
    report("tricks", ++looked, lookups);
    return flights;
  };

  report("tricks", 0, lookups);
  const outward = async () => {
    const toHub = await lookup(oneWayParams(ORIGIN_AIRPORT, hubs.join(","), q.depart, q, q.departTimes));
    await Promise.all(cheapestPerHub(toHub, l => l.to).map(async firstLeg => {
      const onward = await lookup(oneWayParams(firstLeg.to, q.to, q.depart, q));
      pushTrick(tricks, "out", firstLeg.to, firstLeg, onward, outbound);
    }));
  };
  const homeward = async () => {
    const fromHub = await lookup(oneWayParams(hubs.join(","), ORIGIN_AIRPORT, q.back, q));
    await Promise.all(cheapestPerHub(fromHub, l => l.from).map(async lastLeg => {
      const toHubBack = await lookup(oneWayParams(q.to, lastLeg.from, q.back, q, q.returnTimes));
      pushTrick(tricks, "back", lastLeg.from, null, toHubBack, inbound, lastLeg);
    }));
  };
  await Promise.all([outward(), q.back ? homeward() : null]);
  const confirmed = await airlineSoldTricks(tricks.sort((a, b) => b.saving - a.saving).slice(0, MAX_TRICKS), q, env);
  report("tricks", looked, looked, true);
  return confirmed;
}

// A trick is shown only when the airline itself sells both of its tickets
async function airlineSoldTricks(tricks, q, env) {
  const checked = await Promise.all(tricks.map(async (trick) => {
    const date = trick.direction === "out" ? q.depart : q.back;
    const offers = await Promise.all(trick.legs.map(l => l.token
      ? airlineOffer(l.token, oneWayParams(l.from, l.to, date, q), q, env, 1).catch(() => null)
      : null));
    if (offers.some(o => !o)) return null;
    const total = offersTotal(offers);
    const saving = trick.regular ? trick.regular - total : null;
    return saving === null || saving > 0 ? { ...trick, total, saving, offers } : null;
  }));
  return checked.filter(Boolean);
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
  tricks.push({ direction, hub, total, regular: cheapestRegular, saving: cheapestRegular ? cheapestRegular - total : null, legs: best });
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

// SerpApi answers a repeated query from its own free one-hour cache, so there's no second cache here.
// Workers' free plan allows 50 subrequests per call, and a Cache API read or write counts as one.
async function serp(params, env) {
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  query.set("api_key", env.SERPAPI_KEY);
  const r = await fetch("https://serpapi.com/search.json?" + query);
  const data = await r.json();
  // SerpApi reports "no flights for this search" as an error; that's an empty result, not a failure
  if (data.error && !/no results|hasn't returned any results/i.test(data.error)) throw new Error(data.error);
  return data;
}
