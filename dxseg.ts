import DxView, { Views } from './dxview.ts';
import Interval, { XYInterval } from './utils/interval.ts';
import { IllegalStateError } from './utils/error.ts';

type N<T> = T | null;

/** DxSegment is a segment that can be divided to multiple
 * segments by the sep. All segments forms a tree, and can
 * be traversed by the children and parent property. A
 * segment is accepted by default, but rejected whenever a
 * separator is set. However, when the separator is deleted,
 * one can control whether the segment is accepted or not
 * afterwards by passing an argument `accept` to #delSep() */
export default class DxSegment {
  public accepted: boolean = true;
  private parent_: N<DxSegment> = null;
  private sep_: N<DxSegSep> = null;
  constructor(
    public readonly roots: DxView[],
    public readonly level: number, // the drawing level
    public readonly x: number,
    public readonly y: number,
    public readonly w: number,
    public readonly h: number
  ) {}

  get sep(): N<DxSegSep> {
    return this.sep_;
  }

  get parent(): N<DxSegment> {
    return this.parent_;
  }

  get children(): DxSegment[] {
    const sep = this.sep;
    if (sep == null) {
      return [];
    } else if (sep instanceof DxHVESegSep) {
      return [sep.sides[0], sep.sides[1]];
    } else {
      return [sep.after];
    }
  }

  /** Set a sep, accept children, and reject self */
  setSep(sep: DxSegSep) {
    this.accepted = false;
    this.sep_ = sep;
    if (sep instanceof DxHVESegSep) {
      sep.sides[0].parent_ = this;
      sep.sides[1].parent_ = this;
      sep.sides[0].accepted = true;
      sep.sides[1].accepted = true;
    } else {
      sep.after.parent_ = this;
      sep.after.accepted = true;
    }
  }

  /** Delete the sep, accept self if `accept` */
  delSep(accept = true) {
    const sep = this.sep_;
    if (sep == null) {
      return;
    }
    if (sep instanceof DxHVESegSep) {
      sep.sides[0].parent_ = null;
      sep.sides[1].parent_ = null;
    } else {
      sep.after.parent_ = null;
    }
    this.accepted = accept;
    this.sep_ = null;
  }
}

/** Elevated/Horizontal/Vertical separator */
export class DxHVESegSep {
  constructor(
    /** Score of this sep */
    public readonly score: number,
    /** Separator direction */
    public readonly dir: 'H' | 'V' | 'E',
    /** Separator intervals, DON'T use them when dir is 'E' */
    public readonly xinv: Interval, // [x0, x1]
    public readonly yinv: Interval, // [y0, y1]
    /** Segments both sides,
     * V: [left, right], or
     * H: [top, bottom]
     */
    public readonly sides: [DxSegment, DxSegment]
  ) {}
}

/** A shrink sep means there are no
 * separators found for a segment,
 * but there are views segmented,
 * then create a new shrink segment
 * rooted by roots, and segment them
 * further
 */
export class DxShrinkSegSep {
  constructor(public readonly after: DxSegment) {}
}

/** Segment separator */
export type DxSegSep = DxHVESegSep | DxShrinkSegSep;

export class Segments {
  static create(roots: DxView[]): DxSegment {
    if (roots.length == 0) {
      throw new IllegalStateError('roots is empty');
    }
    let xy = Views.bounds(roots[0]);
    for (let i = 1; i < roots.length; i++) {
      xy = XYInterval.merge(xy, Views.bounds(roots[i]));
    }
    const seg = new DxSegment(
      roots,
      Math.max(...roots.map((v) => v.drawingLevel)),
      xy.x.low,
      xy.y.low,
      xy.x.high - xy.x.low,
      xy.y.high - xy.y.low
    );
    return seg;
  }

  static acceptsOf(s: DxSegment): DxSegment[] {
    let found: DxSegment[] = [];
    function walk(ss: DxSegment) {
      if (ss.accepted) {
        found.push(ss);
      }
      for (const cs of ss.children) {
        walk(cs);
      }
    }
    walk(s);
    return found;
  }

  static areaOf(s: DxSegment) {
    return s.w * s.h;
  }

  static drawingLevelRangeOf(s: DxSegment): [number, number] {
    const min = [];
    const max = [];
    for (const r of s.roots) {
      const next = Views.drawingLevelRangeOf(r);
      min.push(next[0]);
      max.push(next[1]);
    }
    return [Math.min(...min), Math.max(...max)];
  }

  static coverViews(s: DxSegment, vs: DxView[]) {
    const xy = Segments.bounds(s);
    for (const v of vs) {
      const c = Views.bounds(v);
      if (Interval.cover(xy.x, c.x) < 0 || Interval.cover(xy.y, c.y) < 0) {
        return false;
      }
    }
    return true;
  }

  static cover(a: DxSegment, b: DxSegment): boolean {
    return (
      Interval.cover(Segments.xx(a), Segments.xx(b)) >= 0 &&
      Interval.cover(Segments.yy(a), Segments.yy(b)) >= 0
    );
  }

  static isImportantForA11y(s: DxSegment): boolean {
    for (const r of s.roots) {
      if (Views.isViewHierarchyImportantForA11y(r)) {
        return true;
      }
    }
    return false;
  }

  static bounds(s: DxSegment): XYInterval {
    return XYInterval.of(...Segments.xxyy(s));
  }

  static xxyy(s: DxSegment): [number, number, number, number] {
    return [Segments.x0(s), Segments.x1(s), Segments.y0(s), Segments.y1(s)];
  }

  static xx(s: DxSegment): Interval {
    return Interval.of(Segments.x0(s), Segments.x1(s));
  }

  static yy(s: DxSegment): Interval {
    return Interval.of(Segments.y0(s), Segments.y1(s));
  }

  static x0(s: DxSegment): number {
    return s.x;
  }

  static x1(s: DxSegment): number {
    return s.x + s.w;
  }

  static y0(s: DxSegment): number {
    return s.y;
  }

  static y1(s: DxSegment): number {
    return s.y + s.h;
  }
}
