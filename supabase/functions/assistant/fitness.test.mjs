import { BUILTIN_MOVEMENTS } from '../_shared/movement-library.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHandler, buildInput } from './chat.mjs'
import { loadFitness, parseFitnessAnswer } from './fitness.mjs'
const profileId = '22222222-2222-4222-8222-222222222222'
const userId = '00000000-0000-0000-0000-000000000001'
const threadId = '00000000-0000-0000-0000-000000000002'
const requestId = '00000000-0000-0000-0000-000000000003'
const workout = { name: 'Rosy Upper A', unit: 'lb', notes: 'Keep it comfortable', exercises: [{ name: 'Dumbbell row', movement_id: 'dumbbell-row', sets: 3, reps: '8–12', rest: 90 }] }
const env = key => ({ SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: 'private', OPENAI_API_KEY: 'secret' })[key]
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })

test('selected profile is queried explicitly; totals use all pages and omit drafts', async () => {
  const paths = []
  const db = async path => {
    paths.push(path)
    if (path.startsWith('fitness_profiles')) return [{ id: profileId, name: 'Rosy' }]
    if (path.startsWith('fitness_movements')) return BUILTIN_MOVEMENTS
    if (path.startsWith('fitness_routines')) return []
    return Array.from({ length: path.includes('offset=0&') ? 200 : 1 }, () => ({ name: 'Walk', kind: 'cardio', minutes: 20, exercises: [], performed_on: '2026-01-01' }))
  }
  const fitness = await loadFitness(db, profileId)
  assert.equal(fitness.summary.completedWorkouts, 201)
  assert.equal(fitness.summary.totalCardioMinutes, 4020)
  assert.ok(paths.filter(path => path.startsWith('fitness_sessions')).every(path => path.includes(`profile_id=eq.${profileId}&status=eq.completed`)))
  const payload = buildInput([], 'How is Rosy doing?', '', 'fitness', fitness)
  assert.equal(payload.text.format.type, 'json_schema')
  assert.match(JSON.stringify(payload.input), /4020/)
})
test('malformed, incomplete, or invalid plans are never accepted for saving', () => {
  assert.throws(() => parseFitnessAnswer({ status: 'incomplete' }, '{}'), /not saved/)
  assert.throws(() => parseFitnessAnswer({}, 'bad json'), /No workout was saved/)
  assert.throws(() => parseFitnessAnswer({}, JSON.stringify({ reply: 'Plan', workout: { ...workout, exercises: [{ ...workout.exercises[0], sets: 99 }] } })), /1–12/)
  assert.equal(parseFitnessAnswer({ output: [{ content: [{ type: 'refusal', refusal: 'Cannot help' }] }] }, '').workout, null)
})
function harness({ saveFails = false, answerWorkout = workout } = {}) {
  const calls = []
  const handler = createHandler({ env, fetchImpl: async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null
    calls.push({ url, body, headers: options.headers })
    if (url.endsWith('/auth/v1/user')) return json({ id: userId })
    if (url.endsWith('/rpc/is_household_member')) return json(true)
    if (url.includes('/fitness_movements?')) return json(BUILTIN_MOVEMENTS)
    if (url.includes('/fitness_profiles?')) return json([{ id: profileId, name: 'Rosy' }])
    if (url.includes('/fitness_routines?') || url.includes('/fitness_sessions?') || url.includes('/assistant_profiles?')) return json([])
    if (url.includes('/assistant_threads?')) return json([{ messages: [] }])
    if (url.endsWith('/rpc/assistant_reserve') || url.endsWith('/rpc/assistant_finish')) return json(null)
    if (url.endsWith('/rpc/assistant_finish_fitness')) return saveFails ? json({ message: 'Storage temporarily unavailable' }, 500) : json(answerWorkout ? requestId : null)
    if (url === 'https://api.openai.com/v1/responses') return json({ status: 'completed', usage: { input_tokens: 1000, output_tokens: 500 }, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ reply: 'Here is your plan.', workout: answerWorkout }) }] }] })
    throw new Error(`Unexpected request ${url}`)
  } })
  return { calls, send: () => handler(new Request('https://edge.test', { method: 'POST', headers: { Authorization: 'Bearer session' }, body: JSON.stringify({ threadId, requestId, profileId, message: 'Write and save my next workout' }) })) }
}
test('Patty atomically saves the routine and answer to the selected profile, never a model-provided owner', async () => {
  const h = harness({ answerWorkout: { ...workout, profile_id: 'INJECTED', user_id: 'INJECTED' } })
  const result = await (await h.send()).json()
  assert.equal(result.savedRoutineId, requestId)
  const save = h.calls.find(call => call.url.endsWith('/assistant_finish_fitness'))
  assert.equal(save.body.p_profile, profileId)
  assert.equal(save.body.p_routine.profile_id, undefined)
  assert.equal(save.body.p_routine.user_id, undefined)
  assert.match(result.messages.at(-1).content, /Rosy’s Fitness routines/)
  assert.equal(h.calls.filter(call => call.url.includes('api.openai.com')).length, 1)
})
test('progress-only replies do not create routines; failed saves never return a success claim', async () => {
  const report = harness({ answerWorkout: null })
  assert.equal((await (await report.send()).json()).savedRoutineId, null)
  const failed = harness({ saveFails: true })
  const result = await (await failed.send()).json()
  assert.match(result.error, /Storage/)
  assert.equal(result.messages, undefined)
  assert.equal(failed.calls.at(-1).body.p_amount, 0.003)
})

test('Patty receives completed timed sets as seconds and creates validated timed plans', async () => {
  const result = await loadFitness(async path => {
    if (path.startsWith('fitness_profiles')) return [{ id: profileId, name: 'Rosy' }]
    if (path.startsWith('fitness_movements')) return BUILTIN_MOVEMENTS
    if (path.startsWith('fitness_routines')) return []
    return [{ name: 'Core', kind: 'strength', unit: 'lb', performed_on: '2026-01-01', exercises: [{ name: 'Plank', mode: 'timed', sets: [{ done: true, seconds: 45, weight: null, reps: null }] }] }]
  }, profileId)
  assert.equal(result.summary.exerciseProgress[0].bestSeconds, 45)
  assert.equal(result.summary.exerciseProgress[0].bestReps, undefined)
  const answer = parseFitnessAnswer({}, JSON.stringify({ reply: 'Try this timed core session.', workout: { ...workout, exercises: [{ name: 'Plank', sets: 3, reps: '', rest: 30, mode: 'timed', seconds: 45 }] } }))
  assert.equal(answer.workout.exercises[0].mode, 'timed')
  assert.equal(answer.workout.exercises[0].seconds, 45)
})
