// Shared by chat controls and the server; this selects context, never authorizes writes.
export function hasFitnessIntent(message = '') {
  return /\b(workouts?|exercises?|fitness|routines?|train(?:ing)?|reps?|sets?|movements?|cardio|lifting|weights?|strength|gym|bench|squats?|deadlifts?|curls?|planks?|lunges?|push.?ups?|upper.body|lower.body)\b/i.test(message)
}

export function needsFitnessContext(message, page, history = [], dashboardSections = []) {
  if (hasFitnessIntent(message)) return true
  if (dashboardSections.length) return false
  if (page === 'fitness') return true
  const previous = [...history].reverse().find(item => item.role === 'user')?.content || ''
  return hasFitnessIntent(previous) && /^(and\b|what about\b|how about\b|make\b|change\b|use\b|instead\b|yes\b|save\b|do that\b)/i.test(message.trim())
}
