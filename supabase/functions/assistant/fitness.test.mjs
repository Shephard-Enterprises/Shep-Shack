import { BUILTIN_MOVEMENTS } from '../_shared/movement-library.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHandler, buildInput } from './chat.mjs'
import { fitnessFormatFor, loadFitness, parseFitnessAnswer } from './fitness.mjs'
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
    if (path.includes('status=eq.draft')) return []
    if (path.startsWith('fitness_movements')) return BUILTIN_MOVEMENTS
    if (path.startsWith('fitness_routines')) return []
    return Array.from({ length: path.includes('offset=0&') ? 200 : 1 }, () => ({ name: 'Walk', kind: 'cardio', minutes: 20, exercises: [], performed_on: '2026-01-01' }))
  }
  const fitness = await loadFitness(db, profileId)
  assert.equal(fitness.summary.completedWorkouts, 201)
  assert.equal(fitness.summary.totalCardioMinutes, 4020)
  assert.ok(paths.filter(path => path.startsWith('fitness_sessions') && !path.includes('status=eq.draft')).every(path => path.includes(`profile_id=eq.${profileId}&status=eq.completed`)))
  const payload = buildInput([], 'How is Rosy doing?', '', 'fitness', fitness)
  assert.equal(payload.text.format.type, 'json_schema')
  assert.ok(payload.text.format.schema.properties.workout.anyOf[1].properties.exercises.items.properties.movement_id.enum.includes('triceps-pushdown'))
  assert.match(JSON.stringify(payload.input), /4020/)
})
test('malformed, incomplete, or invalid plans are never accepted for saving', () => {
  assert.throws(() => parseFitnessAnswer({ status: 'incomplete' }, '{}'), /not saved/)
  assert.throws(() => parseFitnessAnswer({}, 'bad json'), /No workout was saved/)
  assert.throws(() => parseFitnessAnswer({}, JSON.stringify({ reply: 'Plan', workout: { ...workout, exercises: [{ ...workout.exercises[0], sets: 99 }] } })), /1–12/)
  assert.equal(parseFitnessAnswer({ output: [{ content: [{ type: 'refusal', refusal: 'Cannot help' }] }] }, '').workout, null)
})
function harness({ saveFails = false, answerWorkout = workout, saveAs = 'auto' } = {}) {
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
    if (url.endsWith('/rpc/assistant_finish_adhoc')) return saveFails ? json({ message: 'Finish or discard the active workout' }, 400) : json(requestId)
    if (url.endsWith('/rpc/assistant_finish_fitness')) return saveFails ? json({ message: 'Storage temporarily unavailable' }, 500) : json(answerWorkout ? requestId : null)
    if (url === 'https://api.openai.com/v1/responses') return json({ status: 'completed', usage: { input_tokens: 1000, output_tokens: 500 }, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ reply: 'Here is your plan.', workout: answerWorkout }) }] }] })
    throw new Error(`Unexpected request ${url}`)
  } })
  return { calls, send: () => handler(new Request('https://edge.test', { method: 'POST', headers: { Authorization: 'Bearer session' }, body: JSON.stringify({ threadId, requestId, profileId, saveAs, message: 'Write and save my next workout' }) })) }
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
  assert.equal(failed.calls.at(-1).body.p_amount, 0.00035)
})

test('Patty receives completed timed sets as seconds and creates validated timed plans', async () => {
  const result = await loadFitness(async path => {
    if (path.startsWith('fitness_profiles')) return [{ id: profileId, name: 'Rosy' }]
    if (path.includes('status=eq.draft')) return []
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

test('Patty creates an ad hoc session without inserting a routine or marking sets done', async () => {
  const h=harness({answerWorkout:{...workout,save_as:'adhoc',timer_order:'circuit',exercises:[{...workout.exercises[0],work_seconds:45}]}})
  const result=await (await h.send()).json()
  assert.equal(result.savedSessionId,requestId);assert.equal(result.savedRoutineId,null)
  const save=h.calls.find(call=>call.url.endsWith('/assistant_finish_adhoc'))
  assert.equal(save.body.p_session.timer_order,'circuit')
  assert.equal(save.body.p_session.exercises[0].work_seconds,45)
  assert.ok(save.body.p_session.exercises[0].sets.every(set=>!set.done && set.weight===null && set.reps===null))
  assert.equal(h.calls.some(call=>call.url.endsWith('/assistant_finish_fitness')),false)
  assert.match(result.messages.at(-1).content,/no routine was saved/)
})
test('an explicit destination overrides the generated save mode; active-session rejection is surfaced', async () => {
  const routine=harness({saveAs:'routine',answerWorkout:{...workout,save_as:'adhoc'}})
  assert.equal((await (await routine.send()).json()).savedRoutineId,requestId)
  const adhoc=harness({saveAs:'adhoc',answerWorkout:workout})
  assert.equal((await (await adhoc.send()).json()).savedSessionId,requestId)
  const conflict=harness({saveAs:'adhoc',saveFails:true})
  assert.match((await (await conflict.send()).json()).error,/active workout/)
})


test('Patty corrects an invented pushdown ID using its exact library name', async () => {
  const pushdown = { ...workout.exercises[0], name: 'Cable triceps pushdown', movement_id: 'cable-triceps-pushdown' }
  const parsed = parseFitnessAnswer({}, JSON.stringify({ reply: 'Here is your plan.', workout: { ...workout, exercises: [pushdown] } }))
  assert.equal(parsed.workout.exercises[0].movement_id, 'triceps-pushdown')
  assert.equal(parsed.workout.exercises[0].name, 'Cable triceps pushdown')
  const h = harness({ answerWorkout: { ...workout, exercises: [pushdown] } })
  const result = await (await h.send()).json()
  assert.equal(result.savedRoutineId, requestId)
  assert.equal(h.calls.find(call => call.url.endsWith('/assistant_finish_fitness')).body.p_routine.exercises[0].movement_id, 'triceps-pushdown')
  assert.equal(h.calls.filter(call => call.url.includes('api.openai.com')).length, 1)
})
test('generation schema allows only supplied movement IDs and does not mutate shared defaults', () => {
  const library = BUILTIN_MOVEMENTS.filter(movement => movement.id === 'triceps-pushdown')
  const format = fitnessFormatFor(library)
  assert.deepEqual(format.schema.properties.workout.anyOf[1].properties.exercises.items.properties.movement_id.enum, ['triceps-pushdown'])
  assert.equal(fitnessFormatFor().schema.properties.workout.anyOf[1].properties.exercises.items.properties.movement_id.enum.length, BUILTIN_MOVEMENTS.length)
  assert.deepEqual(fitnessFormatFor([]).schema.properties.workout, { type: 'null' })
})
test('generated movement repair accepts unique aliases and custom names, never fuzzy variations', () => {
  const parse = (name, library = BUILTIN_MOVEMENTS) => parseFitnessAnswer({}, JSON.stringify({ reply: 'Here is your plan.', workout: { ...workout, exercises: [{ ...workout.exercises[0], name, movement_id: 'invented-id' }] } }), library)
  assert.equal(parse('Rope pushdown').workout.exercises[0].movement_id, 'triceps-pushdown')
  const custom = { id: 'custom-band-pushdown', name: 'My band pushdown', aliases: [], mode: 'reps' }
  assert.equal(parse('My band pushdown', [custom]).workout.exercises[0].movement_id, custom.id)
  assert.throws(() => parse('Dumbbell triceps pushdown'), /No workout was saved/)
  assert.throws(() => parse('curls'), /No workout was saved/)
  assert.throws(() => parse('Cable triceps pushdown', []), /No workout was saved/)
})
