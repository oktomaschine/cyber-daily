import { readFile } from 'fs/promises'

export async function readLines(path: string) {
  return (
    await readFile(path)
  )
    .toString()
    .trim()
    .split('\n')
    .filter(i => i)
}