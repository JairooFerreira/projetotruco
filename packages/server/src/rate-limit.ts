/** Janela deslizante simples: no máximo `max` ações em `windowMs`. */
export class RateLimiter {
  private readonly stamps: number[] = [];

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Registra uma ação. Retorna false se o limite foi excedido. */
  allow(): boolean {
    const t = this.now();
    while (this.stamps.length > 0 && t - (this.stamps[0] ?? 0) > this.windowMs) {
      this.stamps.shift();
    }
    if (this.stamps.length >= this.max) return false;
    this.stamps.push(t);
    return true;
  }
}
