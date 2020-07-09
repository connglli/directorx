import HashMap from './map.ts';

export class RangeError extends Error {}

/** Range is a mutable range starting from 
 * `start`, and ended by `end`, i.e. [start, end].
 */
export class Range {
  /** Return the merged range of a and b */
  static merge(a: Range, b: Range): Range {
    return new Range(Math.min(a.st, b.st), Math.max(a.ed, b.ed));
  }

  /** Return the overlapped range of a and b, or null */
  static overlap(a: Range, b: Range): Range | null {
    if (Range.cover(a, b) >= 0) {
      return b.copy();
    } else if (Range.cover(b, a) >= 0) {
      return a.copy();
    } else {
      const which = Range.cross(a, b);
      if (which == 0) {
        return new Range(a.st, b.ed);
      } else if (which == 1) {
        return new Range(b.st, a.ed);
      } else {
        return null;
      }
    }
  }

  /** Check whether a and b are crossed each other, return
   * + -1: not cross
   * +  0: a's st in b
   * +  1: a's ed in b
   */
  static cross(a: Range, b: Range): number {
    if (a.st > b.st && a.st < b.ed && b.ed < a.ed) {
      return 0;
    } else if (b.st > a.st && b.st < a.ed && a.ed < b.ed) {
      return 1;
    } else {
      return -1;
    }
  }

  /** Check whether a covers b, return
   * + -1: not cover
   * +  0: cover, and st is same
   * +  1: cover, and ed is same
   * +  2: cover, and exactly same
   * +  3: cover, and strict cover
   */
  static cover(a: Range, b: Range): -1 | 0 | 1 | 2 | 3 {
    if (a.st == b.st && a.ed == b.ed) {
      return 2;
    } else if (a.st < b.st && b.ed < a.ed) {
      return 3;
    } else if (a.st == b.st && b.ed < a.ed) {
      return 0;
    } else if (a.st < b.st && b.ed == a.ed) {
      return 1;
    } else {
      return -1;
    }
  }

  /** Check whether a equals b */
  static equals(a: Range, b: Range): boolean {
    return Range.cover(a, b) == 2;
  }

  constructor(
    private st_: number, 
    private ed_: number
  ) {
    if (st_ > ed_) {
      throw new RangeError(`start(${st_}) <= end(${ed_}) does not succeed`);
    }
  }

  get st(): number {
    return this.st_;
  }

  get ed(): number {
    return this.ed_;
  }

  /** Get a bound, 0 for st, and 1 for ed */
  get(which: number): number {
    if (which == 0) {
      return this.st_;
    } else if (which == 1) {
      return this.ed_;
    } else {
      throw new RangeError(`which should only be 0 or 1, got ${which}`);
    }
  }

  /** Get a bound, 0 for st, and 1 for ed */
  set(which: number, what: number): void {
    if (which == 0) {
      this.st_ = what;
    } else if (which == 1) {
      this.ed_ = what;
    } else {
      throw new RangeError(`which should only be 0 or 1, got ${which}`);
    }
  }

  copy(st = this.st, ed = this.ed): Range {
    return new Range(st, ed);
  }

  toString(): string {
    return `(${this.st},${this.ed})`;
  }
}

/** Ranges is initialized by from a Range, and can be updated
 * by removing one by one Range, using Ranges#remove(); and one 
 * can see all the rest ranges by iterating the Range
 */
export default class Ranges {
  private readonly ranges: Range[] = [];

  constructor(rg: Range) {
    this.ranges.push(new Range(rg.st, rg.ed));
  }

  remove(removed: Range): void {
    const ranges = this.ranges.slice();
    this.ranges.splice(0, this.ranges.length);
    for (const i in ranges) {
      const rg = ranges[i];
      if (Range.cover(rg, removed) >= 0) {
        // cover, split rg by removed
        this.ranges.push(...this.split(rg, removed));
      } else if (Range.cover(removed, rg) >= 0) {
        switch (Range.cover(removed, rg)) {
        case 2:
          throw new RangeError('Cannot reach here');
        case 1:
          // covered, update rg st
          rg.set(0, removed.ed);
          this.ranges.push(rg);
          break;
        case 0:
          // covered, update rg ed
          rg.set(1, removed.st);
          this.ranges.push(rg);
          break;
        case 3:
          // strict covered, remove rg
          continue;
        }
      } else {
        // cross or no overlapping
        const which = Range.cross(rg, removed);
        if (which >= 0) {
          // cross, update rg boundary
          rg.set(which, removed.get(1 - which));
        } else {
          // no overlapping, do nothing
        }
        this.ranges.push(rg);
      }
    }
  }

  *[Symbol.iterator](): IterableIterator<Range> {
    yield* this.ranges;
  }

  /** cover is required, or unknown happened */
  private split(
    x: Range, 
    at: Range
  ): [Range, Range] | [Range] {
    // when at is the border of x, don't split
    if (at.st == at.ed && (at.st == x.st || at.st == x.ed)) {
      return [x]; // don't split
    } else {
      return [new Range(x.st, at.st), new Range(at.ed, x.ed)];
    }
  }
}

export class MemorizedRanges extends Ranges {
  // the removed ranges, along with 
  // its overlapped ranges
  private readonly mem: Range[] = [];
  private readonly ove: HashMap<Range, Range[]> = new HashMap(
    'md5', (a, b) => Range.equals(a, b)
  );

  remove(removed: Range): void {
    super.remove(removed);
    // compute overlapped, and save them
    for (const r of this.mem) {
      if (Range.overlap(r, removed)) {
        this.updateOverlapping(r, removed);
      }
    }
    this.mem.push(removed);
  }

  *memory(): IterableIterator<Range> {
    yield* this.mem;
  }

  getOverlappingMemory(r: Range): Range[] {
    return this.ove.getOrDefault(r, []);
  }

  private updateOverlapping(a: Range, b: Range) {
    if (!this.ove.contains(a)) {
      this.ove.set(a, [b]);
    } else {
      this.ove.get(a).push(b);
    }
    if (!this.ove.contains(b)) {
      this.ove.set(b, [a]);
    } else {
      this.ove.get(b).push(a);
    }
  }
}

export class XYRange {
  /** Return the merged range of a and b */
  static merge(a: XYRange, b: XYRange): XYRange {
    const mx = Range.merge(a.x, b.x);
    const my = Range.merge(a.y, b.y);
    return new XYRange(mx.st, mx.ed, my.st, my.ed);
  }

  /** Return the overlapped range of a and b, or null */
  static overlap(a: XYRange, b: XYRange): XYRange | null {
    const ox = Range.overlap(a.x, b.x);
    const oy = Range.overlap(a.y, b.y);
    if (ox != null && oy != null) {
      return new XYRange(ox.st, ox.ed, oy.st, oy.ed);
    } else {
      return null;
    }
  }

  public x: Range;
  public y: Range;
  constructor(
    x0: number,
    x1: number,
    y0: number,
    y1: number,
  ) {
    this.x = new Range(x0, x1);
    this.y = new Range(y0, y1);
  }
}

export class XYRanges {
  private x_: Ranges;
  private y_: Ranges;
  constructor(xy: XYRange) {
    this.x_ = new Ranges(xy.x);
    this.y_ = new Ranges(xy.y);
  }

  remove(removed: XYRange): void {
    this.x_.remove(removed.x);
    this.y_.remove(removed.y);
  }

  *x(): IterableIterator<Range> {
    yield* this.x_;
  }

  *y(): IterableIterator<Range> {
    yield* this.y_;
  }
}

export class MemorizedXYRanges extends XYRanges {
  // the removed ranges, along with 
  // its overlapped ranges
  private readonly mem: XYRange[] = [];
  private readonly ove: HashMap<XYRange, XYRange[]> = new HashMap(
    'md5', (a, b) => Range.equals(a.x, b.x) && Range.equals(a.y, b.y)
  );

  remove(removed: XYRange): void {
    super.remove(removed);
    // compute overlapped, and save them
    for (const r of this.mem) {
      if (XYRange.overlap(r, removed)) {
        this.updateOverlapping(r, removed);
      }
    }
    this.mem.push(removed);
  }

  *memory(): IterableIterator<XYRange> {
    yield* this.mem;
  }

  getOverlappingMemory(r: XYRange): XYRange[] {
    return this.ove.getOrDefault(r, []);
  }

  private updateOverlapping(a: XYRange, b: XYRange) {
    if (!this.ove.contains(a)) {
      this.ove.set(a, [b]);
    } else {
      this.ove.get(a).push(b);
    }
    if (!this.ove.contains(b)) {
      this.ove.set(b, [a]);
    } else {
      this.ove.get(b).push(a);
    }
  }
}

if (import.meta.main) {
  const rg = new Ranges(new Range(0, 1080));
  rg.remove(new Range(50, 100));
  rg.remove(new Range(100, 100));
  rg.remove(new Range(100, 120));
  rg.remove(new Range(90, 130));
  rg.remove(new Range(30, 140));
  const rest: Range[] = [
    new Range(0, 30),
    new Range(140, 1080),
  ];
  let i = 0;
  for (const subRg of rg) {
    if (rest[i].st != subRg.st || rest[i].ed != subRg.ed) {
      console.log(`Failed: expect [${rest[i]}], got [${subRg}]`);
      break;
    }
    i += 1;
  }
  console.log(new Range(0, 1) == new Range(0, 1));
}