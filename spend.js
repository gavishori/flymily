// Shared expense page for one trip, opened from a link the trip's owner sends (spend.html#<token>).
// Shows the trip's Chase purchases and cash expenses, and lets the holder add cash. Needs no sign-in;
// the token in the address is the only key, and it never reaches a server log because it's after the #.

const API = 'https://flymily-flights.gavishori.workers.dev/shared/';
const CATEGORIES = ['מזון - מסעדות / סופר', 'רכב', 'קניות', 'אטרקציות', 'לינה', 'תקשורת', 'טיסה', 'ביטוח בריאות', 'אחר'];
const REFRESH_MS = 60_000;

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const token = location.hash.slice(1);
const request = (path = '', options = {}) => fetch(API + token + path, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', ...options });

const SYMBOL = { USD: '$', ILS: '₪', EUR: '€' };
const money = (n, cur = 'USD') => `${SYMBOL[cur] || ''}${n.toLocaleString('he-IL', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const localDay = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const showDay = (day) => new Date(day + 'T12:00:00').toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });

let trip = null;
let usdPer = { USD: 1, ILS: null, EUR: null };

async function loadRates() {
  try {
    const r = await fetch('https://api.frankfurter.dev/v1/latest?from=USD&to=ILS,EUR', { credentials: 'omit', referrerPolicy: 'no-referrer' });
    const { rates } = await r.json();
    usdPer = { USD: 1, ILS: rates.ILS, EUR: rates.EUR };
  } catch (e) { console.warn('rates unavailable', e); }
}

// Totals are in dollars, since that's what the card is charged in; cash in other currencies converts at today's rate
const toUsd = (item) => (item.currency === 'USD' ? item.amount : usdPer[item.currency] ? item.amount / usdPer[item.currency] : 0);

function renderTotals(items) {
  const spent = items.reduce((sum, i) => sum + toUsd(i), 0);
  const today = items.filter((i) => localDay(i.at) === localDay(new Date().toISOString())).reduce((sum, i) => sum + toUsd(i), 0);
  const stats = [
    ['הוצאות עד עכשיו', money(spent), usdPer.ILS ? `≈ ${money(spent * usdPer.ILS, 'ILS')}` : ''],
    ['היום', money(today), `${items.filter((i) => localDay(i.at) === localDay(new Date().toISOString())).length} הוצאות`],
  ];
  if (trip.budgetUsd) {
    const left = trip.budgetUsd - spent;
    stats.push([left >= 0 ? 'נשאר בתקציב' : 'חריגה מהתקציב', money(Math.abs(left)), `מתוך ${money(trip.budgetUsd)}`]);
  }
  const pct = trip.budgetUsd ? Math.min(100, Math.round((spent / trip.budgetUsd) * 100)) : 0;
  $('totals').innerHTML = stats.map(([label, value, sub]) => `<div class="stat"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`).join('')
    + (trip.budgetUsd ? `<div class="bar${spent > trip.budgetUsd ? ' over' : ''}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>` : '');
}

function renderCategories(items) {
  const sums = new Map();
  items.forEach((i) => sums.set(i.category, (sums.get(i.category) || 0) + toUsd(i)));
  $('byCategory').innerHTML = sums.size
    ? [...sums].sort((a, b) => b[1] - a[1]).map(([cat, sum]) => `<div class="cat"><span>${esc(cat)}</span><strong>${money(sum)}</strong></div>`).join('')
    : '<p class="empty">עדיין אין הוצאות</p>';
}

function renderItems(items) {
  if (!items.length) { $('items').innerHTML = '<p class="empty">עדיין אין הוצאות. עסקאות בכרטיס צ׳ייס יופיעו כאן תוך כ־10 דקות.</p>'; return; }
  const days = new Map();
  items.forEach((i) => { const d = localDay(i.at); days.set(d, [...(days.get(d) || []), i]); });
  $('items').innerHTML = [...days].map(([day, list]) => `
    <div class="day"><span>${esc(showDay(day))}</span><span>${money(list.reduce((s, i) => s + toUsd(i), 0))}</span></div>
    ${list.map((i) => `<div class="item">
      <div class="what">
        <div class="title">${esc(i.title)}</div>
        ${i.note ? `<div class="note">${esc(i.note)}</div>` : ''}
        <div class="meta">${new Date(i.at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })} · ${esc(i.category)}
          <span class="tag${i.source === 'cash' ? ' cash' : ''}">${i.source === 'cash' ? 'מזומן' : 'צ׳ייס'}</span></div>
      </div>
      <div class="amount">${money(i.amount, i.currency)}</div>
    </div>`).join('')}`).join('');
}

async function load() {
  if (!/^[a-f0-9]{32}$/.test(token)) { showError('הקישור לא שלם. בקשו קישור חדש.'); return; }
  try {
    const r = await request();
    if (r.status === 404) { showError('הקישור לא נמצא. ייתכן שהוא בוטל.'); return; }
    if (!r.ok) throw new Error(r.status);
    const data = await r.json();
    trip = data.trip;
    $('tripName').textContent = trip.name || 'הוצאות הנסיעה';
    $('tripDates').textContent = `${showDay(trip.start)} – ${showDay(trip.end)}`;
    $('cashDay').min = trip.start;
    $('cashDay').max = trip.end;
    if (!$('cashDay').value) {
      const today = localDay(new Date().toISOString());
      $('cashDay').value = today < trip.start ? trip.start : today > trip.end ? trip.end : today;
    }
    renderTotals(data.items);
    renderCategories(data.items);
    renderItems(data.items);
  } catch (e) {
    console.error('load failed', e);
    $('cashStatus').textContent = 'אין חיבור כרגע. ננסה שוב בעוד דקה.';
  }
}

function showError(message) {
  $('tripDates').textContent = '';
  $('totals').hidden = true;
  document.querySelectorAll('main .card:not(#totals)').forEach((c) => { c.hidden = true; });
  $('totals').insertAdjacentHTML('afterend', `<section class="card"><p class="error">${esc(message)}</p></section>`);
}

function openCash(open) {
  $('cashForm').hidden = !open;
  $('cashOpen').setAttribute('aria-expanded', String(open));
  if (open) {
    $('cashStatus').textContent = '';
    $('cashTitle').focus();
  } else {
    $('cashTitle').value = '';
    $('cashAmount').value = '';
  }
}

async function addCash(ev) {
  ev.preventDefault();
  const button = $('cashSubmit');
  button.disabled = true;
  $('cashStatus').textContent = 'שומר...';
  try {
    const r = await request('/cash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: $('cashTitle').value, amount: Number($('cashAmount').value),
        currency: $('cashCurrency').value, category: $('cashCategory').value, day: $('cashDay').value,
      }),
    });
    if (!r.ok) throw new Error((await r.json()).error || r.status);
    openCash(false);
    $('cashStatus').textContent = 'נוסף ✓';
    await load();
  } catch (e) {
    console.error('cash failed', e);
    $('cashStatus').textContent = 'לא נשמר. בדקו את הסכום והיום ונסו שוב.';
  } finally {
    button.disabled = false;
  }
}

$('cashCategory').innerHTML = CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join('');
$('cashForm').addEventListener('submit', addCash);
$('cashOpen').addEventListener('click', () => openCash($('cashForm').hidden));
$('cashCancel').addEventListener('click', () => { openCash(false); $('cashStatus').textContent = ''; });
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
loadRates().then(load);
