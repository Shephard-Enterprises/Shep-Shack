// Existing Beer firmware remains compatible. The prepared water sketch already
// identifies itself by name; new firmware also sends a permanent scaleId.
export function resolveScaleId(payload) {
  if (payload.scaleId !== undefined) {
    return ['beer', 'sparkling-water'].includes(payload.scaleId) ? payload.scaleId : null
  }
  return typeof payload.kegName === 'string' && payload.kegName.trim().toLowerCase() === 'sparkling water'
    ? 'sparkling-water' : 'beer'
}
