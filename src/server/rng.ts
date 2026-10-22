import "server-only";
export class Rng {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  private next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  uniform(min = 0, max = 1) {
    return min + (max - min) * this.next();
  }
  int(min: number, max: number) {
    return Math.floor(this.uniform(min, max + 1));
  }
  normal(mean = 0, deviation = 1) {
    const a = this.uniform(Number.EPSILON, 1),
      b = this.uniform();
    return mean + deviation * Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
  }
  pick<T>(items: readonly T[]): T {
    if (!items.length) throw new Error("cannot pick from empty array");
    return items[this.int(0, items.length - 1)];
  }
  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy;
  }
}
