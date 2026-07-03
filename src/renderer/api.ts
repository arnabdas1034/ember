// Thin accessor for the preload-exposed bridge.
export const ember = window.ember

export function uid(): string {
  return (crypto as any).randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)
}
