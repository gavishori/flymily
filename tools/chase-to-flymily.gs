// FLYMILY ← Chase card alerts.
// Runs inside your own Google account. It reads only messages from no.reply.alerts@chase.com that arrived
// during the trip, takes the amount and merchant from each subject line and the time it arrived, and
// sends just those to the trip in FLYMILY. Nothing else in the mailbox is read, and no mail leaves it.
//
// FLYMILY fills in the four values below when you copy this script from the trip's share screen.
// Then: script.google.com → New project → paste this file, replace appsscript.json with the one from
// FLYMILY → Services + → Gmail API → Add → run install() once and approve. It checks for new alerts
// every 10 minutes and stops by itself two days after the trip ends.

const TRIP_ID = '__TRIP_ID__';
const INGEST_KEY = '__INGEST_KEY__';
const TRIP_FROM = '__FROM__'; // first day of the trip, YYYY-MM-DD
const TRIP_TO = '__TO__';     // last day of the trip

const FEED_URL = 'https://flymily-flights.gavishori.workers.dev/chase';
const SENDER = 'no.reply.alerts@chase.com';
// "You made a $6.94 transaction with CVS PHARMACY #11686", and the online/phone variant of it
const PURCHASE = /\$([\d,]+(?:\.\d{1,2})?)\b.*?\btransaction with (.+)$/i;

function install() {
  removeTriggers();
  ScriptApp.newTrigger('syncChase').timeBased().everyMinutes(10).create();
  syncChase();
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

function syncChase() {
  if (Date.now() > dayStart(TRIP_TO, 3)) { removeTriggers(); return; }
  const props = PropertiesService.getScriptProperties();
  const sent = JSON.parse(props.getProperty('sent') || '{}');
  const ids = listAlerts().filter(function (id) { return !sent[id]; });
  const items = ids.map(readAlert).filter(Boolean);
  for (let i = 0; i < items.length; i += 100) send(items.slice(i, i + 100));
  // Only after FLYMILY accepted them, so a failed run retries the same alerts next time
  ids.forEach(function (id) { sent[id] = 1; });
  props.setProperty('sent', JSON.stringify(sent));
  console.log(ids.length + ' new alerts, ' + items.length + ' purchases sent');
}

// Midnight in the script's time zone, `plusDays` after the given day
function dayStart(day, plusDays) {
  const parts = day.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2] + (plusDays || 0)).getTime();
}

function gmailDay(day, plusDays) {
  return Utilities.formatDate(new Date(dayStart(day, plusDays)), Session.getScriptTimeZone(), 'yyyy/MM/dd');
}

function listAlerts() {
  const q = 'from:' + SENDER + ' after:' + gmailDay(TRIP_FROM, -1) + ' before:' + gmailDay(TRIP_TO, 2);
  const ids = [];
  let page;
  // The built-in Gmail service (added under Services), which needs no Cloud project of its own
  do {
    const r = Gmail.Users.Messages.list('me', { q: q, maxResults: 500, pageToken: page });
    (r.messages || []).forEach(function (m) { ids.push(m.id); });
    page = r.nextPageToken;
  } while (page);
  return ids;
}

// Only the subject line and arrival time are fetched, never the body
function readAlert(id) {
  const m = Gmail.Users.Messages.get('me', id, { format: 'metadata', metadataHeaders: ['Subject'] });
  const arrived = Number(m.internalDate);
  if (arrived < dayStart(TRIP_FROM) || arrived >= dayStart(TRIP_TO, 2)) return null;
  const subject = ((m.payload && m.payload.headers) || []).filter(function (h) { return h.name === 'Subject'; })[0];
  const match = subject && PURCHASE.exec(subject.value);
  if (!match) return null;
  return { id: id, at: new Date(arrived).toISOString(), amount: Number(match[1].replace(/,/g, '')), merchant: match[2].trim() };
}

function send(items) {
  UrlFetchApp.fetch(FEED_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Ingest-Key': INGEST_KEY },
    payload: JSON.stringify({ tripId: TRIP_ID, items: items }),
  });
}
