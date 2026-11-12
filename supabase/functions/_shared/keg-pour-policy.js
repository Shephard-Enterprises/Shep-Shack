// Keep in sync with MIN_POUR_OZ in the ESP32 sketch. Small tastes and
// load-cell drift should not create pour history or notifications.
export const MIN_POUR_OZ = 5

export function isRecordedPour(ounces) {
  return Number.isFinite(ounces) && ounces >= MIN_POUR_OZ && ounces <= 64
}
