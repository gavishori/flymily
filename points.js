// "נקודות" tab on the home screen: what Chase Ultimate Rewards points on a Sapphire Preferred are worth for a
// chosen destination. Nothing typed here is stored. Chase's values as of October 2026; they change, so update
// them here when they do.

const CENTS = { cash: 1, travel: 1, legacy: 1.25, boost: 1.5, boostPremium: 1.75 };
const LEGACY_CUTOFF = '26.10.2025';
const LEGACY_DEADLINE = '26.10.2027';
const TRANSFER_WORTH_IT = 1.5; // cents a mile must bring in before moving points out of Chase is worth it

const PROGRAMS = {
  flyingBlue: { name: 'Flying Blue', airlines: 'Air France ו־KLM', url: 'https://www.flyingblue.com' },
  united: { name: 'United MileagePlus', airlines: 'United ושותפות Star Alliance', url: 'https://www.united.com' },
  aeroplan: { name: 'Aeroplan', airlines: 'Air Canada ושותפות Star Alliance', url: 'https://www.aircanada.com/aeroplan' },
  iberia: { name: 'Iberia Club', airlines: 'Iberia', url: 'https://www.iberia.com' },
  british: { name: 'British Airways Club', airlines: 'British Airways', url: 'https://www.britishairways.com' },
  singapore: { name: 'KrisFlyer', airlines: 'Singapore Airlines', url: 'https://www.singaporeair.com' },
};

const NORTH_AMERICA = ['ארצות הברית', 'קנדה', 'מקסיקו'];
const GULF = ['איחוד האמירויות'];
const FAR = ['תאילנד', 'יפן', 'וייטנאם', 'הודו', 'סיישל', 'דרום אפריקה', 'סינגפור', 'סין', 'טייוואן', 'דרום קוריאה', 'מלזיה',
  'אינדונזיה', 'פיליפינים', 'נפאל', 'סרי לנקה', 'מלדיביים', 'אוזבקיסטן', 'קזחסטן', 'טנזניה', 'קניה', 'אתיופיה', 'מאוריציוס',
  'אוסטרליה', 'ניו זילנד', 'ארגנטינה', 'ברזיל', 'פרו', 'קולומביה', 'צ׳ילה', 'אקוודור', 'פנמה', 'קוסטה ריקה'];

function regionFor(dest) {
  if (NORTH_AMERICA.includes(dest.country)) return 'north-america';
  if (GULF.includes(dest.country)) return 'gulf';
  if (FAR.includes(dest.country)) return 'far';
  return 'europe';
}

const REGION_ADVICE = {
  europe: {
    programs: ['flyingBlue', 'united', 'aeroplan', 'iberia', 'british'],
    tip: 'לאירופה טיסות הלואו־קוסט זולות, ומיילים לא עובדים עליהן. בקו קצר וזול עדיף לשלם במזומן או דרך Chase Travel ולשמור את הנקודות לקו ארוך.',
  },
  'north-america': {
    programs: ['united', 'aeroplan', 'flyingBlue'],
    tip: 'כאן הנקודות בדרך כלל שוות הכי הרבה: הטיסות יקרות, ו־United ו־Air Canada טסות מתל אביב או בקונקשן נוח. בדקו קודם מושבים בפרמיה, שם ההפרש גדול.',
  },
  gulf: {
    programs: ['flyingBlue', 'united', 'aeroplan'],
    tip: 'אמירייטס כבר לא שותפת העברה של Chase מאז אוקטובר 2025, אז אי אפשר להעביר אליה נקודות. השוו מול Chase Travel.',
  },
  far: {
    programs: ['aeroplan', 'united', 'flyingBlue', 'singapore'],
    tip: 'לקו ארוך כמעט תמיד יש קונקשן. בדקו את מסלולי Star Alliance דרך Aeroplan ו־United, ובמחלקת עסקים הפער לעומת מזומן גדול במיוחד.',
  },
};

const GENERAL_TIPS = [
  'העברה ל־Airline היא חד־כיוונית. קודם מוצאים מושב פנוי באתר התוכנית, ורק אחר כך מעבירים.',
  'כדאי לחכות למבצעי העברה ולמבצעי Promo Rewards של Flying Blue, אם אתם לא בלחץ זמן.',
  'מיילים של El Al לא נקנים מ־Chase, וחברות הלואו־קוסט לא משתתפות, אז לרוב הטיסות הישירות הזולות הן לא שימוש טוב לנקודות.',
  'Southwest ו־JetBlue לא טסות לתל אביב. הן רלוונטיות רק לקטעים בתוך ארצות הברית.',
  'מ־1 באוקטובר 2026 העברה ל־World of Hyatt בסאפיר פרפרד היא ביחס 4:3, אז היא שווה פחות מבעבר.',
  'קניות בנקודות שוות בדרך כלל פחות מסנט לנקודה, אז עדיף להימנע.',
];

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const count = (n) => Math.round(n).toLocaleString('he-IL');
const dollars = (n) => '$' + count(n);
const shekels = (n) => '₪' + count(n);

let usdIls = null;

async function loadRate() {
  try {
    const r = await fetch('https://api.frankfurter.dev/v1/latest?from=USD&to=ILS', { credentials: 'omit', referrerPolicy: 'no-referrer' });
    usdIls = (await r.json()).rates?.ILS || null;
  } catch (e) { console.warn('rate unavailable', e); }
  render();
}

const number = (id) => Math.max(0, Number(String($(id).value).replace(/[,\s]/g, '')) || 0);
const money = (usd) => (usdIls ? `${shekels(usd * usdIls)} (${dollars(usd)})` : dollars(usd));

function readInput() {
  const points = number('ptAmount');
  return {
    points,
    legacy: Math.min(number('ptLegacy'), points),
    dest: window.flymilyDest?.find($('ptTo').value) || null,
    priceIls: number('ptPrice'),
    miles: number('ptMiles'),
    taxesIls: number('ptTaxes'),
  };
}

// Cents each mile brings in: what the same flight would cost in cash, less the taxes the award still charges
function centsPerMile({ priceIls, miles, taxesIls }) {
  if (!usdIls || !priceIls || !miles) return 0;
  return ((priceIls - taxesIls) / usdIls * 100) / miles;
}

function optionsFor(input) {
  const { points, legacy } = input;
  const travelUsd = (legacy * CENTS.legacy + (points - legacy) * CENTS.travel) / 100;
  const options = [
    { name: 'מזומן לחשבון', usd: points * CENTS.cash / 100, note: 'הכי פשוט, סנט לנקודה' },
    { name: 'Chase Travel במחיר רגיל', usd: travelUsd, note: legacy ? `${count(legacy)} נקודות ישנות ב־${CENTS.legacy} סנט, והיתר בסנט` : 'סנט לנקודה' },
    { name: 'Chase Travel עם Points Boost', usd: points * CENTS.boost / 100, note: `עד ${CENTS.boost} סנט, ועד ${CENTS.boostPremium} במחלקות פרמיה, רק בטיסות שמסומנות במבצע` },
  ];
  const cents = centsPerMile(input);
  // Only the miles the flight needs earn this rate; whatever is left is valued at a plain cent
  const used = Math.min(input.miles, points);
  if (cents) options.push({ name: 'העברה למיילים', usd: (used * cents + (points - used) * CENTS.cash) / 100, note: `${cents.toFixed(2)} סנט למייל על ${count(used)} נקודות, והיתר בסנט` });
  return options.sort((a, b) => b.usd - a.usd);
}

function verdict(input) {
  const { points, legacy, priceIls, miles } = input;
  const cents = centsPerMile(input);
  if (miles && miles > points) return `חסרות לכם ${count(miles - points)} נקודות למיילים של הטיסה הזו, אז עדיף Chase Travel או מזומן.`;
  if (cents >= TRANSFER_WORTH_IT) return `כדאי להעביר למיילים: ${cents.toFixed(2)} סנט למייל, יותר מרוב אפשרויות Chase. ודאו קודם שיש מושב פנוי.`;
  if (cents) return `לא כדאי להעביר: ${cents.toFixed(2)} סנט למייל. שווה להעביר מ־${TRANSFER_WORTH_IT} סנט ומעלה, אז עדיף Chase Travel.`;
  if (priceIls && usdIls && priceIls / usdIls * 100 / points < 1) return 'הנקודות מכסות את הטיסה הזו ועוד. הזינו כמה מיילים החברה מבקשת כדי לבדוק אם העברה משתלמת.';
  if (legacy) return `יש לכם נקודות ישנות ששוות ${CENTS.legacy} סנט ב־Chase Travel עד ${LEGACY_DEADLINE}. בדקו מיילים, ואם לא מגיעים ל־${TRANSFER_WORTH_IT} סנט, ממשו אותן ב־Chase Travel.`;
  return `בדקו כמה מיילים עולה הטיסה בתוכניות שלמטה. שווה להעביר רק מ־${TRANSFER_WORTH_IT} סנט למייל, ובלי זה עדיף לחפש Points Boost.`;
}

function render() {
  const box = $('ptResults');
  if (!box) return;
  const input = readInput();
  if (!input.points) { box.innerHTML = ''; return; }

  const options = optionsFor(input).map((o, i) => `<li class="pt-option${i === 0 ? ' pt-best' : ''}">
      <div><strong>${esc(o.name)}</strong><div class="muted">${esc(o.note)}</div></div>
      <div class="pt-value">${esc(money(o.usd))}</div>
    </li>`).join('');

  const coverage = input.priceIls && usdIls
    ? `<p class="muted">טיסה ב־${shekels(input.priceIls)} שווה בערך ${count(input.priceIls / usdIls * 100)} נקודות לפי סנט לנקודה.</p>` : '';

  let destination = '<p class="muted">בחרו יעד כדי לקבל המלצה מותאמת.</p>';
  if (input.dest) {
    const advice = REGION_ADVICE[regionFor(input.dest)];
    const programs = advice.programs.map((key) => {
      const p = PROGRAMS[key];
      return `<a class="fl-airline-link no-link-icon" href="${p.url}" target="_blank" rel="noopener noreferrer" title="${esc(p.airlines)}">${esc(p.name)}</a>`;
    }).join('');
    destination = `<h3>ל${esc(input.dest.he)}</h3><p>${esc(advice.tip)}</p>
      <p class="muted">תוכניות שכדאי לבדוק בהן מושבים, כולן ביחס 1:1 מ־Chase:</p>
      <div class="fl-airlines">${programs}</div>`;
  }

  box.innerHTML = `<div class="fl-notice pt-verdict"><strong>${esc(verdict(input))}</strong></div>
    <h3>מה ${count(input.points)} הנקודות שוות</h3>
    <ol class="pt-options">${options}</ol>
    ${coverage}
    ${destination}
    <h3>טיפים</h3>
    <ul class="fl-tips">${GENERAL_TIPS.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    <p class="muted pt-note">הערכה לפי כללי Chase לאוקטובר 2026, לא ייעוץ פיננסי. הערך בפועל מופיע בחשבון שלכם. נקודות ישנות הן נקודות שנצברו לפני ${LEGACY_CUTOFF}.</p>`;
}

function init() {
  $('pointsForm').addEventListener('input', render);
  $('pointsForm').addEventListener('change', render);
  $('pointsForm').addEventListener('submit', (ev) => ev.preventDefault());
  window.flymilyDest?.wire($('ptTo'), $('ptSuggest'));

  // A finished flight search fills in the destination and price, unless they were typed here
  document.addEventListener('flymily:cheapest', ({ detail }) => {
    if (!$('ptTo').value) $('ptTo').value = detail.destination;
    if (!$('ptPrice').value) $('ptPrice').value = Math.round(detail.total);
    render();
  });
  loadRate();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
