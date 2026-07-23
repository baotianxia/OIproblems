const cache = new Map<string, number>()

export function getScrollPos(key: string): number | undefined {
  return cache.get(key)
}

export function setScrollPos(key: string, pos: number): void {
  cache.set(key, pos)
}
