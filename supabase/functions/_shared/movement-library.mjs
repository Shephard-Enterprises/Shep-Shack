// Stable identities shared by manual plans, AI plans, history, and progress.
// Similar names are not enough to merge equipment or technique variants.
const entries = [
  ['dumbbell-curl', 'Dumbbell curl', 'Arms', 'Dumbbells', ['DB curl', 'DB curls', 'Dumbbell curls']],
  ['barbell-curl', 'Barbell curl', 'Arms', 'Barbell', ['Barbell curls', 'BB curl']],
  ['hammer-curl', 'Dumbbell hammer curl', 'Arms', 'Dumbbells', ['Hammer curl', 'Hammer curls', 'Dumbbell hammer curls']],
  ['ez-bar-curl', 'EZ-bar curl', 'Arms', 'EZ bar', ['EZ bar curl', 'EZ bar curls']],
  ['cable-curl', 'Cable curl', 'Arms', 'Cable', ['Cable curls']],
  ['incline-dumbbell-curl', 'Incline dumbbell curl', 'Arms', 'Dumbbells', ['Incline DB curl']],
  ['triceps-pushdown', 'Cable triceps pushdown', 'Arms', 'Cable', ['Triceps pushdown', 'Tricep pushdown', 'Rope pushdown']],
  ['overhead-triceps-extension', 'Dumbbell overhead triceps extension', 'Arms', 'Dumbbells', ['Overhead dumbbell triceps extension']],
  ['barbell-bench-press', 'Barbell bench press', 'Chest', 'Barbell', ['Bench press', 'Barbell bench', 'BB bench press']],
  ['dumbbell-bench-press', 'Dumbbell bench press', 'Chest', 'Dumbbells', ['DB bench press', 'DB bench']],
  ['incline-dumbbell-press', 'Incline dumbbell bench press', 'Chest', 'Dumbbells', ['Incline dumbbell press', 'Incline DB press']],
  ['incline-barbell-press', 'Incline barbell bench press', 'Chest', 'Barbell', ['Incline barbell press']],
  ['push-up', 'Push-up', 'Chest', 'Bodyweight', ['Push up', 'Push ups', 'Push-ups']],
  ['dumbbell-fly', 'Dumbbell fly', 'Chest', 'Dumbbells', ['Dumbbell flyes', 'DB fly']],
  ['cable-fly', 'Cable fly', 'Chest', 'Cable', ['Cable flyes']],
  ['chest-press-machine', 'Machine chest press', 'Chest', 'Machine', ['Chest press machine']],
  ['dumbbell-row', 'Dumbbell row', 'Back', 'Dumbbells', ['DB row', 'DB rows', 'Dumbbell rows', 'One-arm dumbbell row']],
  ['barbell-row', 'Barbell row', 'Back', 'Barbell', ['Bent-over barbell row', 'Bent over barbell row']],
  ['seated-cable-row', 'Seated cable row', 'Back', 'Cable', ['Seated row', 'Cable row']],
  ['lat-pulldown', 'Lat pulldown', 'Back', 'Cable', ['Lat pull-down', 'Lat pull down']],
  ['pull-up', 'Pull-up', 'Back', 'Bodyweight', ['Pull up', 'Pull ups', 'Pull-ups']],
  ['chin-up', 'Chin-up', 'Back', 'Bodyweight', ['Chin up', 'Chin ups', 'Chin-ups']],
  ['face-pull', 'Cable face pull', 'Back', 'Cable', ['Face pull', 'Face pulls']],
  ['barbell-overhead-press', 'Barbell overhead press', 'Shoulders', 'Barbell', ['Overhead press', 'Military press', 'OHP']],
  ['dumbbell-shoulder-press', 'Dumbbell shoulder press', 'Shoulders', 'Dumbbells', ['DB shoulder press', 'Dumbbell overhead press']],
  ['dumbbell-lateral-raise', 'Dumbbell lateral raise', 'Shoulders', 'Dumbbells', ['Lateral raise', 'Lateral raises', 'DB lateral raise']],
  ['rear-delt-fly', 'Dumbbell rear delt fly', 'Shoulders', 'Dumbbells', ['Rear delt fly', 'Reverse dumbbell fly']],
  ['barbell-back-squat', 'Barbell back squat', 'Legs', 'Barbell', ['Back squat', 'Barbell squat']],
  ['barbell-front-squat', 'Barbell front squat', 'Legs', 'Barbell', ['Front squat']],
  ['goblet-squat', 'Goblet squat', 'Legs', 'Dumbbell / kettlebell', ['Goblet squats']],
  ['bodyweight-squat', 'Bodyweight squat', 'Legs', 'Bodyweight', ['Air squat', 'Air squats']],
  ['leg-press', 'Leg press', 'Legs', 'Machine', []],
  ['leg-extension', 'Leg extension', 'Legs', 'Machine', ['Leg extensions']],
  ['seated-leg-curl', 'Seated leg curl', 'Legs', 'Machine', ['Seated hamstring curl']],
  ['lying-leg-curl', 'Lying leg curl', 'Legs', 'Machine', ['Lying hamstring curl']],
  ['barbell-deadlift', 'Barbell deadlift', 'Legs', 'Barbell', ['Deadlift', 'Conventional deadlift']],
  ['barbell-rdl', 'Barbell Romanian deadlift', 'Legs', 'Barbell', ['Barbell RDL']],
  ['dumbbell-rdl', 'Dumbbell Romanian deadlift', 'Legs', 'Dumbbells', ['Dumbbell RDL', 'DB RDL']],
  ['dumbbell-lunge', 'Dumbbell lunge', 'Legs', 'Dumbbells', ['Dumbbell lunges', 'DB lunge']],
  ['bulgarian-split-squat', 'Dumbbell Bulgarian split squat', 'Legs', 'Dumbbells', ['Bulgarian split squat']],
  ['barbell-hip-thrust', 'Barbell hip thrust', 'Legs', 'Barbell', ['Hip thrust', 'Barbell hip thrusts']],
  ['standing-calf-raise', 'Standing calf raise', 'Legs', 'Machine / bodyweight', ['Standing calf raises']],
  ['seated-calf-raise', 'Seated calf raise', 'Legs', 'Machine', ['Seated calf raises']],
  ['crunch', 'Crunch', 'Core', 'Bodyweight', ['Crunches']],
  ['hanging-knee-raise', 'Hanging knee raise', 'Core', 'Bodyweight', ['Hanging knee raises']],
  ['dead-bug', 'Dead bug', 'Core', 'Bodyweight', ['Dead bugs']],
  ['plank', 'Plank', 'Core', 'Bodyweight', ['Front plank'], 'timed'],
  ['side-plank', 'Side plank', 'Core', 'Bodyweight', ['Side planks'], 'timed'],
  ['wall-sit', 'Wall sit', 'Legs', 'Bodyweight', ['Wall sits'], 'timed'],
  ['farmers-carry', 'Dumbbell farmer carry', 'Full body', 'Dumbbells', ['Farmers carry', "Farmer's carry", 'Farmer carry'], 'timed'],
]
export const BUILTIN_MOVEMENTS = entries.map(([id, name, category, equipment, aliases, mode = 'reps']) => ({ id, name, category, equipment, aliases, mode }))
export const movementNameKey = value => String(value || '').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ')
export function resolveMovement(name, library = BUILTIN_MOVEMENTS) {
  const key = movementNameKey(name)
  if (!key) return null
  const matches = library.filter(movement => [movement.name, ...(movement.aliases || [])].some(value => movementNameKey(value) === key))
  return matches.length === 1 ? matches[0] : null
}
export function movementFor(exercise, library = BUILTIN_MOVEMENTS) {
  const found = exercise.movement_id ? library.find(item => item.id === exercise.movement_id) : resolveMovement(exercise.name, library)
  return found && found.mode === (exercise.mode || 'reps') ? found : null
}
export function movementIdentity(exercise, library = BUILTIN_MOVEMENTS) {
  return exercise.movement_id || movementFor(exercise, library)?.id || `legacy:${movementNameKey(exercise.name)}`
}
export function linkExercises(exercises, library = BUILTIN_MOVEMENTS) {
  return exercises.map(exercise => {
    const movement = movementFor(exercise, library)
    if (!movement) throw new Error(`Choose a specific movement from the library for “${exercise.name}”, or add it as a custom movement.`)
    if (exercise.mode && exercise.mode !== movement.mode) throw new Error(`“${movement.name}” uses ${movement.mode === 'timed' ? 'time' : 'rep'} tracking. Choose its matching variation.`)
    return { ...exercise, movement_id: movement.id, name: movement.name, mode: movement.mode }
  })
}
export function searchMovements(query, library = BUILTIN_MOVEMENTS, category = 'All') {
  const terms = movementNameKey(query).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean).map(term => term.length > 3 ? term.replace(/s$/, '') : term)
  return library.filter(item => (category === 'All' || item.category === category) && terms.every(term => movementNameKey([item.name, item.category, item.equipment, ...(item.aliases || [])].join(' ')).includes(term))).sort((a, b) => a.name.localeCompare(b.name))
}
