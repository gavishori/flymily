// "חפש טיסה" tab on the home screen. Prices come from the flymily-flights Worker (see worker/src/index.js);
// each result links to the airline's own site. Without the Worker the tab still offers direct links.

const FLIGHTS_API = 'https://flymily-flights.gavishori.workers.dev';
const DEFAULT_TAB_KEY = 'flymilyHomeTab';
const MAX_SUGGESTIONS = 7;
const STAGES = { search: 'מחפש טיסות', verify: 'מאמת מחירים מול החברות', tricks: 'בודק קונקשנים', dates: 'בודק 3 ימים לפני ואחרי', ready: 'מסכם תוצאות' };

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
  ['סיאטל', 'Seattle', 'SEA', 'ארצות הברית'], ['סן פרנסיסקו', 'San Francisco', 'SFO,OAK,SJC', 'ארצות הברית'], ['שיקגו', 'Chicago', 'ORD,MDW', 'ארצות הברית'],
  ['בוסטון', 'Boston', 'BOS', 'ארצות הברית'], ['וושינגטון', 'Washington', 'IAD,DCA,BWI', 'ארצות הברית'], ['לאס וגאס', 'Las Vegas', 'LAS', 'ארצות הברית'],
  ['אורלנדו', 'Orlando', 'MCO', 'ארצות הברית'], ['אטלנטה', 'Atlanta', 'ATL', 'ארצות הברית'], ['דאלאס', 'Dallas', 'DFW,DAL', 'ארצות הברית'],
  ['יוסטון', 'Houston', 'IAH,HOU', 'ארצות הברית'], ['דנבר', 'Denver', 'DEN', 'ארצות הברית'], ['פילדלפיה', 'Philadelphia', 'PHL', 'ארצות הברית'],
  ['פורטלנד', 'Portland', 'PDX', 'ארצות הברית'], ['סן דייגו', 'San Diego', 'SAN', 'ארצות הברית'], ['פיניקס', 'Phoenix', 'PHX', 'ארצות הברית'],
  ['הונולולו', 'Honolulu', 'HNL', 'ארצות הברית'], ['ניו אורלינס', 'New Orleans', 'MSY', 'ארצות הברית'], ['אנקורג׳', 'Anchorage', 'ANC', 'ארצות הברית'],
  ['סולט לייק סיטי', 'Salt Lake City', 'SLC', 'ארצות הברית'], ['מיניאפוליס', 'Minneapolis', 'MSP', 'ארצות הברית'], ['דטרויט', 'Detroit', 'DTW', 'ארצות הברית'],
  ['ונקובר', 'Vancouver', 'YVR', 'קנדה'], ['מונטריאול', 'Montreal', 'YUL', 'קנדה'], ['קלגרי', 'Calgary', 'YYC', 'קנדה'],
  ['מקסיקו סיטי', 'Mexico City', 'MEX', 'מקסיקו'], ['קנקון', 'Cancun', 'CUN', 'מקסיקו'], ['פנמה סיטי', 'Panama City', 'PTY', 'פנמה'], ['סן חוסה', 'San Jose', 'SJO', 'קוסטה ריקה'],
  ['בואנוס איירס', 'Buenos Aires', 'EZE,AEP', 'ארגנטינה'], ['ריו דה ז׳ניירו', 'Rio de Janeiro', 'GIG', 'ברזיל'], ['סאו פאולו', 'Sao Paulo', 'GRU', 'ברזיל'],
  ['לימה', 'Lima', 'LIM', 'פרו'], ['קוסקו', 'Cusco', 'CUZ', 'פרו'], ['בוגוטה', 'Bogota', 'BOG', 'קולומביה'], ['סנטיאגו', 'Santiago', 'SCL', 'צ׳ילה'], ['קיטו', 'Quito', 'UIO', 'אקוודור'],
  ['סידני', 'Sydney', 'SYD', 'אוסטרליה'], ['מלבורן', 'Melbourne', 'MEL', 'אוסטרליה'], ['בריסביין', 'Brisbane', 'BNE', 'אוסטרליה'], ['פרת׳', 'Perth', 'PER', 'אוסטרליה'],
  ['אוקלנד', 'Auckland', 'AKL', 'ניו זילנד'], ['קווינסטאון', 'Queenstown', 'ZQN', 'ניו זילנד'],
  ['סינגפור', 'Singapore', 'SIN', 'סינגפור'], ['הונג קונג', 'Hong Kong', 'HKG', 'סין'], ['בייג׳ינג', 'Beijing', 'PEK,PKX', 'סין'], ['שנגחאי', 'Shanghai', 'PVG,SHA', 'סין'],
  ['טאיפיי', 'Taipei', 'TPE', 'טייוואן'], ['סיאול', 'Seoul', 'ICN,GMP', 'דרום קוריאה'], ['אוסקה', 'Osaka', 'KIX', 'יפן'], ['קואלה לומפור', 'Kuala Lumpur', 'KUL', 'מלזיה'],
  ['באלי', 'Bali', 'DPS', 'אינדונזיה'], ['ג׳קרטה', 'Jakarta', 'CGK', 'אינדונזיה'], ['מנילה', 'Manila', 'MNL', 'פיליפינים'],
  ['הו צ׳י מין', 'Ho Chi Minh City', 'SGN', 'וייטנאם'], ['דה נאנג', 'Da Nang', 'DAD', 'וייטנאם'], ['קטמנדו', 'Kathmandu', 'KTM', 'נפאל'], ['קולומבו', 'Colombo', 'CMB', 'סרי לנקה'],
  ['מאלה', 'Male', 'MLE', 'מלדיביים'], ['קוצ׳ין', 'Kochi', 'COK', 'הודו'], ['בנגלור', 'Bangalore', 'BLR', 'הודו'], ['טשקנט', 'Tashkent', 'TAS', 'אוזבקיסטן'], ['אלמטי', 'Almaty', 'ALA', 'קזחסטן'],
  ['זנזיבר', 'Zanzibar', 'ZNZ', 'טנזניה'], ['קילימנג׳רו', 'Kilimanjaro', 'JRO', 'טנזניה'], ['ניירובי', 'Nairobi', 'NBO', 'קניה'], ['יוהנסבורג', 'Johannesburg', 'JNB', 'דרום אפריקה'],
  ['אדיס אבבה', 'Addis Ababa', 'ADD', 'אתיופיה'], ['מרקש', 'Marrakesh', 'RAK', 'מרוקו'], ['קזבלנקה', 'Casablanca', 'CMN', 'מרוקו'], ['קהיר', 'Cairo', 'CAI', 'מצרים'], ['מאוריציוס', 'Mauritius', 'MRU', 'מאוריציוס'],
  ['אדינבורו', 'Edinburgh', 'EDI', 'בריטניה'], ['גלזגו', 'Glasgow', 'GLA', 'בריטניה'], ['ברמינגהם', 'Birmingham', 'BHX', 'בריטניה'], ['ליברפול', 'Liverpool', 'LPL', 'בריטניה'],
  ['ולנסיה', 'Valencia', 'VLC', 'ספרד'], ['סביליה', 'Seville', 'SVQ', 'ספרד'], ['בילבאו', 'Bilbao', 'BIO', 'ספרד'], ['איביזה', 'Ibiza', 'IBZ', 'ספרד'], ['מיורקה', 'Mallorca', 'PMI', 'ספרד'], ['טנריף', 'Tenerife', 'TFS,TFN', 'ספרד'],
  ['פארו', 'Faro', 'FAO', 'פורטוגל'], ['בורדו', 'Bordeaux', 'BOD', 'צרפת'], ['טולוז', 'Toulouse', 'TLS', 'צרפת'],
  ['בולוניה', 'Bologna', 'BLQ', 'איטליה'], ['טורינו', 'Turin', 'TRN', 'איטליה'], ['ורונה', 'Verona', 'VRN', 'איטליה'], ['בארי', 'Bari', 'BRI', 'איטליה'], ['סרדיניה', 'Sardinia', 'CAG,OLB', 'איטליה'],
  ['מיקונוס', 'Mykonos', 'JMK', 'יוון'], ['סנטוריני', 'Santorini', 'JTR', 'יוון'], ['זקינתוס', 'Zakynthos', 'ZTH', 'יוון'], ['קוס', 'Kos', 'KGS', 'יוון'],
  ['אינסברוק', 'Innsbruck', 'INN', 'אוסטריה'], ['זלצבורג', 'Salzburg', 'SZG', 'אוסטריה'], ['דיסלדורף', 'Dusseldorf', 'DUS', 'גרמניה'], ['קלן', 'Cologne', 'CGN', 'גרמניה'], ['שטוטגרט', 'Stuttgart', 'STR', 'גרמניה'], ['בזל', 'Basel', 'BSL', 'שווייץ'],
  ['ליובליאנה', 'Ljubljana', 'LJU', 'סלובניה'], ['זאגרב', 'Zagreb', 'ZAG', 'קרואטיה'], ['ספליט', 'Split', 'SPU', 'קרואטיה'], ['דוברובניק', 'Dubrovnik', 'DBV', 'קרואטיה'],
  ['בלגרד', 'Belgrade', 'BEG', 'סרביה'], ['סקופיה', 'Skopje', 'SKP', 'צפון מקדוניה'], ['פודגוריצה', 'Podgorica', 'TGD', 'מונטנגרו'], ['ירוואן', 'Yerevan', 'EVN', 'ארמניה'],
  ['גדנסק', 'Gdansk', 'GDN', 'פולין'], ['ורוצלב', 'Wroclaw', 'WRO', 'פולין'], ['קלוז׳', 'Cluj', 'CLJ', 'רומניה'],
  ['וילנה', 'Vilnius', 'VNO', 'ליטא'], ['ריגה', 'Riga', 'RIX', 'לטביה'], ['טאלין', 'Tallinn', 'TLL', 'אסטוניה'], ['הלסינקי', 'Helsinki', 'HEL', 'פינלנד'], ['רובניימי', 'Rovaniemi', 'RVN', 'פינלנד'],
  ['ריקיאוויק', 'Reykjavik', 'KEF', 'איסלנד'], ['טרומסו', 'Tromso', 'TOS', 'נורווגיה'], ['ברגן', 'Bergen', 'BGO', 'נורווגיה'], ['גטבורג', 'Gothenburg', 'GOT', 'שוודיה'],
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

function bagNote(offer) {
  if (offer.bag === 'included') return 'מזוודה רשומה כלולה';
  if (offer.bag === 'fee') return `מזוודות: +${money(offer.bagCost)} (כלול בסה״כ)`;
  return 'מחיר המזוודה לא ידוע, בדקו באתר החברה';
}

function bookButton(offer, q) {
  const fields = new URLSearchParams(offer.postData || '');
  const inputs = [...fields].map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('');
  const notes = [offer.fare, q.bag ? bagNote(offer) : offer.bags?.join(' · '), q.flex ? offer.conditions?.join(' · ') : ''].filter(Boolean);
  return `<form class="fl-book" action="${esc(offer.url)}" method="post" target="_blank" rel="noopener noreferrer">${inputs}
    <button class="btn primary" type="submit">להזמנה באתר ${esc(offer.seller)} · ${money(offer.price)}</button>
    ${notes.map((n) => `<span class="muted">${esc(n)}</span>`).join('')}
  </form>`;
}

function resultCard(r, rank, q) {
  const passengers = q.adults + q.children + q.infants;
  const labels = r.legs.length > 1 ? ['הלוך', 'חזור'] : [q.return ? 'הלוך' : 'טיסה'];
  const airlines = new Set(r.legs.flatMap((l) => l.airlines));
  const badge = r.type === 'round-trip' ? 'כרטיס הלוך־חזור אחד'
    : r.type === 'two-tickets' ? (airlines.size > 1 ? 'שילוב שתי חברות' : 'שני כרטיסים') : 'כיוון אחד';
  const actions = r.offers.map((o) => bookButton(o, q)).join('');
  return `<article class="fl-card">
    <div class="fl-card-head">
      <span class="fl-rank">${rank}</span>
      <div>
        <div class="fl-price">${money(r.total)}</div>
        <div class="muted">${passengers > 1 ? `סה״כ ל־${passengers} נוסעים · ` : ''}${esc(badge)}</div>
      </div>
      <span class="fl-verified">מחיר ישיר מהחברה ✓</span>
    </div>
    ${r.legs.map((l, i) => legRow(l, labels[i])).join('')}
    <div class="fl-actions">${actions}</div>
  </article>`;
}

function trickCard(t, q) {
  const direction = t.direction === 'out' ? 'הלוך' : 'חזור';
  const saving = t.saving ? ` · חיסכון ${money(t.saving)}` : '';
  return `<article class="fl-card fl-trick">
    <div class="fl-card-head">
      <div>
        <div class="fl-price">${money(t.total)}</div>
        <div class="muted">${direction} דרך ${esc(t.hub)} בשני כרטיסים${saving}</div>
      </div>
      <span class="fl-verified">מחיר ישיר מהחברות ✓</span>
    </div>
    ${t.legs.map((l, i) => legRow(l, `קטע ${i + 1}`)).join('')}
    <div class="fl-actions">${t.offers.map((o) => bookButton(o, q)).join('')}</div>
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
  if (data.hiddenByTerms) tips.push(`הסתרנו ${data.hiddenByTerms} טיסות בלי אישור לתנאים שבחרתם. לרוב החברה לא מפרסמת את התנאים במקור שלנו, אז כדאי לבדוק באתר שלה.`);
  if (data.hiddenUnchecked) tips.push(`${data.hiddenUnchecked} טיסות יקרות יותר לא הוצגו כי לא אימתנו שהחברה מוכרת אותן.`);
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

function startProgress(tricks, nearby) {
  progress.started = Date.now();
  progress.stages = { search: { state: 'active' }, verify: { state: 'pending' } };
  if (tricks) progress.stages.tricks = { state: 'pending' };
  if (nearby) progress.stages.dates = { state: 'pending' };
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
    for (const name of ['verify', 'tricks']) if (progress.stages[name]) progress.stages[name].state = 'active';
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

function nearbyTip(nearby) {
  if (!nearby) return '';
  const dates = nearby.back ? `${shortDay(nearby.depart)} – ${shortDay(nearby.back)}` : shortDay(nearby.depart);
  const saving = nearby.saving ? `, חיסכון של ${money(nearby.saving)}` : '';
  return `<div class="fl-notice pt-verdict"><strong>המלצה: ב־${esc(dates)} זה יוצא ${money(nearby.total)} ישירות ב־${esc(nearby.seller)}${saving}.</strong></div>`;
}

function showResults(data, q, dest) {
  if (data.results[0]) {
    document.dispatchEvent(new CustomEvent('flymily:cheapest', { detail: { total: data.results[0].total, destination: dest.he } }));
  }
  const box = $('flResults');
  const cards = data.results.map((r, i) => resultCard(r, i + 1, q)).join('');
  box.innerHTML = `
    <div class="fl-results-head">
      <h3>${data.results.length ? `${data.results.length} הטיסות הזולות לכיוון ${esc(dest.he)}` : `לא נמצאו טיסות ישירות מהחברות ל${esc(dest.he)}`}</h3>
      ${data.searchesLeft != null ? `<span class="muted">נותרו ${data.searchesLeft} שאילתות החודש</span>` : ''}
    </div>
    ${nearbyTip(data.nearby)}
    <div class="fl-cards">${cards}</div>
    ${data.tricks?.length ? `<h3>טריקים עם קונקשן</h3><div class="fl-cards">${data.tricks.map((t) => trickCard(t, q)).join('')}</div>` : ''}
    <h3>המלצות</h3>
    <ul class="fl-tips">${recommendations(data, q).map((t) => `<li>${t}</li>`).join('')}</ul>
    <h3>ישירות באתרי החברות</h3>
    <div class="fl-airlines">${airlineLinks()}</div>`;
}

function showFallback(message) {
  $('flResults').innerHTML = `<div class="fl-notice"><strong>${esc(message)}</strong>
      <p class="muted">בינתיים אפשר לבדוק ישירות אצל החברות.</p>
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
    bag: $('flBag').checked ? 1 : 0, flex: $('flFlex').checked ? 1 : 0,
  };
  if (!q.depart) { status.textContent = 'בחרו תאריך יציאה.'; return; }
  if (q.infants > q.adults) { status.textContent = 'כל תינוק צריך מבוגר אחד לפחות.'; return; }

  const params = new URLSearchParams({ ...q, tricks: $('flTricks').checked ? '1' : '0', nearby: $('flNearby').checked ? '1' : '0', stream: '1' });
  if ($('flDepartTime').value) params.set('departTimes', $('flDepartTime').value);
  if ($('flReturnTime').value) params.set('returnTimes', $('flReturnTime').value);
  const button = $('flSubmit');
  button.disabled = true;
  document.body.dataset.flightSearch = 'running';
  $('flResults').innerHTML = '';
  startProgress($('flTricks').checked, $('flNearby').checked);
  let failed = true;
  try {
    const r = await api(`/search?${params}`);
    const answer = r.ok ? await readSearch(r) : await r.json();
    if (answer?.result) {
      showResults(answer.result, q, dest);
      failed = false;
    } else showFallback('החיפוש נכשל כרגע.');
  } catch (e) {
    console.error('flight search failed', e);
    showFallback('החיפוש החי לא זמין כרגע.');
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

function setHomeTab(tab) {
  const container = document.querySelector('.container');
  const awayFromTrips = tab !== 'trips';
  document.body.dataset.homeTab = tab;
  // The trip map's full-screen layout would otherwise stay on behind the flight form
  if (awayFromTrips && container.classList.contains('home-map-mode')) {
    container.dataset.hadMap = '1';
    container.classList.remove('home-map-mode');
  } else if (!awayFromTrips && container.dataset.hadMap) {
    delete container.dataset.hadMap;
    container.classList.add('home-map-mode');
  }
  document.querySelectorAll('#homeTabs [data-home-tab]').forEach((b) => {
    const on = b.dataset.homeTab === tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  $('flightPanel').hidden = tab !== 'flights';
  $('pointsPanel').hidden = tab !== 'points';
  $('hotelPanel').hidden = tab !== 'hotels';
  document.dispatchEvent(new CustomEvent('flymily:tab', { detail: tab }));
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
  const matches = DESTINATIONS.map((d) => [rank(d), d]).filter(([r]) => r < 3)
    .sort((a, b) => a[0] - b[0]).slice(0, MAX_SUGGESTIONS).map(([, d]) => d);
  const isListedCode = DESTINATIONS.some((d) => d.code.toLowerCase().split(',').includes(t));
  if (/^[a-z]{3}$/.test(t) && !isListedCode) {
    const code = t.toUpperCase();
    return [...matches, { he: code, en: code, code, country: 'קוד שדה תעופה' }].slice(-MAX_SUGGESTIONS);
  }
  return matches;
}

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayFromKey = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
const shortDay = (key) => dayFromKey(key).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });

// One calendar for both dates: the first click sets the departure, the next sets the return on the same grid.
// The chosen days live in the hidden #flDepart and #flReturn.
function wireCalendar({ panel, button, depart, back, emptyLabel = 'יציאה וחזרה', firstHint = 'בחרו תאריך יציאה', secondHint = 'עכשיו בחרו תאריך חזרה', allowOneWay = true }) {
  const today = dayKey(new Date());
  const thisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let shown = thisMonth;
  let hovered = '';

  const monthsShown = () => (window.matchMedia('(min-width: 821px)').matches ? 2 : 1);

  const monthHtml = (first) => {
    const year = first.getFullYear();
    const month = first.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    const blanks = '<span></span>'.repeat(first.getDay());
    const cells = Array.from({ length: days }, (_, i) => {
      const key = dayKey(new Date(year, month, i + 1));
      return `<button type="button" class="fl-day" data-day="${key}" aria-label="${dayFromKey(key).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}" ${key < today ? 'disabled' : ''}>${i + 1}</button>`;
    }).join('');
    return `<div class="fl-month">
      <div class="fl-month-title">${first.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}</div>
      <div class="fl-week">${[...'אבגדהוש'].map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="fl-days">${blanks}${cells}</div>
    </div>`;
  };

  const paint = () => {
    const start = depart.value;
    const end = back.value || (hovered > start ? hovered : '');
    panel.querySelectorAll('.fl-day').forEach((el) => {
      const key = el.dataset.day;
      el.classList.toggle('is-start', key === start);
      el.classList.toggle('is-end', !!end && key === end);
      el.classList.toggle('in-range', !!start && !!end && key > start && key < end);
      el.setAttribute('aria-pressed', key === start || key === back.value ? 'true' : 'false');
    });
    const hint = panel.querySelector('.fl-cal-hint');
    if (hint) hint.textContent = !start || back.value ? firstHint : secondHint;
    const oneWay = panel.querySelector('[data-cal="one-way"]');
    if (oneWay) oneWay.disabled = !start;
  };

  const draw = () => {
    const months = Array.from({ length: monthsShown() }, (_, i) => new Date(shown.getFullYear(), shown.getMonth() + i, 1));
    panel.innerHTML = `<div class="fl-cal-nav">
        <button type="button" data-cal="prev" aria-label="חודש קודם" ${shown <= thisMonth ? 'disabled' : ''}>›</button>
        <span class="fl-cal-hint" aria-live="polite"></span>
        <button type="button" data-cal="next" aria-label="חודש הבא">‹</button>
      </div>
      <div class="fl-months" style="grid-template-columns:repeat(${months.length},1fr)">${months.map(monthHtml).join('')}</div>
      <div class="fl-cal-foot">
        <button type="button" data-cal="clear">ניקוי</button>
        ${allowOneWay ? '<button type="button" data-cal="one-way">כיוון אחד</button>' : ''}
      </div>`;
    paint();
  };

  const syncButton = () => {
    button.textContent = !depart.value ? emptyLabel
      : back.value ? `${shortDay(depart.value)} – ${shortDay(back.value)}`
      : `${shortDay(depart.value)} · ${allowOneWay ? 'כיוון אחד' : secondHint}`;
    button.classList.toggle('is-empty', !depart.value);
  };

  const open = () => {
    if (depart.value) shown = new Date(dayFromKey(depart.value).getFullYear(), dayFromKey(depart.value).getMonth(), 1);
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    draw();
    panel.scrollIntoView({ block: 'nearest' });
  };
  const close = () => {
    panel.hidden = true;
    hovered = '';
    button.setAttribute('aria-expanded', 'false');
    syncButton();
  };

  const pick = (key) => {
    if (depart.value && !back.value && key >= depart.value) {
      back.value = key;
      close();
      button.focus();
      return;
    }
    depart.value = key;
    back.value = '';
    hovered = '';
    paint();
  };

  button.addEventListener('click', () => (panel.hidden ? open() : close()));
  panel.addEventListener('click', (ev) => {
    const day = ev.target.closest('[data-day]');
    if (day) { pick(day.dataset.day); return; }
    const action = ev.target.closest('[data-cal]')?.dataset.cal;
    if (action === 'prev' || action === 'next') {
      shown = new Date(shown.getFullYear(), shown.getMonth() + (action === 'next' ? 1 : -1), 1);
      draw();
    } else if (action === 'one-way') {
      back.value = '';
      close();
      button.focus();
    } else if (action === 'clear') {
      depart.value = '';
      back.value = '';
      hovered = '';
      paint();
    }
  });
  // Shows the trip's length while the return is still being chosen
  panel.addEventListener('mouseover', (ev) => {
    const key = ev.target.closest?.('[data-day]')?.dataset.day || '';
    if (key === hovered || !depart.value || back.value) return;
    hovered = key;
    paint();
  });
  window.addEventListener('resize', () => { if (!panel.hidden) draw(); });
  document.addEventListener('pointerdown', (ev) => {
    if (!panel.hidden && ev.target.closest('.fl-dates') !== panel.closest('.fl-dates')) close();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !panel.hidden) { close(); button.focus(); }
  });
  syncButton();
}

function wireAutocomplete(input, list) {
  let items = [];
  let active = -1;

  const close = () => {
    list.hidden = true;
    active = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };
  const draw = () => {
    list.innerHTML = items.map((d, i) => `<li id="${list.id}Opt${i}" role="option" data-i="${i}" aria-selected="${i === active}">
      <span>${esc(d.he)} <span class="muted">${esc(d.country)}</span></span>
      <bdi class="muted">${esc(d.code.split(',').slice(0, 2).join(', '))}${d.code.split(',').length > 2 ? '…' : ''}</bdi>
    </li>`).join('');
    list.hidden = !items.length;
    input.setAttribute('aria-expanded', items.length ? 'true' : 'false');
    if (active >= 0) input.setAttribute('aria-activedescendant', `${list.id}Opt${active}`);
    else input.removeAttribute('aria-activedescendant');
  };
  const choose = (d) => {
    input.value = d.he;
    close();
    input.dispatchEvent(new Event('change', { bubbles: true }));
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
  wireAutocomplete($('flTo'), $('flSuggest'));
  window.flymilyDest = { wire: wireAutocomplete, find: findDestination, calendar: wireCalendar };
  wireCalendar({ panel: $('flCalendar'), button: $('flDateBtn'), depart: $('flDepart'), back: $('flReturn') });
  $('flightForm').addEventListener('submit', runSearch);
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
