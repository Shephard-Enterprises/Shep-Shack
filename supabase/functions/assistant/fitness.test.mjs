import { BUILTIN_MOVEMENTS } from '../_shared/movement-library.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHandler, buildInput } from './chat.mjs'
import { fitnessFormatFor, loadFitness, parseFitnessAnswer, routineChanges } from './fitness.mjs'
const profileId = '22222222-2222-4222-8222-222222222222'
const justinId = '11111111-1111-4111-8111-111111111111'
const sourceId = '33333333-3333-4333-8333-333333333333'
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
function harness({ saveFails = false, answerWorkout = workout, saveAs = 'auto', message = 'Write and save my next workout', sessionHistory = [], selectedProfile = profileId, targetProfileId = null, copyRoutineId = null, editRoutineId = null, householdProfiles = [{ id: profileId, name: 'Rosy' }], routines = [] } = {}) {
  const calls = []
  const handler = createHandler({ env, fetchImpl: async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null
    calls.push({ url, body, headers: options.headers })
    if (url.endsWith('/auth/v1/user')) return json({ id: userId })
    if (url.endsWith('/rpc/is_household_member')) return json(true)
    if (url.includes('/assistant_request_metrics?')) return json(null)
    if (url.includes('/fitness_movements?')) return json(BUILTIN_MOVEMENTS)
    if (url.includes('/fitness_profiles?')) return json(url.includes('id=eq.') ? householdProfiles.filter(profile => url.includes(`id=eq.${profile.id}&`)) : householdProfiles)
    if (url.includes('/fitness_sessions?')) return json(url.includes('status=eq.completed') ? sessionHistory.filter(session => url.includes(`profile_id=eq.${session.profile_id}&`)) : [])
    if (url.includes('/fitness_routines?')) return json(routines.filter(routine => url.includes(`profile_id=eq.${routine.profile_id}&`) || url.includes(`?id=eq.${routine.id}&`)))
    if (url.includes('/assistant_profiles?')) return json([])
    if (url.includes('/assistant_threads?')) return json([{ messages: [] }])
    if (url.endsWith('/rpc/assistant_reserve') || url.endsWith('/rpc/assistant_finish')) return json(null)
    if (url.endsWith('/rpc/assistant_finish_adhoc')) return saveFails ? json({ message: 'Finish or discard the active workout' }, 400) : json(requestId)
    if (url.endsWith('/rpc/assistant_finish_routine')) return saveFails ? json({ message: 'Storage temporarily unavailable' }, 500) : json(answerWorkout || copyRoutineId ? requestId : null)
    if (url === 'https://api.openai.com/v1/responses') return json({ status: 'completed', usage: { input_tokens: 1000, output_tokens: 500 }, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ reply: 'Here is your plan.', workout: answerWorkout, target_profile_id: targetProfileId, copy_routine_id: copyRoutineId, edit_routine_id: editRoutineId }) }] }] })
    throw new Error(`Unexpected request ${url}`)
  } })
  return { calls, send: () => handler(new Request('https://edge.test', { method: 'POST', headers: { Authorization: 'Bearer session' }, body: JSON.stringify({ threadId, requestId, profileId: selectedProfile, saveAs, message }) })) }
}
test('Patty atomically saves the routine and answer to the selected profile, never a model-provided owner', async () => {
  const h = harness({ answerWorkout: { ...workout, profile_id: 'INJECTED', user_id: 'INJECTED' } })
  const result = await (await h.send()).json()
  assert.equal(result.savedRoutineId, requestId)
  const save = h.calls.find(call => call.url.endsWith('/assistant_finish_routine'))
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
  assert.equal(failed.calls.filter(call => call.url.endsWith('/rpc/assistant_finish')).at(-1).body.p_amount, 0.00035)
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
  assert.equal(h.calls.some(call=>call.url.endsWith('/assistant_finish_routine')),false)
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
  assert.equal(h.calls.find(call => call.url.endsWith('/assistant_finish_routine')).body.p_routine.exercises[0].movement_id, 'triceps-pushdown')
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


test('dashboard questions with a selected training profile cannot create workouts', async () => {
  const h = harness({ message: 'How do I use the radar on the Weather page?', answerWorkout: null })
  const result = await (await h.send()).json()
  assert.ok(result.messages)
  const payload = h.calls.find(call => call.url === 'https://api.openai.com/v1/responses').body
  assert.equal(payload.text, undefined)
  assert.equal(h.calls.some(call => /\/fitness_(sessions|routines|movements|profiles)\?/.test(call.url)), false)
  assert.equal(h.calls.some(call => /assistant_finish_(routine|adhoc)/.test(call.url)), false)
  const unexpectedPlan = harness({ message: 'What is the weather?', answerWorkout: workout })
  const rejected = await (await unexpectedPlan.send()).json()
  assert.equal(rejected.savedRoutineId, null)
  assert.equal(rejected.savedSessionId, null)
  assert.equal(unexpectedPlan.calls.some(call => /assistant_finish_(routine|adhoc)/.test(call.url)), false)
})


test('Patty one-offs prefill historical weight and reps without marking generated work complete', async () => {
  const sessionHistory = [{ id: 'old', profile_id: profileId, status: 'completed', kind: 'strength', unit: 'kg', performed_on: '2026-01-01', name: 'Prior workout', exercises: [{ id: 'row-old', movement_id: 'dumbbell-row', name: 'Dumbbell row', mode: 'reps', sets: [{ id: 'old-set', weight: 10, reps: 12, done: true }, { id: 'skipped-set', weight: 15, reps: 8, done: false }] }] }]
  const h = harness({ answerWorkout: { ...workout, save_as: 'adhoc' }, sessionHistory })
  const response = await (await h.send()).json()
  assert.equal(response.savedSessionId, requestId)
  const sets = h.calls.find(call => call.url.endsWith('/assistant_finish_adhoc')).body.p_session.exercises[0].sets
  assert.equal(sets[0].weight, 22.05)
  assert.equal(sets[0].reps, 12)
  assert.ok(sets.every(set => !set.done && set.seconds === null))
  assert.equal(sets[1].weight, null)
  assert.equal(sets[1].reps, null)
  assert.equal(sets[2].weight, null)
})


test('Patty preserves user-supplied starting weights without inventing completed sets', async () => {
  const h = harness({ answerWorkout: { ...workout, save_as: 'adhoc', exercises: [{ ...workout.exercises[0], starting_weight: 60 }] } })
  const result = await (await h.send()).json()
  assert.equal(result.savedSessionId, requestId)
  const exercise = h.calls.find(call => call.url.endsWith('/assistant_finish_adhoc')).body.p_session.exercises[0]
  assert.equal(exercise.starting_weight, 60)
  assert.ok(exercise.sets.every(set => set.weight === 60 && !set.done && set.seconds === null))
})


const householdProfiles = [{ id: justinId, name: 'Justin' }, { id: profileId, name: 'Rosy' }]
test('copying Justin’s stored routine to Rosy preserves the prescription and source', async () => {
  const source = { ...workout, id: sourceId, profile_id: justinId, name: 'Upper A', timer_order: 'circuit', notes: 'Original notes', exercises: [{ ...workout.exercises[0], id: 'original-exercise', starting_weight: 60, work_seconds: 40 }, { id: 'original-plank', name: 'Plank', movement_id: 'plank', mode: 'timed', sets: 2, seconds: 45, reps: '', rest: 30 }] }
  const original = structuredClone(source)
  const h = harness({ selectedProfile: justinId, householdProfiles, routines: [source], answerWorkout: null, targetProfileId: profileId, copyRoutineId: sourceId, saveAs: 'adhoc', message: 'Copy my Upper A routine to Rosy' })
  const response = await h.send()
  const result = await response.json()
  assert.equal(response.status, 200, result.error)
  assert.equal(result.savedRoutineId, requestId)
  assert.equal(result.savedSessionId, null)
  assert.equal(result.fitnessProfileId, profileId)
  assert.equal(result.messages.at(-1).fitnessProfileId, profileId)
  assert.match(result.messages.at(-1).content, /Rosy’s Fitness routines/)
  const save = h.calls.find(call => call.url.endsWith('/assistant_finish_routine'))
  assert.equal(save.body.p_profile, profileId)
  const copy = save.body.p_routine
  assert.equal(copy.name, source.name)
  assert.equal(copy.notes, source.notes)
  assert.equal(copy.timer_order, 'circuit')
  assert.equal(copy.exercises[0].starting_weight, 60)
  assert.equal(copy.exercises[0].work_seconds, 40)
  assert.equal(copy.exercises[1].seconds, 45)
  assert.notEqual(copy.exercises[0].id, source.exercises[0].id)
  assert.deepEqual(source, original)
  assert.ok(h.calls.filter(call => call.url.includes('/fitness_')).every(call => call.headers.Authorization === 'Bearer session'))
  const payload = h.calls.find(call => call.url.includes('api.openai.com')).body
  assert.deepEqual(payload.text.format.schema.properties.target_profile_id.enum, [null, justinId, profileId])
  const context = payload.input[0].content
  assert.match(context, /Upper A/)
  assert.match(context, /Rosy/)
  assert.match(context, new RegExp(sourceId))
  assert.equal(h.calls.some(call => /assistant_finish_adhoc/.test(call.url)), false)
})

test('cross-profile one-offs use only the destination’s completed history', async () => {
  const history = id => ({ id: `session-${id}`, profile_id: id, status: 'completed', kind: 'strength', unit: 'lb', performed_on: '2026-01-01', name: 'Row', exercises: [{ movement_id: 'dumbbell-row', name: 'Dumbbell row', mode: 'reps', sets: [{ done: true, weight: id === justinId ? 100 : 20, reps: 10 }] }] })
  const h = harness({ selectedProfile: justinId, householdProfiles, targetProfileId: profileId, answerWorkout: { ...workout, save_as: 'adhoc' }, sessionHistory: householdProfiles.map(profile => history(profile.id)), message: 'Make a one-off workout for Rosy' })
  const result = await (await h.send()).json()
  assert.equal(result.savedSessionId, requestId)
  const save = h.calls.find(call => call.url.endsWith('/assistant_finish_adhoc'))
  assert.equal(save.body.p_profile, profileId)
  assert.equal(save.body.p_session.exercises[0].sets[0].weight, 20)
  assert.ok(save.body.p_session.exercises[0].sets.every(set => !set.done))
})

test('unavailable destinations and source routines never save or report success', async () => {
  for (const options of [
    { targetProfileId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' },
    { copyRoutineId: sourceId, answerWorkout: null },
    { copyRoutineId: 'invalid', answerWorkout: null },
    { copyRoutineId: sourceId },
  ]) {
    const h = harness({ householdProfiles, ...options })
    const result = await (await h.send()).json()
    assert.ok(result.error)
    assert.equal(result.messages, undefined)
    assert.equal(h.calls.some(call => /assistant_finish_(routine|adhoc)/.test(call.url)), false)
  }
})


test('edits preserve routine identity, ownership and retained movement IDs, overriding one-off mode', async () => {
  const source = { ...workout, id: sourceId, profile_id: justinId, updated_at: '2026-11-19T12:00:00Z', exercises: [{ ...workout.exercises[0], id: 'existing-row' }] }
  const h = harness({ selectedProfile: profileId, householdProfiles, routines: [source], editRoutineId: sourceId, answerWorkout: { ...workout, exercises: [{ ...workout.exercises[0], sets: 4 }] }, saveAs: 'adhoc', message: 'Add a set to Justin’s Upper A routine' })
  const response = await h.send()
  const result = await response.json()
  assert.equal(response.status, 200, result.error)
  const save = h.calls.find(call => call.url.endsWith('/assistant_finish_routine'))
  assert.equal(save.body.p_edit_id, sourceId)
  assert.equal(save.body.p_expected_at, source.updated_at)
  assert.equal(save.body.p_profile, justinId)
  assert.equal(save.body.p_routine.exercises[0].id, 'existing-row')
  assert.equal(save.body.p_routine.exercises[0].sets, 4)
  const message = result.messages.at(-1)
  assert.equal(message.workoutId, sourceId)
  assert.equal(message.changeId, requestId)
  assert.equal(message.profileName, 'Justin')
  assert.match(message.changeSummary.join(), /4 ×/)
  assert.match(message.content, /Updated/)
})

test('edits cannot move a routine, use an unavailable version, or mix copy and edit actions', async () => {
  const source = { ...workout, id: sourceId, profile_id: justinId, updated_at: '2026-11-19T12:00:00Z' }
  for (const options of [
    { targetProfileId: profileId },
    { routines: [] },
    { routines: [{ ...source, updated_at: null }] },
    { copyRoutineId: sourceId },
    { answerWorkout: null },
  ]) {
    const h = harness({ householdProfiles, routines: [source], editRoutineId: sourceId, ...options })
    const result = await (await h.send()).json()
    assert.ok(result.error)
    assert.equal(result.messages, undefined)
    assert.equal(h.calls.some(call => /assistant_finish_(routine|adhoc)/.test(call.url)), false)
  }
})

test('edit conflicts surface without a false success message', async () => {
  const source = { ...workout, id: sourceId, profile_id: profileId, updated_at: '2026-11-19T12:00:00Z' }
  const h = harness({ routines: [source], editRoutineId: sourceId, saveFails: true })
  const result = await (await h.send()).json()
  assert.match(result.error, /Storage/)
  assert.equal(result.messages, undefined)
})

test('routine summaries include settings changes, additions, removals and reordering', () => {
  const row = { ...workout.exercises[0], id: 'row', mode: 'reps' }
  const plank = { id: 'plank', name: 'Plank', mode: 'timed', sets: 2, seconds: 30, rest: 45 }
  const before = { ...workout, timer_order: 'sets', exercises: [row, plank] }
  const after = { ...before, timer_order: 'circuit', notes: '', exercises: [{ ...plank, seconds: 60 }, { ...row, sets: 4, starting_weight: 25 }] }
  const summary = routineChanges(before, after).join('\n')
  assert.match(summary, /Workout order: circuit/)
  assert.match(summary, /Notes: \(cleared\)/)
  assert.match(summary, /2 × 60s/)
  assert.match(summary, /starting weight 25 lb/)
  assert.match(summary, /Reordered/)
  assert.match(routineChanges(before, { ...after, exercises: [row] }).join(), /Removed Plank/)
  assert.match(routineChanges({ ...before, exercises: [row] }, before).join(), /Added Plank/)
})
