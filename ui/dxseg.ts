import DxView, { Views, ViewFinder } from './dxview.ts';
import Interval, { XYInterval } from '../utils/interval.ts';
import { IllegalStateError } from '../utils/error.ts';
import ArrayTreeOp, { ArrayTreeNode } from '../utils/array_tree_op.ts';

type N<T> = T | null;

/** DxSegment is a segment that can be divided to multiple
 * segments by the sep. All segments forms a tree, and can
 * be traversed by the children and parent property. A
 * segment is accepted by default, but rejected whenever a
 * separator is set. However, when the separator is deleted,
 * one can control whether the segment is accepted or not
 * afterwards by passing an argument `accept` to #delSep() */
export default class DxSegment implements ArrayTreeNode<DxSegment> {
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

  get siblings(): DxSegment[] {
    return (this.parent?.children ?? []).filter((c) => c != this);
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

/** A shrink sep means there are no separators found for a
 * segment, but there are views segmented, then create a
 * new shrink segment rooted by roots, and segment them
 * further
 */
export class DxShrinkSegSep {
  constructor(public readonly after: DxSegment) {}
}

/** Segment separator */
export type DxSegSep = DxHVESegSep | DxShrinkSegSep;

/** Utility class to compute some segment properties */
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

/** Utility to find views/segments on segment */
export class SegmentFinder extends ArrayTreeOp {
  /** Find all accepted segments */
  static findAccepts(s: DxSegment): DxSegment[] {
    return SegmentFinder.find(s, (c) => c.accepted);
  }

  /** Find the first view that matches the predicate */
  static findView(s: DxSegment, pred: (v: DxView) => boolean): N<DxView> {
    let found: N<DxView> = null;
    for (const r of s.roots) {
      found = ViewFinder.findFirst(r, pred);
      if (found) {
        return found;
      }
    }
    return found;
  }

  /** Find all views that match the predicate */
  static findViews(s: DxSegment, pred: (v: DxView) => boolean): DxView[] {
    let found: DxView[] = [];
    for (const r of s.roots) {
      found.push(...ViewFinder.find(r, pred));
    }
    return found;
  }

  /** Find the first met view with text t */
  static findViewByText(s: DxSegment, text: string): N<DxView> {
    return SegmentFinder.findView(s, (w) => w.text == text);
  }

  /** Find the first met view with desc t */
  static findViewByDesc(s: DxSegment, desc: string): N<DxView> {
    return SegmentFinder.findView(s, (w) => w.desc == desc);
  }

  /** Find the first met view with resource type and entry */
  static findViewByResource(
    s: DxSegment,
    type: string,
    entry: string
  ): N<DxView> {
    return SegmentFinder.findView(
      s,
      (w) => w.resType == type && w.resEntry == entry
    );
  }
}

/** Utility to find views/segments on segment bottom-up,
 * i.e., find in self, then siblings, then parent, then
 * parent's siblings, then ...
 */
export class SegmentBottomUpFinder {
  /** Find in the first view that satisfy the predicate  */
  static findView(s: DxSegment, pred: (v: DxView) => boolean): N<DxView> {
    let checked = new Set<DxView>();
    let realPred = (v: DxView) => {
      if (checked.has(v)) {
        return false;
      }
      const ret = pred(v);
      checked.add(v);
      return ret;
    };

    function doFind(c: DxSegment): N<DxView> {
      let found: N<DxView> = SegmentFinder.findView(c, realPred);
      if (found) {
        return found;
      }
      for (const sib of c.siblings) {
        found = SegmentFinder.findView(sib, realPred);
        if (found) {
          return found;
        }
      }
      if (c.parent) {
        found = doFind(c.parent);
      }
      return found;
    }

    return doFind(s);
  }

  /** Find the first met view with text */
  static findViewByText(s: DxSegment, text: string): N<DxView> {
    return SegmentBottomUpFinder.findView(s, (w) => w.text == text);
  }

  /** Find the first met view with desc */
  static findViewByDesc(s: DxSegment, desc: string): N<DxView> {
    return SegmentBottomUpFinder.findView(s, (w) => w.desc == desc);
  }

  /** Find the first met view with id */
  static findViewById(s: DxSegment, id: string): N<DxView> {
    return SegmentBottomUpFinder.findView(s, (w) => w.id == id);
  }

  /** Find the first met view with resource type and entry */
  static findViewByResource(
    s: DxSegment,
    type: string,
    entry: string
  ): N<DxView> {
    return SegmentBottomUpFinder.findView(
      s,
      (w) => w.resType == type && w.resEntry == entry
    );
  }
}
