import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSportsEvent, parseMlbEvent, parseStandings, parseNewsXml, parseClubNewsHtml, safeSourceUrl } from './team-parsers.js'

const now = Date.parse('2026-11-12T20:00:00Z')
test('events retain source season, scores, cancellation and TBD state', () => {
  const event = parseSportsEvent({ id: 'one', date: '2027-03-10T00:00Z', timeValid: false, season: { year: 2027 }, seasonType: { name: 'Regular Season' }, competitions: [{ competitors: [{ team: { id: '21423' }, homeAway: 'home', score: { displayValue: '0' } }, { team: { id: '2', displayName: 'Other' }, score: { displayValue: '1' } }], status: { type: { state: 'post', name: 'STATUS_POSTPONED' } } }] }, '21423')
  assert.equal(event.score, '0')
  assert.equal(event.opponentScore, '1')
  assert.equal(event.seasonYear, 2027)
  assert.equal(event.timeTbd, true)
  assert.equal(event.cancelled, true)
  assert.equal(parseSportsEvent({ competitions: [] }, '21423'), null)
})

test('official news parser decodes text, deduplicates and rejects stale, future or unsafe links', () => {
  const item = (title, url, date) => `<item><title><![CDATA[${title}]]></title><link>${url}</link><pubDate>${date}</pubDate></item>`
  const good = item('Roster &amp; staff &#x2014; update', 'https://club.test/news/one', 'Wed, 11 Nov 2026 12:00:00 GMT')
  const xml = good + good + item('Bad', 'javascript:alert(1)', 'Wed, 11 Nov 2026 12:00:00 GMT') + item('Future', 'https://club.test/future', 'Wed, 11 Nov 2027 12:00:00 GMT') + item('Old', 'https://club.test/old', 'Wed, 11 Nov 2020 12:00:00 GMT')
  const articles = parseNewsXml(xml, 'Club', 'https://club.test', now)
  assert.equal(articles.length, 1)
  assert.equal(articles[0].title, 'Roster & staff — update')
  assert.equal(articles[0].source, 'Club')
  assert.equal(safeSourceUrl('', 'https://club.test', ['club.test']), null)
  assert.equal(safeSourceUrl('https://evil.test/story', 'https://club.test', ['club.test']), null)
  assert.equal(parseNewsXml('<rss><item><title>Club update</title><link>https://club.test/news/two</link><dc:date>2026-11-11T12:00:00Z</dc:date></item></rss>', 'Club', 'https://club.test', now).length, 1)
})

test('club news page preserves undated official headlines without inventing dates', () => {
  const html = '<a class="fm-card-wrap -story" href="/news/2027-schedule" title="Schedule &amp; roster"><h2>Other</h2></a><a class="fm-card-wrap" href="https://evil.test/news/a" title="Bad">x</a>'
  const result = parseClubNewsHtml(html, 'https://www.sandiegofc.com')
  assert.equal(result.length, 1)
  assert.equal(result[0].title, 'Schedule & roster')
  assert.equal(result[0].publishedAt, null)
})

test('standings use the requested season and explicit win/draw/loss order', () => {
  const data = { children: [{ name: 'Regular Season', standings: { season: 2026, entries: [{ team: { id: '21423' }, stats: [{ name: 'wins', displayValue: '18' }, { name: 'ties', displayValue: '4' }, { name: 'losses', displayValue: '8' }, { name: 'rank', displayValue: '2' }] }] } }] }
  assert.equal(parseStandings(data, '21423', 2026).value, '18–4–8')
  assert.equal(parseStandings(data, '21423', 2027), null)
  assert.equal(parseStandings(data, 'other', 2026), null)
})

test('MLB mapping retains the actual season, zero scores and spring-training label', () => {
  const event = parseMlbEvent({ gamePk: 1, season: '2027', gameType: 'S', gameDate: '2027-02-20T00:00:00Z', status: { abstractGameState: 'Preview', startTimeTBD: true }, teams: { away: { team: { id: 135 }, score: 0 }, home: { team: { id: 2, name: 'Other' }, score: 0 } } })
  assert.equal(event.seasonYear, 2027)
  assert.equal(event.competition, 'Spring training')
  assert.equal(event.timeTbd, true)
  assert.equal(event.home, false)
  assert.equal(event.score, 0)
})
