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

// Budget in dollars, using the trip's own locked rates
function budgetUsd(t) {
  const b = t.budget || {};
  const r = t.rates || {};
  let usd = Number(b.USD) || 0;
  if (Number(b.ILS) && Number(r.USDILS)) usd += Number(b.ILS) / Number(r.USDILS);
  if (Number(b.EUR) && Number(r.USDEUR)) usd += Number(b.EUR) / Number(r.USDEUR);
  return Math.round(usd) || null;
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

async function createLink() {
  const t = trip();
  const status = $('feedStatus');
  if (!tripId() || !t.start || !t.end) { status.textContent = 'לנסיעה צריכים להיות תאריך התחלה וסיום.'; return; }
  status.textContent = 'יוצר קישור...';
  try {
    const r = await ownerFetch(`/trips/${tripId()}/link`, {
      method: 'POST',
      body: JSON.stringify({ name: t.destination || '', start: t.start, end: t.end, budgetUsd: budgetUsd(t) }),
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

// Each feed item is copied once. `externalImported` remembers it even if it's later deleted from the trip,
// so a deletion sticks.
async function importFeed(id) {
  if (window.state?.shared?.readOnly || !window.auth?.currentUser) return;
  const r = await ownerFetch(`/trips/${id}/feed`);
  if (r.status === 404) return;
  if (!r.ok) throw new Error(r.status);
  const { items } = await r.json();
  const t = trip();
  const done = t.externalImported || {};
  const fresh = items.filter((i) => !done[i.id] && !(t.expenses || {})[i.id]);
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
        <span class="share-badge">Feed</span>
      </header>
      <p class="muted" id="feedTrip"></p>
      <p class="muted">קישור לאדם אחד שרואה רק את ההוצאות של הנסיעה הזו ויכול להוסיף מזומן. עסקאות בכרטיס צ׳ייס נכנסות לבד, דרך סקריפט שרץ בחשבון ה־Gmail שלכם.</p>
      <div class="share-actions"><button id="feedCreate" class="btn primary" type="button">צור קישור</button></div>
      <div id="feedLinkRow" class="feed-row" hidden>
        <input id="feedLink" class="input" readonly dir="ltr" aria-label="קישור השיתוף">
        <button id="feedCopyLink" class="btn" type="button">העתק קישור</button>
      </div>
      <div id="feedScriptRow" hidden>
        <ol class="feed-steps">
          <li>פתחו את <a class="no-link-icon" href="https://script.google.com/home/projects/create" target="_blank" rel="noopener">script.google.com</a> בחשבון שמקבל את המיילים של צ׳ייס.</li>
          <li><button id="feedCopyScript" class="btn small" type="button">העתק סקריפט</button> והדביקו במקום כל התוכן של Code.gs.</li>
          <li>בהגדרות הפרויקט סמנו "Show appsscript.json", <button id="feedCopyManifest" class="btn small" type="button">העתק appsscript.json</button> והדביקו בקובץ הזה.</li>
          <li>בחרו את הפונקציה install, לחצו Run ואשרו את ההרשאות.</li>
        </ol>
      </div>
      <p id="feedStatus" class="muted feed-status" role="status"></p>
    </article>`);
  $('feedCreate').addEventListener('click', createLink);
  $('feedCopyLink').addEventListener('click', () => copy($('feedLink').value, 'הקישור הועתק. שלחו אותו לבן.'));
  $('feedCopyScript').addEventListener('click', () => copyScript().catch(() => { $('feedStatus').textContent = 'לא הצלחנו להעתיק את הסקריפט.'; }));
  $('feedCopyManifest').addEventListener('click', () => copyManifest().catch(() => { $('feedStatus').textContent = 'לא הצלחנו להעתיק.'; }));
}

document.addEventListener('flymily:trip-loaded', ({ detail }) => {
  if (linked?.tripId !== detail.id) linked = null;
  $('feedStatus') && ($('feedStatus').textContent = '');
  renderCard();
  importFeed(detail.id).catch((e) => console.warn('feed import failed', e));
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { insertCard(); renderCard(); });
else { insertCard(); renderCard(); }
