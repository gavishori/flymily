// Owner's side of the trip expense feed: the "מעקב הוצאות" card on the trip's share screen (a link for one
// person plus the Gmail script that sends Chase alerts), and copying new feed items into the trip's expenses
// each time the trip opens. The feed itself lives in the flymily-flights Worker (worker/src/feeds.js).

const API = 'https://flymily-flights.gavishori.workers.dev';
const SCRIPT_URL = './tools/chase-to-flymily.gs';
const MANIFEST_URL = './tools/appsscript.json';

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const ratesByDay = new Map();
let linked = null; // { tripId, shareToken, ingestKey } once the link exists for the open trip
let reloadedFor = null;

async function ownerFetch(path, options = {}) {
  const user = window.auth?.currentUser;
  if (!user) throw new Error('not signed in');
  return fetch(API + path, {
    ...options,
    credentials: 'omit',
    headers: { ...(options.headers || {}), Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
  });
}

const tripId = () => window.state?.currentTripId;
const trip = () => window.state?.current || {};

// Budget in dollars. FLYMILY keeps the same budget in all three currencies, so it's one of them, not
// their sum: dollars when set, otherwise shekels or euros at the trip's locked rate (as the trip's own bar does).
function budgetUsd(t) {
  const b = t.budget || {};
  const r = t.rates || {};
  if (Number(b.USD) > 0) return Math.round(Number(b.USD));
  if (Number(b.ILS) > 0 && Number(r.USDILS)) return Math.round(Number(b.ILS) / Number(r.USDILS));
  if (Number(b.EUR) > 0 && Number(r.USDEUR)) return Math.round(Number(b.EUR) / Number(r.USDEUR));
  return null;
}

const shareUrl = (token) => new URL(`spend.html#${token}`, location.href).href;

function renderCard() {
  const card = $('card-feed');
  if (!card) return;
  const t = trip();
  const ready = linked && linked.tripId === tripId();
  $('feedTrip').textContent = t.destination ? `לנסיעה: ${t.destination}` : '';
  $('feedCreate').textContent = ready ? 'עדכן תאריכים ותקציב' : 'צור קישור';
  $('feedLinkRow').hidden = !ready;
  $('feedScriptRow').hidden = !ready;
  if (ready) $('feedLink').value = shareUrl(linked.shareToken);
}

const tripDetails = (t) => ({ name: t.destination || '', start: t.start, end: t.end, budgetUsd: budgetUsd(t) });

// The same call as "צור קישור"; it keeps the link and only refreshes what the shared page shows
async function pushTripDetails(id, t) {
  if (!t.start || !t.end) return;
  const r = await ownerFetch(`/trips/${id}/link`, { method: 'POST', body: JSON.stringify(tripDetails(t)) });
  if (!r.ok) throw new Error(r.status);
}

async function createLink() {
  const t = trip();
  const status = $('feedStatus');
  if (!tripId() || !t.start || !t.end) { status.textContent = 'לנסיעה צריכים להיות תאריך התחלה וסיום.'; return; }
  status.textContent = 'יוצר קישור...';
  try {
    const r = await ownerFetch(`/trips/${tripId()}/link`, {
      method: 'POST',
      body: JSON.stringify(tripDetails(t)),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.status);
    linked = { tripId: tripId(), ...data };
    status.textContent = 'הקישור מוכן. הוא פותח רק את הנסיעה הזו.';
    renderCard();
  } catch (e) {
    console.error('feed link failed', e);
    status.textContent = 'לא הצלחנו ליצור קישור. ודאו שאתם מחוברים ונסו שוב.';
  }
}

async function copy(text, okMessage) {
  try {
    await navigator.clipboard.writeText(text);
    $('feedStatus').textContent = okMessage;
  } catch (_) {
    $('feedStatus').textContent = 'ההעתקה נחסמה בדפדפן. סמנו והעתיקו ידנית.';
  }
}

async function copyScript() {
  const t = trip();
  const source = await (await fetch(SCRIPT_URL, { cache: 'no-store' })).text();
  const filled = source.replace('__TRIP_ID__', linked.tripId).replace('__INGEST_KEY__', linked.ingestKey)
    .replace('__FROM__', t.start).replace('__TO__', t.end);
  await copy(filled, 'הסקריפט הועתק, עם הנסיעה והמפתח שלה בפנים. הדביקו אותו בקובץ Code.gs.');
}

async function copyManifest() {
  await copy(await (await fetch(MANIFEST_URL, { cache: 'no-store' })).text(), 'appsscript.json הועתק.');
}

// The rate on the purchase's day, so the trip's budget in shekels matches the day it was spent
async function ratesFor(day) {
  if (!ratesByDay.has(day)) {
    ratesByDay.set(day, fetch(`https://api.frankfurter.dev/v1/${day}?from=USD&to=ILS,EUR`, { credentials: 'omit' })
      .then((r) => r.json())
      .then((d) => ({ USDILS: d.rates.ILS, USDEUR: d.rates.EUR, lockedAt: new Date().toISOString() }))
      .catch(() => null));
  }
  return ratesByDay.get(day);
}

async function toExpense(item) {
  const d = new Date(item.at);
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const rates = await ratesFor(d > new Date() ? 'latest' : day);
  return {
    title: item.title,
    desc: item.source === 'chase' ? 'מצ׳ייס, אוטומטית' : 'מזומן, מדף השיתוף',
    descHtml: '',
    category: item.category,
    amount: item.amount,
    currency: item.currency,
    locationName: '',
    lat: null,
    lng: null,
    createdAt: item.at,
    dateIso: item.at,
    date: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    ...(rates && { rates }),
    source: item.source,
  };
}

const AUTO_NOTES = ['מצ׳ייס, אוטומטית', 'מזומן, מדף השיתוף'];

// What the shared page should show for an item copied into the trip, given the trip's own expense now
function ownerVersion(expense) {
  const note = String(expense.desc || '').trim();
  return {
    amount: Math.round((Number(expense.amount) || 0) * 100) / 100,
    currency: expense.currency,
    title: expense.title,
    category: expense.category,
    note: AUTO_NOTES.includes(note) ? '' : note.slice(0, 160),
  };
}

const differs = (mine, item) => mine.amount !== item.amount || mine.currency !== item.currency || mine.title !== item.title
  || mine.category !== item.category || mine.note !== (item.note || '') || (mine.at && mine.at !== item.at);

// The trip's own expenses (not copied from the feed) appear on the shared page as trip_<expense id>
function ownVersion(expense) {
  const at = new Date(expense.dateIso || expense.createdAt || '');
  if (isNaN(at)) return null;
  const firstLine = String(expense.desc || '').split('\n')[0].trim();
  const mine = ownerVersion(expense);
  return { ...mine, title: expense.title || firstLine || expense.category || 'הוצאה', at: at.toISOString() };
}

// The shared page follows the trip: edits and deletions of copied items, and the trip's own expenses
// added, changed or deleted. Only what actually differs is sent.
async function syncBack(id, expenses, imported, feedItems) {
  const feed = new Map(feedItems.map((i) => [i.id, i]));
  const changes = [];
  for (const item of feedItems) {
    if (item.source === 'trip') {
      if (!expenses[item.id.slice('trip_'.length)]) changes.push({ id: item.id, deleted: true });
      continue;
    }
    if (!imported[item.id]) continue;
    const expense = expenses[item.id];
    if (!expense) { changes.push({ id: item.id, deleted: true }); continue; }
    const mine = ownerVersion(expense);
    if (differs(mine, item)) changes.push({ id: item.id, ...mine });
  }
  for (const [expenseId, expense] of Object.entries(expenses)) {
    if (imported[expenseId] || feed.has(expenseId) || !/^[\w-]{1,64}$/.test(expenseId)) continue;
    const mine = ownVersion(expense);
    const current = feed.get(`trip_${expenseId}`);
    if (mine && (!current || differs(mine, current))) changes.push({ id: `trip_${expenseId}`, ...mine });
  }
  for (let i = 0; i < changes.length; i += 100) {
    const r = await ownerFetch(`/trips/${id}/sync`, { method: 'POST', body: JSON.stringify({ items: changes.slice(i, i + 100) }) });
    if (!r.ok) throw new Error(r.status);
  }
}

// { items, trip } for a trip with a link, or null
async function ownerFeed(id) {
  const r = await ownerFetch(`/trips/${id}/feed`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

const sameDetails = (a, b) => ['name', 'start', 'end', 'budgetUsd'].every((k) => (a?.[k] ?? null) === (b?.[k] ?? null));

// Each feed item is copied once. `externalImported` remembers it even if it's later deleted from the trip,
// so a deletion sticks.
async function importFeed(id) {
  if (window.state?.shared?.readOnly || !window.auth?.currentUser) return;
  const feed = await ownerFeed(id);
  if (!feed) return;
  const { items } = feed;
  const t = trip();
  const done = t.externalImported || {};
  if (!sameDetails(tripDetails(t), feed.trip)) await pushTripDetails(id, t).catch((e) => console.warn('trip details sync failed', e));
  await syncBack(id, t.expenses || {}, done, items).catch((e) => console.warn('feed sync failed', e));
  // The trip's own expenses are already in the trip; only Chase and cash items are copied in
  const fresh = items.filter((i) => i.source !== 'trip' && !done[i.id] && !(t.expenses || {})[i.id]);
  if (!fresh.length || tripId() !== id) return;
  const patch = {};
  for (const item of fresh) {
    patch[`expenses.${item.id}`] = await toExpense(item);
    patch[`externalImported.${item.id}`] = true;
  }
  await window.FB.updateDoc(window.FB.doc(window.db, 'trips', id), patch);
  // Show them right away; the reload finds nothing new, so this runs once per opening
  if (reloadedFor !== id && typeof window.__reloadTrip === 'function') {
    reloadedFor = id;
    await window.__reloadTrip();
  }
}

function insertCard() {
  const grid = document.querySelector('#view-share .share-grid');
  if (!grid || $('card-feed')) return;
  grid.insertAdjacentHTML('beforeend', `
    <article class="share-card" id="card-feed">
      <header class="share-card-head">
        <h3>מעקב הוצאות מצ׳ייס</h3>
        <p class="share-sub">עסקאות הכרטיס נכנסות לבד, ומי שמקבל את הקישור רואה רק את הנסיעה הזו</p>
        <span class="share-badge">Feed</span>
      </header>
      <p class="feed-trip" id="feedTrip"></p>
      <button id="feedCreate" class="btn primary feed-create" type="button">צור קישור</button>
      <div id="feedLinkRow" class="feed-row" hidden>
        <input id="feedLink" class="input" readonly dir="ltr" aria-label="קישור השיתוף">
        <button id="feedCopyLink" class="btn" type="button">העתק קישור</button>
      </div>
      <div id="feedScriptRow" hidden>
        <ol class="feed-steps">
          <li><span>פתחו את <a class="no-link-icon" href="https://script.google.com/home/projects/create" target="_blank" rel="noopener">script.google.com</a> בחשבון שמקבל את המיילים של צ׳ייס.</span></li>
          <li><span><button id="feedCopyScript" class="btn small" type="button">העתק סקריפט</button> והדביקו במקום כל התוכן של Code.gs.</span></li>
          <li><span>בהגדרות הפרויקט סמנו "Show appsscript.json", <button id="feedCopyManifest" class="btn small" type="button">העתק appsscript.json</button> והדביקו בקובץ הזה.</span></li>
          <li><span>בצד ימין, ליד "שירותים", לחצו +, בחרו Gmail API ולחצו "הוספה".</span></li>
          <li><span>בחרו את הפונקציה install, לחצו Run ואשרו את ההרשאות.</span></li>
        </ol>
      </div>
      <p id="feedStatus" class="muted feed-status" role="status"></p>
    </article>`);
  $('feedCreate').addEventListener('click', createLink);
  $('feedCopyLink').addEventListener('click', () => copy($('feedLink').value, 'הקישור הועתק. שלחו אותו לבן.'));
  $('feedCopyScript').addEventListener('click', () => copyScript().catch(() => { $('feedStatus').textContent = 'לא הצלחנו להעתיק את הסקריפט.'; }));
  $('feedCopyManifest').addEventListener('click', () => copyManifest().catch(() => { $('feedStatus').textContent = 'לא הצלחנו להעתיק.'; }));
}

// An expense was just saved in the trip; app.js doesn't reload the trip for that, so sync here
document.addEventListener('flymily:expenses-saved', async ({ detail }) => {
  if (window.state?.shared?.readOnly || !window.auth?.currentUser) return;
  try {
    const feed = await ownerFeed(detail.id);
    if (feed) await syncBack(detail.id, detail.expenses || {}, detail.externalImported || {}, feed.items);
  } catch (e) { console.warn('feed sync failed', e); }
});

// The trip's name, dates or budget were just saved
document.addEventListener('flymily:trip-details-saved', async ({ detail }) => {
  if (window.state?.shared?.readOnly || !window.auth?.currentUser) return;
  try {
    const feed = await ownerFeed(detail.id);
    const t = { ...trip(), ...detail.changes };
    if (feed && !sameDetails(tripDetails(t), feed.trip)) await pushTripDetails(detail.id, t);
  } catch (e) { console.warn('trip details sync failed', e); }
});

document.addEventListener('flymily:trip-loaded', ({ detail }) => {
  if (linked?.tripId !== detail.id) linked = null;
  $('feedStatus') && ($('feedStatus').textContent = '');
  renderCard();
  importFeed(detail.id).catch((e) => console.warn('feed import failed', e));
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { insertCard(); renderCard(); });
else { insertCard(); renderCard(); }
