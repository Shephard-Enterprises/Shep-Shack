// Matches the CYD's built-in font and the database constraint.
export function validKegName(name) {
  return typeof name === 'string' && name.length >= 1 && name.length <= 32 &&
    name === name.trim() && /^[\x20-\x7e]+$/.test(name)
}
