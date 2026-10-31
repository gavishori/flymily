// "חפש טיסה" tab on the home screen. Prices come from the flymily-flights Worker (see worker/src/index.js);
// each result links to the airline's own site. Without the Worker the tab still offers direct links.

const FLIGHTS_API = 'https://flymily-flights.gavishori.workers.dev';
const DEFAULT_TAB_KEY = 'flymilyHomeTab';

// Cities with several airports search all of them, which often finds the cheaper low-cost one
const DESTINATIONS = [
  ['לונדון', 'London', 'LHR,LGW,STN,LTN'], ['פריז', 'Paris', 'CDG,ORY,BVA'], ['רומא', 'Rome', 'FCO,CIA'],
  ['מילאנו', 'Milan', 'MXP,LIN,BGY'], ['ונציה', 'Venice', 'VCE,TSF'], ['נאפולי', 'Naples', 'NAP'],
  ['פירנצה', 'Florence', 'FLR,PSA'], ['קטניה', 'Catania', 'CTA'], ['פלרמו', 'Palermo', 'PMO'],
  ['ברצלונה', 'Barcelona', 'BCN'], ['מדריד', 'Madrid', 'MAD'], ['מלגה', 'Malaga', 'AGP'], ['ליסבון', 'Lisbon', 'LIS'],
  ['פורטו', 'Porto', 'OPO'], ['אתונה', 'Athens', 'ATH'], ['סלוניקי', 'Thessaloniki', 'SKG'], ['לרנקה', 'Larnaca', 'LCA'],
  ['פאפוס', 'Paphos', 'PFO'], ['רודוס', 'Rhodes', 'RHO'], ['כרתים', 'Crete', 'HER,CHQ'], ['קורפו', 'Corfu', 'CFU'],
  ['בודפשט', 'Budapest', 'BUD'], ['פראג', 'Prague', 'PRG'], ['וינה', 'Vienna', 'VIE'], ['ברלין', 'Berlin', 'BER'],
  ['מינכן', 'Munich', 'MUC'], ['פרנקפורט', 'Frankfurt', 'FRA'], ['אמסטרדם', 'Amsterdam', 'AMS'], ['בריסל', 'Brussels', 'BRU,CRL'],
  ['ציריך', 'Zurich', 'ZRH'], ['ז׳נבה', 'Geneva', 'GVA'], ['ורשה', 'Warsaw', 'WAW,WMI'], ['קרקוב', 'Krakow', 'KRK'],
  ['בוקרשט', 'Bucharest', 'OTP'], ['סופיה', 'Sofia', 'SOF'], ['בורגס', 'Burgas', 'BOJ'], ['ורנה', 'Varna', 'VAR'],
  ['טירנה', 'Tirana', 'TIA'], ['טיבליסי', 'Tbilisi', 'TBS'], ['בטומי', 'Batumi', 'BUS'], ['בקו', 'Baku', 'GYD'],
  ['קופנהגן', 'Copenhagen', 'CPH'], ['סטוקהולם', 'Stockholm', 'ARN'], ['אוסלו', 'Oslo', 'OSL'], ['דבלין', 'Dublin', 'DUB'],
  ['דובאי', 'Dubai', 'DXB,DWC'], ['אבו דאבי', 'Abu Dhabi', 'AUH'], ['ניו יורק', 'New York', 'JFK,EWR'],
  ['מיאמי', 'Miami', 'MIA,FLL'], ['לוס אנג׳לס', 'Los Angeles', 'LAX'], ['טורונטו', 'Toronto', 'YYZ'],
  ['בנגקוק', 'Bangkok', 'BKK,DMK'], ['פוקט', 'Phuket', 'HKT'], ['טוקיו', 'Tokyo', 'NRT,HND'], ['גואה', 'Goa', 'GOI,GOX'],
  ['דלהי', 'Delhi', 'DEL'], ['מומבאי', 'Mumbai', 'BOM'], ['סיישל', 'Seychelles', 'SEZ'],
].map(([he, en, code]) => ({ he, en, code }));

const AIRLINES = [
  ['אל על', 'https://www.elal.com'], ['ישראייר', 'https://www.israir.co.il'], ['ארקיע', 'https://www.arkia.co.il'],
  ['Wizz Air', 'https://wizzair.com'], ['easyJet', 'https://www.easyjet.com'], ['TUS', 'https://www.tusairways.com'],
  ['Blue Bird', 'https://www.bluebirdair.com'], ['Air Haifa', 'https://www.airhaifa.com'], ['Aegean', 'https://www.aegeanair.com'],
];

const STATIC_TIPS = [
  'לפני שמשלמים: בלואו־קוסט המחיר בדרך כלל לא כולל מזוודה ובחירת מושב. השוו מחיר סופי עם הכבודה שלכם.',
  'כרטיסים נפרדים: אם טיסה אחת מתעכבת, החברה השנייה לא חייבת לכם כלום. השאירו לפחות 3 שעות, ובמזוודה רשומה עוד יותר.',
  'שעות מוקדמות, לילה ואמצע שבוע הם לרוב הזולים ביותר. הזיזו את התאריכים ביום־יומיים וחפשו שוב.',
  'כדאי להצטרף למועדון ולניוזלטר של החברות שטסות ליעד: מבצעים רבים מוצעים שם לפני שהם מופיעים במנועי חיפוש.',
];

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '₪' + Math.round(n).toLocaleString('he-IL');
const clock = (t) => (t || '').split(' ')[1] || '';
const hours = (m) => (m ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} ש׳` : '');

function findDestination(text) {
  const t = text.trim().toLowerCase();
  const match = DESTINATIONS.find((d) => d.he === text.trim() || d.en.toLowerCase() === t);
  if (match) return match;
  if (/^[a-z]{3}$/.test(t)) return { he: t.toUpperCase(), en: t.toUpperCase(), code: t.toUpperCase() };
  return null;
}

function googleFlightsUrl(q) {
  const code = q.to.split(',')[0];
  const words = `Flights from TLV to ${code} on ${q.depart}` + (q.return ? ` through ${q.return}` : ' one way');
  return `https://www.google.com/travel/flights?hl=iw&curr=ILS&q=${encodeURIComponent(words)}`;
}

function airlineLinks() {
  return AIRLINES.map(([name, url]) => `<a class="fl-airline-link" href="${url}" target="_blank" rel="noopener">${esc(name)}</a>`).join('');
}

function legRow(leg, label) {
  const stops = leg.stops?.length
    ? `${leg.stops.length} עצירות · ${leg.stops.map((s) => esc(s.airport)).join(', ')}`.replace(/^1 עצירות/, 'עצירה')
    : 'ישירה';
  return `<div class="fl-leg">
    <span class="fl-leg-label">${esc(label)}</span>
    ${leg.logo ? `<img class="fl-logo" src="${esc(leg.logo)}" alt="" loading="lazy">` : ''}
    <div class="fl-leg-route">
      <strong dir="ltr">${esc(leg.from)} ${esc(clock(leg.departs))} → ${esc(leg.to)} ${esc(clock(leg.arrives))}</strong>
      <span class="muted">${esc(leg.airlines.join(' + '))} · <bdi>${esc(leg.flightNumbers.join(', '))}</bdi> · ${esc(hours(leg.minutes))} · ${stops}</span>
    </div>
  </div>`;
}

function bookButton(offer) {
  const fields = new URLSearchParams(offer.postData || '');
  const inputs = [...fields].map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('');
  return `<form class="fl-book" action="${esc(offer.url)}" method="post" target="_blank">${inputs}
    <button class="btn primary" type="submit">להזמנה באתר ${esc(offer.seller)} · ${money(offer.price)}</button>
    ${offer.fare ? `<span class="muted">${esc(offer.fare)}</span>` : ''}
    ${offer.bags?.length ? `<span class="muted">${esc(offer.bags.join(' · '))}</span>` : ''}
  </form>`;
}

function resultCard(r, rank, q) {
  const passengers = q.adults + q.children + q.infants;
  const labels = r.legs.length > 1 ? ['הלוך', 'חזור'] : [q.return ? 'הלוך' : 'טיסה'];
  const airlines = new Set(r.legs.flatMap((l) => l.airlines));
  const badge = r.type === 'round-trip' ? 'כרטיס הלוך־חזור אחד'
    : r.type === 'two-tickets' ? (airlines.size > 1 ? 'שילוב שתי חברות' : 'שני כרטיסים') : 'כיוון אחד';
  const actions = r.verified
    ? r.offers.map(bookButton).join('')
    : `<a class="btn" href="${esc(googleFlightsUrl(q))}" target="_blank" rel="noopener">לבדיקה ב־Google Flights</a>
       <span class="muted">לא הספקנו לאמת שהחברה מוכרת במחיר הזה</span>`;
  return `<article class="fl-card">
    <div class="fl-card-head">
      <span class="fl-rank">${rank}</span>
      <div>
        <div class="fl-price">${money(r.total)}</div>
        <div class="muted">${passengers > 1 ? `סה״כ ל־${passengers} נוסעים · ` : ''}${esc(badge)}</div>
      </div>
      ${r.verified ? '<span class="fl-verified">מחיר ישיר מהחברה ✓</span>' : ''}
    </div>
    ${r.legs.map((l, i) => legRow(l, labels[i])).join('')}
    <div class="fl-actions">${actions}</div>
  </article>`;
}

function trickCard(t, q) {
  const direction = t.direction === 'out' ? 'הלוך' : 'חזור';
  const body = t.legs.map((l, i) => {
    const data = { token: l.token, from: l.from, to: l.to, depart: t.direction === 'out' ? q.depart : q.return };
    return `<div class="fl-trick-leg">${legRow(l, `קטע ${i + 1}`)}
      <button class="btn fl-trick-check" type="button" data-leg="${esc(JSON.stringify(data))}" ${l.token ? '' : 'disabled'}>מחיר באתר החברה</button>
    </div>`;
  }).join('');
  const saving = t.saving ? ` · חיסכון ${money(t.saving)}` : '';
  return `<article class="fl-card fl-trick">
    <div class="fl-card-head"><div>
      <div class="fl-price">${money(t.total)}</div>
      <div class="muted">${direction} דרך ${esc(t.hub)} בשני כרטיסים${saving}</div>
    </div></div>
    ${body}
  </article>`;
}

function recommendations(data, q) {
  const tips = [];
  const best = data.results[0];
  const level = { low: 'נמוך מהרגיל', typical: 'רגיל', high: 'גבוה מהרגיל' }[data.insights?.level];
  if (level) {
    const range = data.insights.typical;
    tips.push(`המחיר למסלול הזה עכשיו ${level}${range?.length === 2 ? ` (טווח רגיל: ${money(range[0])}–${money(range[1])})` : ''}.`);
  }
  if (best?.type === 'two-tickets' && q.return) {
    const roundTrip = data.results.find((r) => r.type === 'round-trip');
    if (roundTrip && roundTrip.total > best.total) tips.push(`שני כרטיסים נפרדים זולים ב־${money(roundTrip.total - best.total)} מכרטיס הלוך־חזור.`);
  }
  if (best?.legs.some((l) => l.stops?.some((s) => s.overnight))) tips.push('בזולה ביותר יש עצירת לילה. בדקו אם הלינה מכסה את החיסכון.');
  if (data.tricks?.length) tips.push(`נמצא טריק: טיסה עם כרטיסים נפרדים דרך ${esc(data.tricks[0].hub)} חוסכת עד ${money(data.tricks[0].saving || 0)}.`);
  if (data.hiddenAgentOnly) tips.push(`הסתרנו ${data.hiddenAgentOnly} טיסות שנמכרות רק דרך סוכנים.`);
  return [...tips, ...STATIC_TIPS];
}

function showResults(data, q, dest) {
  const box = $('flResults');
  const cards = data.results.map((r, i) => resultCard(r, i + 1, q)).join('');
  box.innerHTML = `
    <div class="fl-results-head">
      <h3>${data.results.length ? `${data.results.length} הטיסות הזולות לכיוון ${esc(dest.he)}` : `לא נמצאו טיסות ישירות מהחברות ל${esc(dest.he)}`}</h3>
      ${data.searchesLeft != null ? `<span class="muted">נותרו ${data.searchesLeft} שאילתות החודש</span>` : ''}
    </div>
    <div class="fl-cards">${cards}</div>
    ${data.tricks?.length ? `<h3>טריקים עם קונקשן</h3><div class="fl-cards">${data.tricks.map((t) => trickCard(t, q)).join('')}</div>` : ''}
    <h3>המלצות</h3>
    <ul class="fl-tips">${recommendations(data, q).map((t) => `<li>${t}</li>`).join('')}</ul>
    <h3>ישירות באתרי החברות</h3>
    <div class="fl-airlines">${airlineLinks()}</div>`;
}

function showFallback(q, message) {
  $('flResults').innerHTML = `<div class="fl-notice"><strong>${esc(message)}</strong>
      <p class="muted">בינתיים אפשר לבדוק את אותו חיפוש ב־Google Flights או ישירות אצל החברות.</p>
      <a class="btn primary" href="${esc(googleFlightsUrl(q))}" target="_blank" rel="noopener">פתח ב־Google Flights</a>
    </div>
    <div class="fl-airlines">${airlineLinks()}</div>`;
}

async function runSearch(ev) {
  ev.preventDefault();
  const dest = findDestination($('flTo').value);
  const status = $('flStatus');
  if (!dest) { status.textContent = 'לא זיהינו את היעד. בחרו מהרשימה או כתבו קוד שדה תעופה, למשל ATH.'; return; }
  const q = {
    to: dest.code, depart: $('flDepart').value, return: $('flReturn').value,
    adults: Number($('flAdults').value), children: Number($('flChildren').value), infants: Number($('flInfants').value),
  };
  if (q.return && q.return < q.depart) { status.textContent = 'תאריך החזרה לפני תאריך היציאה.'; return; }
  if (q.infants > q.adults) { status.textContent = 'כל תינוק צריך מבוגר אחד לפחות.'; return; }

  const params = new URLSearchParams({ ...q, tricks: $('flTricks').checked ? '1' : '0' });
  const button = $('flSubmit');
  button.disabled = true;
  status.textContent = 'מחפש ומאמת מחירים מול החברות. זה לוקח עד דקה...';
  $('flResults').innerHTML = '';
  try {
    const r = await fetch(`${FLIGHTS_API}/search?${params}`);
    const data = await r.json();
    if (data.error === 'no-key') showFallback(q, 'החיפוש החי עדיין לא חובר.');
    else if (!r.ok) showFallback(q, 'החיפוש נכשל כרגע.');
    else showResults(data, q, dest);
  } catch (e) {
    console.error('flight search failed', e);
    showFallback(q, 'החיפוש החי לא זמין כרגע.');
  } finally {
    button.disabled = false;
    status.textContent = '';
  }
}

async function checkTrickLeg(btn) {
  const leg = JSON.parse(btn.dataset.leg);
  const passengers = { adults: $('flAdults').value, children: $('flChildren').value, infants: $('flInfants').value };
  btn.disabled = true;
  btn.textContent = 'בודק...';
  try {
    const r = await fetch(`${FLIGHTS_API}/booking?${new URLSearchParams({ ...leg, ...passengers })}`);
    const { offer } = await r.json();
    btn.outerHTML = offer ? bookButton(offer) : '<span class="muted">נמכר רק דרך סוכנים</span>';
  } catch (e) {
    console.error('leg check failed', e);
    btn.disabled = false;
    btn.textContent = 'לא הצליח, נסו שוב';
  }
}

function setHomeTab(tab) {
  const container = document.querySelector('.container');
  const flights = tab === 'flights';
  document.body.dataset.homeTab = tab;
  // The trip map's full-screen layout would otherwise stay on behind the flight form
  if (flights && container.classList.contains('home-map-mode')) {
    container.dataset.hadMap = '1';
    container.classList.remove('home-map-mode');
  } else if (!flights && container.dataset.hadMap) {
    delete container.dataset.hadMap;
    container.classList.add('home-map-mode');
  }
  document.querySelectorAll('#homeTabs [data-home-tab]').forEach((b) => {
    const on = b.dataset.homeTab === tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  $('flightPanel').hidden = !flights;
  try { localStorage.setItem(DEFAULT_TAB_KEY, tab); } catch (_) {}
}

function init() {
  $('flDestinations').innerHTML = DESTINATIONS.map((d) => `<option value="${esc(d.he)}">${esc(d.en)}</option>`).join('');
  const today = new Date().toISOString().slice(0, 10);
  $('flDepart').min = today;
  $('flReturn').min = today;
  $('flDepart').addEventListener('change', () => { $('flReturn').min = $('flDepart').value || today; });
  $('flightForm').addEventListener('submit', runSearch);
  $('flResults').addEventListener('click', (ev) => {
    const btn = ev.target.closest('.fl-trick-check');
    if (btn) checkTrickLeg(btn);
  });
  document.querySelectorAll('#homeTabs [data-home-tab]').forEach((b) => {
    b.addEventListener('click', () => setHomeTab(b.dataset.homeTab));
  });
  let saved = 'trips';
  try { saved = localStorage.getItem(DEFAULT_TAB_KEY) || 'trips'; } catch (_) {}
  setHomeTab(saved);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
