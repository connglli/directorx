
export class IntervalError extends Error {}

/** An Interval is a mutable interval [l, h], both included */
export default class Interval {
  /** INFINITY interval */
  public static INF = Interval.of(Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY);

  /** Create an Interval */
  static of(low: number, high: number): Interval {
    return new Interval(low, high);
  }

  /** Return the merge interval of a and b */
  static merge(a: Interval, b: Interval): Interval {
    return Interval.of(Math.min(a.low, b.low), Math.max(a.high, b.high));
  }

  /** Return the overlapped interval of a and b, or null */
  static overlap(a: Interval, b: Interval): Interval | null {
    if (Interval.cover(a, b) >= 0) {
      return b.copy();
    } else if (Interval.cover(b, a) >= 0) {
      return a.copy();
    } else {
      const which = Interval.cross(a, b);
      if (which == 0) {
        return Interval.of(a.low, b.high);
      } else if (which == 1) {
        return Interval.of(b.low, a.high);
      } else {
        return null;
      }
    }
  }

  /** Check whether a and b are crossed each other, return
   * + -1: not cross
   * +  0: a's low in b
   * +  1: a's high in b
   */
  static cross(a: Interval, b: Interval): number {
    if (a.low > b.low && a.low < b.high && b.high < a.high) {
      return 0;
    } else if (b.low > a.low && b.low < a.high && a.high < b.high) {
      return 1;
    } else {
      return -1;
    }
  }

  /** Check whether a covers b, return
   * + -1: not cover
   * +  0: cover, and low is same
   * +  1: cover, and high is same
   * +  2: cover, and exactly same
   * +  3: cover, and strict cover
   */
  static cover(a: Interval, b: Interval): -1 | 0 | 1 | 2 | 3 {
    if (a.low == b.low && a.high == b.high) {
      return 2;
    } else if (a.low < b.low && b.high < a.high) {
      return 3;
    } else if (a.low == b.low && b.high < a.high) {
      return 0;
    } else if (a.low < b.low && b.high == a.high) {
      return 1;
    } else {
      return -1;
    }
  }

  /** Check whether a equals b */
  static equals(a: Interval, b: Interval): boolean {
    return Interval.cover(a, b) == 2;
  }

  get low(): number {
    return this.low_;
  }

  get high(): number {
    return this.high_;
  }

  /** Get a bound, 0 for st, and 1 for ed */
  get(which: number): number {
    if (which == 0) {
      return this.low;
    } else if (which == 1) {
      return this.high;
    } else {
      throw new IntervalError(`which should only be 0 or 1, got ${which}`);
    }
  }

  /** Get a bound, 0 for st, and 1 for ed */
  set(which: number, what: number): void {
    if (which == 0) {
      this.low_ = what;
    } else if (which == 1) {
      this.high_ = what;
    } else {
      throw new IntervalError(`which should only be 0 or 1, got ${which}`);
    }
  }

  copy(low = this.low, high = this.high): Interval {
    return Interval.of(low, high);
  }

  toString(): string {
    return `[${this.low},${this.high}]`;
  }

  private constructor(
    private low_: number,
    private high_: number
  ) {
    if (low_ > high_) {
      throw new IntervalError(`low (${low_}) must be less or equal to high(${high_})`);
    }
  }
}

/** Intervals is initialized by from an Interval, and can be updated
 * by removing one by one Interval, using Intervals#remove(); and one 
 * can see all the rest intervals by iterating the Interval
 */
export class Intervals {
  private readonly intervals: Interval[] = [];

  constructor(inv: Interval) {
    this.intervals.push(Interval.of(inv.low, inv.high));
  }

  remove(removed: Interval): void {
    const intervals = this.intervals.slice();
    this.intervals.splice(0, this.intervals.length);
    for (const i in intervals) {
      const inv = intervals[i];
      if (Interval.cover(inv, removed) >= 0) {
        // cover, split inv by removed
        this.intervals.push(...this.split(inv, removed));
      } else if (Interval.cover(removed, inv) >= 0) {
        switch (Interval.cover(removed, inv)) {
        case 2:
          throw new IntervalError('Cannot reach here');
        case 1:
          // covered, update inv low
          inv.set(0, removed.high);
          this.intervals.push(inv);
          break;
        case 0:
          // covered, update inv high
          inv.set(1, removed.low);
          this.intervals.push(inv);
          break;
        case 3:
          // strict covered, remove inv
          continue;
        }
      } else {
        // cross or no overlapping
        const which = Interval.cross(inv, removed);
        if (which >= 0) {
          // cross, update inv boundary
          inv.set(which, removed.get(1 - which));
        } else {
          // no overlapping, do nothing
        }
        this.intervals.push(inv);
      }
    }
  }

  *[Symbol.iterator](): IterableIterator<Interval> {
    yield* this.intervals;
  }

  /** cover is required, or unknown happened */
  private split(
    x: Interval,
    at: Interval,
  ): [Interval, Interval] | [Interval] {
    // when at is the border of x, don't split
    if (at.low == at.high && (at.low == x.low || at.low == x.high)) {
      return [x]; // don't split
    } else {
      return [Interval.of(x.low, at.low), Interval.of(at.high, x.high)];
    }
  }
}

export class XYInterval {
  /** Return the merged interval of a and b */
  static merge(a: XYInterval, b: XYInterval): XYInterval {
    const mx = Interval.merge(a.x, b.x);
    const my = Interval.merge(a.y, b.y);
    return new XYInterval(mx.low, mx.high, my.low, my.high);
  }

  /** Return the overlapped interval of a and b, or null */
  static overlap(a: XYInterval, b: XYInterval): XYInterval | null {
    const ox = Interval.overlap(a.x, b.x);
    const oy = Interval.overlap(a.y, b.y);
    if (ox != null && oy != null) {
      return new XYInterval(ox.low, ox.high, oy.low, oy.high);
    } else {
      return null;
    }
  }

  public x: Interval;
  public y: Interval;
  constructor(
    x0: number,
    x1: number,
    y0: number,
    y1: number,
  ) {
    this.x = Interval.of(x0, x1);
    this.y = Interval.of(y0, y1);
  }
}

export class XYIntervals {
  private x_: Intervals;
  private y_: Intervals;
  constructor(xy: XYInterval) {
    this.x_ = new Intervals(xy.x);
    this.y_ = new Intervals(xy.y);
  }

  remove(removed: XYInterval): void {
    this.x_.remove(removed.x);
    this.y_.remove(removed.y);
  }

  *x(): IterableIterator<Interval> {
    yield* this.x_;
  }

  *y(): IterableIterator<Interval> {
    yield* this.y_;
  }
}

if (import.meta.main) {
  const inv = new Intervals(Interval.of(0, 1080));
  inv.remove(Interval.of(50, 100));
  inv.remove(Interval.of(100, 100));
  inv.remove(Interval.of(100, 120));
  inv.remove(Interval.of(90, 130));
  inv.remove(Interval.of(30, 140));
  const rest: Interval[] = [
    Interval.of(0, 30),
    Interval.of(140, 1080),
  ];
  let i = 0;
  for (const subInv of inv) {
    if (rest[i].low != subInv.low || rest[i].high != subInv.high) {
      console.log(`Failed: expect [${rest[i]}], got [${subInv}]`);
      break;
    }
    i += 1;
  }
}