// "מלונות" tab on the home screen: list and map side by side. Results come from the flymily-flights Worker
// (Google Hotels through SerpApi); each search costs one query.

const HOTELS_API = 'https://flymily-flights.gavishori.workers.dev/hotels';
const MAP_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '₪' + Math.round(n).toLocaleString('he-IL');

let map = null;
let markers = [];

function ensureMap() {
  if (map || !window.L) return;
  map = L.map('htMap', { zoomControl: true }).setView([32, 34.8], 3);
  L.tileLayer(MAP_TILES, { attribution: '&copy; OpenStreetMap', maxZoom: 19 }).addTo(map);
}

function clearMarkers() {
  markers.forEach((m) => m.remove());
  markers = [];
}

function badges(h) {
  const list = [];
  if (h.freeCancel) list.push('ביטול חינם');
  if (h.breakfast) list.push('ארוחת בוקר');
  list.push(...h.wellness);
  return list.map((b) => `<span class="ht-badge">${esc(b)}</span>`).join('');
}

function hotelCard(h, i) {
  const price = h.nightly != null
    ? `<div class="ht-price">${money(h.nightly)} ללילה</div>${h.total != null ? `<div class="muted">סה״כ ${money(h.total)}</div>` : ''}`
    : '<div class="muted">אין זמינות בתאריכים</div>';
  const rating = h.rating ? `<span class="muted">★ ${esc(h.rating)}${h.reviews ? ` (${esc(h.reviews.toLocaleString('he-IL'))})` : ''}</span>` : '';
  return `<article class="ht-card" data-i="${i}">
    ${h.image ? `<img class="ht-image" src="${esc(h.image)}" alt="" loading="lazy">` : ''}
    <div class="ht-body">
      <strong>${esc(h.name)}</strong>
      ${rating}
      <div class="ht-badges">${badges(h)}</div>
      ${price}
      ${h.link ? `<a class="btn no-link-icon" href="${esc(h.link)}" target="_blank" rel="noopener noreferrer">לאתר המלון</a>` : ''}
    </div>
  </article>`;
}

function focusHotel(i) {
  const marker = markers[i];
  if (!marker || !map) return;
  map.setView(marker.getLatLng(), Math.max(map.getZoom(), 14));
  marker.openPopup();
}

function render(hotels, hidden, left) {
  const list = $('htList');
  ensureMap();
  clearMarkers();
  const counts = [`${hotels.length} מלונות`];
  if (hidden) counts.push(`${hidden} הוסתרו לפי הסינון`);
  if (left != null) counts.push(`נותרו ${left} שאילתות`);
  $('htStatus').textContent = counts.join(' · ');
  list.innerHTML = hotels.length ? hotels.map(hotelCard).join('') : '<p class="muted">לא נמצאו מלונות לפי הסינון.</p>';
  if (!map) return;
  const placed = [];
  hotels.forEach((h, i) => {
    if (h.lat == null || h.lng == null) { markers[i] = null; return; }
    const marker = L.marker([h.lat, h.lng]).addTo(map)
      .bindPopup(`<strong>${esc(h.name)}</strong>${h.nightly != null ? `<br>${money(h.nightly)} ללילה` : ''}`);
    marker.on('click', () => {
      const card = list.querySelector(`[data-i="${i}"]`);
      card?.scrollIntoView({ block: 'nearest' });
      list.querySelectorAll('.ht-card').forEach((c) => c.classList.toggle('is-active', c === card));
    });
    markers[i] = marker;
    placed.push([h.lat, h.lng]);
  });
  map.invalidateSize();
  if (placed.length) map.fitBounds(placed, { padding: [30, 30], maxZoom: 15 });
}

async function search(ev) {
  ev.preventDefault();
  const place = window.flymilyDest?.find($('htTo').value)?.en || $('htTo').value.trim();
  const status = $('htStatus');
  if (!place) { status.textContent = 'כתבו יעד.'; return; }
  if (!$('htIn').value || !$('htOut').value || $('htOut').value <= $('htIn').value) {
    status.textContent = 'בחרו תאריכי כניסה ועזיבה.';
    return;
  }
  const params = new URLSearchParams({
    place, checkIn: $('htIn').value, checkOut: $('htOut').value,
    adults: $('htAdults').value, children: $('htChildren').value,
    available: $('htAvailable').checked ? '1' : '0',
    freeCancel: $('htFreeCancel').checked ? '1' : '0',
    breakfast: $('htBreakfast').checked ? '1' : '0',
    wellness: $('htWellness').checked ? '1' : '0',
  });
  const button = $('htSubmit');
  button.disabled = true;
  status.textContent = 'מחפש מלונות...';
  try {
    const r = await fetch(`${HOTELS_API}?${params}`, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.status);
    render(data.hotels, data.hidden, data.searchesLeft);
  } catch (e) {
    console.error('hotel search failed', e);
    status.textContent = 'החיפוש נכשל כרגע. נסו שוב.';
  } finally {
    button.disabled = false;
  }
}

function init() {
  window.flymilyDest?.wire($('htTo'), $('htSuggest'));
  window.flymilyDest?.calendar({
    panel: $('htCalendar'), button: $('htDateBtn'), depart: $('htIn'), back: $('htOut'),
    emptyLabel: 'כניסה ועזיבה', firstHint: 'בחרו תאריך כניסה', secondHint: 'עכשיו בחרו תאריך עזיבה', allowOneWay: false,
  });
  $('hotelForm').addEventListener('submit', search);
  $('htList').addEventListener('click', (ev) => {
    if (ev.target.closest('a')) return;
    const card = ev.target.closest('.ht-card');
    if (!card) return;
    $('htList').querySelectorAll('.ht-card').forEach((c) => c.classList.toggle('is-active', c === card));
    focusHotel(Number(card.dataset.i));
  });
  // Leaflet can't measure a hidden container
  document.addEventListener('flymily:tab', ({ detail }) => {
    if (detail !== 'hotels') return;
    ensureMap();
    setTimeout(() => map?.invalidateSize());
  });
  if (document.body.dataset.homeTab === 'hotels') {
    ensureMap();
    setTimeout(() => map?.invalidateSize());
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
