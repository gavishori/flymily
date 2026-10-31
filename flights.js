// "חפש טיסה" tab on the home screen. Prices come from the flymily-flights Worker (see worker/src/index.js);
// each result links to the airline's own site. Without the Worker the tab still offers direct links.

const FLIGHTS_API = 'https://flymily-flights.gavishori.workers.dev';
const DEFAULT_TAB_KEY = 'flymilyHomeTab';
const MAX_SUGGESTIONS = 7;
const STAGES = { search: 'מחפש טיסות', verify: 'מאמת מחירים מול החברות', tricks: 'בודק קונקשנים', ready: 'מסכם תוצאות' };

// Cities with several airports search all of them, which often finds the cheaper low-cost one
const DESTINATIONS = [
  ['לונדון', 'London', 'LHR,LGW,STN,LTN', 'בריטניה'], ['מנצ׳סטר', 'Manchester', 'MAN', 'בריטניה'], ['דבלין', 'Dublin', 'DUB', 'אירלנד'],
  ['פריז', 'Paris', 'CDG,ORY,BVA', 'צרפת'], ['ניס', 'Nice', 'NCE', 'צרפת'], ['ליון', 'Lyon', 'LYS', 'צרפת'], ['מרסיי', 'Marseille', 'MRS', 'צרפת'],
  ['רומא', 'Rome', 'FCO,CIA', 'איטליה'], ['מילאנו', 'Milan', 'MXP,LIN,BGY', 'איטליה'], ['ונציה', 'Venice', 'VCE,TSF', 'איטליה'],
  ['נאפולי', 'Naples', 'NAP', 'איטליה'], ['פירנצה', 'Florence', 'FLR,PSA', 'איטליה'], ['קטניה', 'Catania', 'CTA', 'איטליה'], ['פלרמו', 'Palermo', 'PMO', 'איטליה'],
  ['ברצלונה', 'Barcelona', 'BCN', 'ספרד'], ['מדריד', 'Madrid', 'MAD', 'ספרד'], ['מלגה', 'Malaga', 'AGP', 'ספרד'], ['ליסבון', 'Lisbon', 'LIS', 'פורטוגל'], ['פורטו', 'Porto', 'OPO', 'פורטוגל'],
  ['אתונה', 'Athens', 'ATH', 'יוון'], ['סלוניקי', 'Thessaloniki', 'SKG', 'יוון'], ['רודוס', 'Rhodes', 'RHO', 'יוון'], ['כרתים', 'Crete', 'HER,CHQ', 'יוון'], ['קורפו', 'Corfu', 'CFU', 'יוון'],
  ['לרנקה', 'Larnaca', 'LCA', 'קפריסין'], ['פאפוס', 'Paphos', 'PFO', 'קפריסין'],
  ['בודפשט', 'Budapest', 'BUD', 'הונגריה'], ['פראג', 'Prague', 'PRG', 'צ׳כיה'], ['וינה', 'Vienna', 'VIE', 'אוסטריה'],
  ['ברלין', 'Berlin', 'BER', 'גרמניה'], ['מינכן', 'Munich', 'MUC', 'גרמניה'], ['פרנקפורט', 'Frankfurt', 'FRA', 'גרמניה'], ['המבורג', 'Hamburg', 'HAM', 'גרמניה'],
  ['אמסטרדם', 'Amsterdam', 'AMS', 'הולנד'], ['בריסל', 'Brussels', 'BRU,CRL', 'בלגיה'], ['ציריך', 'Zurich', 'ZRH', 'שווייץ'], ['ז׳נבה', 'Geneva', 'GVA', 'שווייץ'],
  ['ורשה', 'Warsaw', 'WAW,WMI', 'פולין'], ['קרקוב', 'Krakow', 'KRK', 'פולין'], ['בוקרשט', 'Bucharest', 'OTP', 'רומניה'],
  ['סופיה', 'Sofia', 'SOF', 'בולגריה'], ['בורגס', 'Burgas', 'BOJ', 'בולגריה'], ['ורנה', 'Varna', 'VAR', 'בולגריה'], ['טירנה', 'Tirana', 'TIA', 'אלבניה'],
  ['טיבליסי', 'Tbilisi', 'TBS', 'גאורגיה'], ['בטומי', 'Batumi', 'BUS', 'גאורגיה'], ['בקו', 'Baku', 'GYD', 'אזרבייג׳ן'],
  ['קופנהגן', 'Copenhagen', 'CPH', 'דנמרק'], ['סטוקהולם', 'Stockholm', 'ARN', 'שוודיה'], ['אוסלו', 'Oslo', 'OSL', 'נורווגיה'],
  ['דובאי', 'Dubai', 'DXB,DWC', 'איחוד האמירויות'], ['אבו דאבי', 'Abu Dhabi', 'AUH', 'איחוד האמירויות'],
  ['ניו יורק', 'New York', 'JFK,EWR', 'ארצות הברית'], ['מיאמי', 'Miami', 'MIA,FLL', 'ארצות הברית'], ['לוס אנג׳לס', 'Los Angeles', 'LAX', 'ארצות הברית'], ['טורונטו', 'Toronto', 'YYZ', 'קנדה'],
  ['בנגקוק', 'Bangkok', 'BKK,DMK', 'תאילנד'], ['פוקט', 'Phuket', 'HKT', 'תאילנד'], ['צ׳יאנג מאי', 'Chiang Mai', 'CNX', 'תאילנד'],
  ['טוקיו', 'Tokyo', 'NRT,HND', 'יפן'], ['האנוי', 'Hanoi', 'HAN', 'וייטנאם'], ['גואה', 'Goa', 'GOI,GOX', 'הודו'], ['דלהי', 'Delhi', 'DEL', 'הודו'], ['מומבאי', 'Mumbai', 'BOM', 'הודו'],
  ['סיישל', 'Seychelles', 'SEZ', 'סיישל'], ['קייפטאון', 'Cape Town', 'CPT', 'דרום אפריקה'],
].map(([he, en, code, country]) => ({ he, en, code, country }));

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
// No cookies or referrer leave the page with a search, and nothing about it is stored
const api = (path) => fetch(`${FLIGHTS_API}${path}`, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
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
  return AIRLINES.map(([name, url]) => `<a class="fl-airline-link no-link-icon" href="${url}" target="_blank" rel="noopener">${esc(name)}</a>`).join('');
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
  return `<form class="fl-book" action="${esc(offer.url)}" method="post" target="_blank" rel="noopener noreferrer">${inputs}
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

// Search progress: the timeline in the tab, a floating pill anywhere else in FLYMILY, and the browser
// tab's title for when another tab is in front. All three show what the Worker actually reported.
const progress = { baseTitle: document.title, started: 0, ticker: null, stages: {} };

const seconds = () => Math.round((Date.now() - progress.started) / 1000);
const activeStage = () => Object.keys(progress.stages).find((k) => progress.stages[k].state === 'active');

function setTitle(text) {
  document.title = text ? `${text} · ${progress.baseTitle}` : progress.baseTitle;
}

function stageDetail(name, s) {
  if (s.total) return name === 'verify' ? `${s.done} בדיקות` : `${s.done}/${s.total}`;
  return '';
}

function drawTimeline() {
  const box = $('flTimeline');
  const names = Object.keys(progress.stages);
  box.hidden = !names.length;
  box.innerHTML = `<ol>${names.map((name) => {
    const s = progress.stages[name];
    const time = s.seconds != null ? `<span class="muted">${s.seconds} שנ׳</span>` : '';
    return `<li class="fl-step" data-state="${s.state}"><span class="fl-step-mark" aria-hidden="true"></span>
      <span>${esc(STAGES[name])}</span><span class="muted">${stageDetail(name, s)}</span>${time}</li>`;
  }).join('')}</ol>`;
}

function drawProgressPill() {
  const pill = $('flProgressPill');
  const running = document.body.dataset.flightSearch === 'running';
  const done = document.body.dataset.flightSearch === 'done';
  pill.hidden = !(running || done) || resultsInView();
  if (pill.hidden) return;
  pill.textContent = running ? `${STAGES[activeStage()] || 'מחפש טיסות'} · ${seconds()} שנ׳` : 'החיפוש הסתיים · לתוצאות';
}

function tickProgress() {
  $('flStatus').textContent = `עובד כבר ${seconds()} שנ׳`;
  drawProgressPill();
  setTitle(`✈ ${STAGES[activeStage()] || 'מחפש'} ${seconds()} שנ׳`);
}

function startProgress(tricks) {
  progress.started = Date.now();
  progress.stages = { search: { state: 'active' }, verify: { state: 'pending' } };
  if (tricks) progress.stages.tricks = { state: 'pending' };
  progress.stages.ready = { state: 'pending' };
  drawTimeline();
  tickProgress();
  progress.ticker = setInterval(tickProgress, 1000);
}

function applyProgress({ stage, done, total, final }) {
  const s = progress.stages[stage];
  if (!s) return;
  Object.assign(s, { done, total, state: final ? 'done' : 'active' });
  if (final) s.seconds = seconds();
  // Price checks and connections start together once the flight list is in
  if (stage === 'search' && final) {
    Object.values(progress.stages).forEach((other) => { if (other.state === 'pending') other.state = 'active'; });
    progress.stages.ready.state = 'pending';
  }
  if (Object.entries(progress.stages).every(([k, v]) => k === 'ready' || v.state === 'done')) progress.stages.ready.state = 'active';
  drawTimeline();
  tickProgress();
}

function endProgress(failed) {
  clearInterval(progress.ticker);
  const stages = progress.stages;
  Object.values(stages).forEach((s) => { if (s.state === 'active') s.state = failed ? 'failed' : 'done'; });
  if (!failed) {
    stages.ready.state = 'done';
    stages.ready.seconds = seconds();
  }
  drawTimeline();
  setTitle('');
}

// The Worker writes one JSON object per line; lines can arrive split across chunks
async function readSearch(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = null;
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split('\n');
    buffer = done ? '' : lines.pop();
    for (const line of lines.filter(Boolean)) {
      const message = JSON.parse(line);
      if (message.stage) applyProgress(message);
      else answer = message;
    }
    if (done) return answer;
  }
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

  const params = new URLSearchParams({ ...q, tricks: $('flTricks').checked ? '1' : '0', stream: '1' });
  if ($('flDepartTime').value) params.set('departTimes', $('flDepartTime').value);
  if ($('flReturnTime').value) params.set('returnTimes', $('flReturnTime').value);
  const button = $('flSubmit');
  button.disabled = true;
  document.body.dataset.flightSearch = 'running';
  $('flResults').innerHTML = '';
  startProgress($('flTricks').checked);
  let failed = true;
  try {
    const r = await api(`/search?${params}`);
    const answer = r.ok ? await readSearch(r) : await r.json();
    if (answer?.result) {
      showResults(answer.result, q, dest);
      failed = false;
    } else if (answer?.error === 'no-key') showFallback(q, 'החיפוש החי עדיין לא חובר.');
    else showFallback(q, 'החיפוש נכשל כרגע.');
  } catch (e) {
    console.error('flight search failed', e);
    showFallback(q, 'החיפוש החי לא זמין כרגע.');
  } finally {
    endProgress(failed);
    button.disabled = false;
    status.textContent = failed ? '' : `הסתיים ב־${seconds()} שנ׳`;
    finishSearch();
  }
}

function resultsInView() {
  return !document.hidden && document.body.dataset.homeTab === 'flights' && !!document.querySelector('.container.home-mode');
}

// The dot sits on the "חפש טיסה" tab, and on "כל הנסיעות" while a trip is open and the tab isn't on screen
function finishSearch() {
  if (resultsInView()) delete document.body.dataset.flightSearch;
  else {
    document.body.dataset.flightSearch = 'done';
    setTitle('● החיפוש הסתיים');
  }
  drawProgressPill();
}

function clearDoneDot() {
  if (document.body.dataset.flightSearch !== 'done' || !resultsInView()) return;
  delete document.body.dataset.flightSearch;
  setTitle('');
  drawProgressPill();
}

async function checkTrickLeg(btn) {
  const leg = JSON.parse(btn.dataset.leg);
  const passengers = { adults: $('flAdults').value, children: $('flChildren').value, infants: $('flInfants').value };
  btn.disabled = true;
  btn.textContent = 'בודק...';
  try {
    const r = await api(`/booking?${new URLSearchParams({ ...leg, ...passengers })}`);
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
  clearDoneDot();
  drawProgressPill();
}

function suggestionsFor(text) {
  const t = text.trim().toLowerCase();
  if (!t) return [];
  const rank = (d) => {
    const names = [d.he, d.en.toLowerCase()];
    if (names.some((n) => n.startsWith(t)) || d.code.toLowerCase().split(',').includes(t)) return 0;
    if (d.country.startsWith(t)) return 1;
    if (names.some((n) => n.includes(t))) return 2;
    return 3;
  };
  return DESTINATIONS.map((d) => [rank(d), d]).filter(([r]) => r < 3)
    .sort((a, b) => a[0] - b[0]).slice(0, MAX_SUGGESTIONS).map(([, d]) => d);
}

function wireAutocomplete() {
  const input = $('flTo');
  const list = $('flSuggest');
  let items = [];
  let active = -1;

  const close = () => {
    list.hidden = true;
    active = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };
  const draw = () => {
    list.innerHTML = items.map((d, i) => `<li id="flOpt${i}" role="option" data-i="${i}" aria-selected="${i === active}">
      <span>${esc(d.he)} <span class="muted">${esc(d.country)}</span></span>
      <bdi class="muted">${esc(d.code.split(',').slice(0, 2).join(', '))}${d.code.split(',').length > 2 ? '…' : ''}</bdi>
    </li>`).join('');
    list.hidden = !items.length;
    input.setAttribute('aria-expanded', items.length ? 'true' : 'false');
    if (active >= 0) input.setAttribute('aria-activedescendant', `flOpt${active}`);
    else input.removeAttribute('aria-activedescendant');
  };
  const choose = (d) => {
    input.value = d.he;
    close();
  };

  input.addEventListener('input', () => {
    items = suggestionsFor(input.value);
    active = -1;
    draw();
  });
  input.addEventListener('keydown', (ev) => {
    if (list.hidden) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const step = ev.key === 'ArrowDown' ? 1 : -1;
      active = (active + step + items.length) % items.length;
      draw();
    } else if (ev.key === 'Enter' && active >= 0) {
      ev.preventDefault();
      choose(items[active]);
    } else if (ev.key === 'Escape') {
      close();
    }
  });
  input.addEventListener('blur', close);
  // pointerdown, so the choice lands before the input's blur closes the list
  list.addEventListener('pointerdown', (ev) => {
    const li = ev.target.closest('li');
    if (!li) return;
    ev.preventDefault();
    choose(items[Number(li.dataset.i)]);
  });
}

function init() {
  wireAutocomplete();
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
  document.addEventListener('visibilitychange', clearDoneDot);
  $('flProgressPill').addEventListener('click', () => {
    if (document.querySelector('.container.trip-mode')) $('btnAllTrips')?.click();
    setTimeout(() => setHomeTab('flights'));
  });
  // Back from a trip with results waiting: go straight to them
  $('btnAllTrips')?.addEventListener('click', () => {
    if (document.body.dataset.flightSearch === 'done') setTimeout(() => setHomeTab('flights'));
  });
  let saved = 'trips';
  try { saved = localStorage.getItem(DEFAULT_TAB_KEY) || 'trips'; } catch (_) {}
  setHomeTab(saved);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
