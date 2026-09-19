/** Deterministic LCG. The dataset must be identical on every machine. */
export interface Random {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  letters(count: number): string;
}

export function makeRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)]!,
    letters: (count) => Array.from({ length: count }, () => String.fromCharCode(65 + Math.floor(next() * 26))).join(""),
  };
}
