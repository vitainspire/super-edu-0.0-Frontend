const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function genStudentCode(): string {
  let code = 'ST'
  for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  return code
}
