export class RangeError extends Error {}

/** SimpleRange is a immutable range starting from 
 * `start`, and ended by `end`, i.e. [start, end].
 */
export class Range {
  /** check whether a and b are crossed each other, return
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

  /** check whether a covers b, return
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

  constructor(
    public readonly st: number,
    public readonly ed: number
  ) {
    this.ranges.push(new Range(st, ed));
  }

  remove(start: number, end: number): void {
    const removed = new Range(start, end);
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

if (import.meta.main) {
  const rg = new Ranges(0, 1080);
  rg.remove(50, 100);
  rg.remove(100, 100);
  rg.remove(100, 120);
  rg.remove(90, 130);
  rg.remove(30, 140);
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
}