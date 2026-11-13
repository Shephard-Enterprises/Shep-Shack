import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {stripTypeScriptTypes} from 'node:module'
let code = stripTypeScriptTypes(await readFile(new URL('./team-details.ts', import.meta.url), 'utf8'))
code = code.replace('./team-parsers.js', new URL('./team-parsers.js', import.meta.url).href)
const {loadTeamDetails} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
const originalFetch = globalThis.fetch
test.after(() => { globalThis.fetch = originalFetch })
const now = Date.parse('2026-11-12T20:00:00Z')
const rss = '<rss><item><title>Roster news</title><link>https://sandiegowavefc.com/roster-news/</link><pubDate>Wed, 11 Nov 2026 12:00:00 GMT</pubDate></item></rss>'
const event = { id:'1', date:'2026-11-01T20:00:00Z', season:{year:2026}, competitions:[{status:{type:{state:'post'}}, competitors:[{team:{id:'21423'},score:{displayValue:'2'}},{team:{id:'2',displayName:'Other'},score:{displayValue:'1'}}]}] }

test('news survives a schedule outage without invented records or games', async () => {
  globalThis.fetch = async url => new Response(String(url).includes('/feed/') ? rss : '{}', { status: String(url).includes('/feed/') ? 200 : 503 })
  const result = await loadTeamDetails('wave', async()=>({}), now)
  assert.equal(result.news.length, 1)
  assert.equal(result.recent.length, 0)
  assert.equal(result.record, null)
  assert.match(result.errors.schedule, /unavailable/)
})

test('empty next-season feed does not relabel the current season or erase results', async () => {
  globalThis.fetch = async url => {
    url = String(url)
    if (url.includes('/feed/')) return new Response(rss)
    if (url.includes('/schedule')) return Response.json({ season:{year:2026,displayName:'2026 NWSL'},events:url.includes('season=2027')?[]:[event] })
    if (url.includes('/leaders')) return Response.json({categories:[]})
    return Response.json({children:[]})
  }
  const result = await loadTeamDetails('wave', async()=>({}), now)
  assert.equal(result.season.year, 2026)
  assert.equal(result.recent.length, 1)
  assert.equal(result.upcoming.length, 0)
  assert.equal(result.news.length, 1)
})

test('Gulls keeps official date labels without fake countdowns or season records', async () => {
  globalThis.fetch = async()=>new Response('<rss></rss>')
  const result = await loadTeamDetails('gulls', async()=>({latest:{state:'post',dateLabel:'Wed, Nov 11',score:4,opponentScore:1},next:{state:'pre',dateLabel:'Fri, Nov 13 · 7 PM',opponent:'Other'}}),now)
  assert.equal(result.upcoming[0].date, undefined)
  assert.equal(result.upcoming[0].dateLabel,'Fri, Nov 13 · 7 PM')
  assert.equal(result.season.year,null)
  assert.equal(result.record,null)
})

test('ESPN news must match the selected team and have a safe published article link', async () => {
  globalThis.fetch = async url => {
    if (!String(url).includes('/news?')) return new Response('{}',{status:503})
    const article = (teamId,href) => ({headline:'Team update',published:'2026-11-11T12:00:00Z',categories:[{type:'team',teamId}],links:{web:{href}}})
    return Response.json({articles:[article(25,'https://www.espn.com/nhl/story/one'),article(26,'https://www.espn.com/nhl/story/two'),article(25,'https://evil.test/story')]})
  }
  const result=await loadTeamDetails('ducks',async()=>({}),now)
  assert.equal(result.news.length,1)
  assert.equal(result.news[0].source,'ESPN')
  assert.match(result.news[0].url,/espn.com/)
})
