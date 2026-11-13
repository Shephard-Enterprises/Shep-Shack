import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {stripTypeScriptTypes} from 'node:module'
const oldDeno=globalThis.Deno, oldFetch=globalThis.fetch
let handler
let member=false, loads=0
// Only the boundary collaborators are mocked; the routing/cache are real.
globalThis.sportsMember=()=>member
globalThis.sportsDetail=async key=>{loads++;return {team:{key},errors:{},news:[]}}
globalThis.Deno={serve:callback=>{handler=callback}}
let code=await readFile(new URL('./index.ts',import.meta.url),'utf8')
code=code.replace("import { isHouseholdMember } from '../_shared/household-auth.ts'",'const isHouseholdMember=async()=>globalThis.sportsMember()')
code=code.replace("import { DETAIL_TEAMS, loadTeamDetails } from './team-details.ts'","const DETAIL_TEAMS={wave:{}};const loadTeamDetails=globalThis.sportsDetail")
code=code.replace('./team-parsers.js',new URL('./team-parsers.js',import.meta.url).href)
await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(code)).toString('base64'))
test.after(()=>{globalThis.Deno=oldDeno;globalThis.fetch=oldFetch;delete globalThis.sportsMember;delete globalThis.sportsDetail})
const request=body=>new Request('https://sports.test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})

test('team coverage is household-only, cached after authorization, and rejects arbitrary team keys',async()=>{
  assert.equal((await handler(request({teamKey:'wave'}))).status,403)
  assert.equal(loads,0)
  member=true
  assert.equal((await handler(request({teamKey:'wave'}))).status,200)
  assert.equal((await handler(request({teamKey:'wave'}))).status,200)
  assert.equal(loads,1)
  for(const teamKey of ['unknown','__proto__','toString','https://evil.test']) assert.equal((await handler(request({teamKey}))).status,400)
  member=false
  assert.equal((await handler(request({teamKey:'wave'}))).status,403)
  assert.equal(loads,1)
})
test('existing summary requests keep their contract without loading team news',async()=>{
  member=true
  globalThis.fetch=async()=>new Response('{}',{status:503})
  const result=await handler(request({}))
  assert.equal(result.status,200)
  const data=await result.json()
  assert.deepEqual(data.teams,[])
  assert.match(data.error,/unavailable/)
  assert.equal(loads,1)
})
