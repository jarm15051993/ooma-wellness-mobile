const CONTROL_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE'

export function validateDNI(input: string): boolean {
  const value = input.trim().toUpperCase()

  // DNI: 8 digits + control letter
  const dniRegex = /^[0-9]{8}[A-Z]$/
  if (dniRegex.test(value)) {
    const number = parseInt(value.slice(0, 8), 10)
    const letter = value.slice(8)
    return CONTROL_LETTERS[number % 23] === letter
  }

  // NIE: X/Y/Z + 7 digits + control letter
  const nieRegex = /^[XYZ][0-9]{7}[A-Z]$/
  if (nieRegex.test(value)) {
    const niePrefix: Record<string, string> = { X: '0', Y: '1', Z: '2' }
    const normalized = niePrefix[value[0]] + value.slice(1, 8)
    const number = parseInt(normalized, 10)
    const letter = value.slice(8)
    return CONTROL_LETTERS[number % 23] === letter
  }

  return false
}
