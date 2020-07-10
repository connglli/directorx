
export class IntervalError extends Error {}

/** An Interval is a interval [l, h], both included */
export default class Interval {
  /** INFINITY interval */
  public static INF = Interval.of(Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY);

  /** Create an Interval */
  static of(low: number, high: number): Interval {
    return new Interval(low, high);
  }

  /** Check whether a covers b */
  static cover(a: Interval, b: Interval): boolean {
    return a.low <= b.low && b.high <= a.high;
  }

  private constructor(
    public readonly low: number,
    public readonly high: number
  ) {
    if (low > high) {
      throw new IntervalError(`low (${low}) must be less or equal to high(${high})`);
    }
  }
}