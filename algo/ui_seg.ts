import DxView, { DxActivity, Views } from '../dxview.ts';
import { DevInfo } from '../dxdroid.ts';
import { XYIntervalTree } from '../utils/interval_tree.ts';
import Interval, { XYInterval, XYIntervals } from '../utils/interval.ts';
import DxLog from '../dxlog.ts';
import { CannotReachHereError } from '../utils/error.ts';

type N<T> = T | null;

const DEFAULTS = {
  SP_OPTIMAL_COUNT: 5,      // optimal H and V separator count
  THRESHOLD: {
    V_IN_SCR: 0.04,         // size threshold of a view in screen
    V_IN_SEG: 0.75          // size threshold of a view in segment
  },
  // The recommended separator size, by default, this
  // value is set to 30px, and this is the value set
  // default by Bootstrap, see also Bootstrap "Grid options"
  // https://getbootstrap.com/docs/4.0/layout/grid/#grid-options
  SP_SZ_RECOMMENDED: 30,
  SP_E_RECOMMENDED: 15,     // recommended number of views for a E sep
  SP_E_RECOMMENDED_DIFF: 5, // recommended number of different views for a E sep
  SP_SCORE_BASE: 100,       // base score for a separator
  SP_SCORE_AWARD: {
    SZ_BEST: 120,           // best score for separator size
    NUM: 50,                // different number of views
    CLS: 10,                // different view classes
    VS_PARENT: 80,          // same vertical scrollable parent
    HS_PARENT: 80,          // same horizontal scrollable parent
    BG: 500,                // different bg classes and colors
    BG_CLS: 200,            // different bg classes
    BG_COLOR: 250,          // different bg colors
    INFO: 50,               // same informative level
    TEXT: 200,              // one side is text, the other is not
  },
  get SP_SCORE_THRESHOLD(): number {
    let min1Award = Number.MAX_VALUE;
    let min2Award = Number.MAX_VALUE;
    for (const k in this.SP_SCORE_AWARD) {
      const v = (this.SP_SCORE_AWARD as {[key: string]: number})[k];
      // only check award (no punishment)
      if (v < min1Award) {
        min2Award = min1Award;
        min1Award = v;
      } else if (v < min2Award) {
        min2Award = v;
      }
    }
    return this.SP_SCORE_BASE + min1Award + min2Award;
  }
};

export class UiSegError extends Error {
  constructor(msg: string) {
    super(`UiSegError: ${msg}`);
  }
}

/** DxSegment */
export type DxSegment = {
  parent: N<DxSegment>;
  roots: DxView[];
  // the drawing level
  level: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Segment separator */
export interface DxSegSep {}

/** Elevated/Horizontal/Vertical separator */
export class DxHVESegSep implements DxSegSep {
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
class DxShrinkSegSep implements DxSegSep {
  constructor(
    public readonly before: DxSegment, 
    public readonly after: DxSegment
  ) {}
}

export class Segments {
  static create(
    roots: DxView[],
    parent: N<DxSegment>
  ): DxSegment {
    if (roots.length == 0) {
      throw new UiSegError('roots is empty');
    }
    let xy = Views.bounds(roots[0]);
    for (let i = 1; i < roots.length; i ++) {
      xy = XYInterval.merge(xy, Views.bounds(roots[i]));
    }
    return {
      parent: parent,
      roots: roots,
      level: Math.max(...roots.map(v => v.drawingLevel)),
      x: xy.x.low,
      y: xy.y.low,
      w: xy.x.high - xy.x.low,
      h: xy.y.high - xy.y.low,
    };
  }

  static areaOf(s: DxSegment) {
    return s.w * s.h;
  }

  static drawingLevelRange(s: DxSegment): [number, number] {
    const min = [];
    const max = [];
    for (const r of s.roots) {
      const next = Views.drawingLevelRange(r);
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
    return Interval.cover(Segments.xx(a), Segments.xx(b)) >= 0 
      && Interval.cover(Segments.yy(a), Segments.yy(b)) >= 0;
  }

  static isAccImportant(s: DxSegment): boolean {
    for (const r of s.roots) {
      if (Views.isViewHierarchyAccImportant(r)) {
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

/** Context for testing a view */
type RuleContext = {
  v: DxView;    // the view to be checked
  s: DxSegment; // the segment v resides
  p: DxView[];  // the pool including all views that don't divide
  d: DevInfo;   // the device information
}

/** Each rule is a predicate indicating whether
 * to divide this view ('y'), not to divide ('n'), 
 * skip this view ('s'), or don't know ('-', meaning
 * test next rules)
 */
type Rule = (c: RuleContext) => 'y' | 'n' | 's' | '-';

/** Array of rules used, with index as their priority
 * (the larger the index, the lower the priority). 
 * All rules are ported from the VIPS algorithm, see also 
 * `VIPS: a Vision-based Page Segmentation Algorithm`
 */
const rules: Rule[] = [ // /* eslint-disable */
  /** If the view is navigation/status bar, then skip it */
  ({ v }) => Views.isNavBar(v) || Views.isStatusBar(v) ? 's' : '-',
  /** If the view is invisible skip it */
  ({ v, d }) => !Views.isVisibleToUser(v, d) ? 's' : '-',
  /** If the view is invalid, skip it */
  ({ v }) => !Views.isValid(v) ? 's' : '-',
  /** If the view has no children, and is not informative 
   * (provides no useful information), and not important for
   * accessibility, skip this view
   */
  ({ v }) => (
    v.children.length == 0 && 
    Views.informativeLevel(v) == 0 &&
    !Views.isViewAccImportant(v)
  ) ? 's' : '-',
  /** If the view is very informative (providing sufficient
   * information), then don't divide this view
   */
  ({ v }) => Views.informativeLevel(v) >= 2 ? 'n' : '-',
  /** If the view has no children, and important for
   * accessibility or a text view, then don't divide this view
    */
  ({ v }) => (
    v.children.length == 0 && 
    (Views.isViewAccImportant(v) || Views.isText(v))
  ) ? 'n' : '-',
  /** If the view has no children, skip this view */
  ({ v }) => v.children.length == 0 ? 's' : '-',
  /** If the view is a not text view, and it has no valid
   * child view, then this view cannot be divided and will
   * be cut
   */
  ({ v }) => (!Views.isText(v) && !Views.hasValidChild(v)) ? 's' : '-',
  /** If the view has only one valid child and the child is 
   * not a text view, then divide this view
   */
  ({ v }) => {
    const valid = v.children.filter(c => Views.isValid(c));
    if (valid.length == 1 && !Views.isText(valid[0])) {
      return 'y';
    }
    return '-';
  },
  /** If the view has many similar layout children (the layout 
   * similarity is determined by bfs the view hierarchy class 
   * and informative level, but consider only 2 further depth), 
   * don't divide this view */
  ({ v }) => {
    // it's difficult to determine when too less
    if (v.children.length <= 3) {
      return '-';
    }
    const set = new Set<string>();
    for (const cv of v.children) {
      set.add(Views.layoutSummary(cv, 3));
    }
    // tolerate 1-2 different layout
    const diff = set.size - 1;
    const same = v.children.length - diff;
    return (same > diff && diff <= 2) ? 'n' : '-';
  },
  /** If the view is the *only* root of a segment, divide 
   * the view
   */
  ({v, s}) => s.roots.indexOf(v) != -1 && s.roots.length == 1 ? 'y' : '-',
  /** If the view is less than the size threshold,
   * then don't divide this view
   */
  ({ v, s, d }) => (
    Views.areaOf(v) < d.width * d.height * DEFAULTS.THRESHOLD.V_IN_SCR
  ) ? 'n' : '-',
  /** If sum of all the children's size is greater than 
   * this view's size, then divide this view
   */
  ({ v }) => {
    const sum = v.children.reduce((s, c) => s + Views.areaOf(c), 0);
    return (sum > Views.areaOf(v)) ? 'y' : '-';
  },
  /** If background color of this view is different from 
   * one of its children's, divide this view, and at the 
   * same time, the child with different background color 
   * will not be divided in this round
   */
  ({ v }) => {
    // TODO iteration
    const diff = v.children.filter(c => { 
      // ATTENTION: 'cause ripple is often used in animation,
      // we treat ripple as inherited
      if (v.bgClass == 'ColorDrawable' && c.bgClass == 'RippleDrawable') {
        return false;
      } else {
        return c.bgClass != v.bgClass || c.bgColor != v.bgColor;
      }
    });
    return diff.length > 0 ? 'y' : '-';
  },
  /** If the view has at least one text child, and the 
   * view's size is smaller than the threshold, the don't 
   * divide this view
   */
  ({v, s}) => {
    // TODO relative size
    return (
      ((Views.areaOf(v) < Segments.areaOf(s) * DEFAULTS.THRESHOLD.V_IN_SEG) &&
        (v.children.some((c) => Views.isText(c)))) ? 'n' : '-'
    );
  },
  /** If the child with maximum size of the view is smaller than
   * the threshold, don't divide the view
   */
  ({v, s}) => {
    const max = v.children.reduce((max, c) => {
      const area = Views.areaOf(c);
      return area > max ? area : max;
    }, -1);
    return max < Segments.areaOf(s) * DEFAULTS.THRESHOLD.V_IN_SEG
      ? 'n' : '-';
  },
  /** If previous siblings has not been divided, don't divide 
   * this view */
  ({ v, p }) => {
    const siblings = Views.siblings(v, true);
    if (siblings.indexOf(v) == 0) {
      return '-';
    }
    for (const s of siblings) {
      // only check previous siblings
      if (s == v) {
        break;
      } else if (p.indexOf(s) == -1) {
        return '-';
      }
    }
    return 'n';
  },
  /** Prefer not to divide a node */
  _ => 'n' // eslint-disable-line
];

/** Segment a view (of a segment) according to the predefined rules */
function segView(v: DxView, seg: DxSegment, pool: DxView[], dev: DevInfo) {
  const ctx = { v, s: seg, p: pool, d: dev };
  for (const r of rules) {
    switch (r(ctx)) {
    case 'y': // divide, recursively to its children
      for (const c of v.children) {
        segView(c, seg, pool, dev);
      }
      return;
    case 'n': // don't divide, put to pool, and return
      pool.push(v);
      return;
    case '-':
      continue;
    case 's': // directly skip this view
      return;
    }
  }
  throw new CannotReachHereError('The last rule should be always divide or don\'t');
}

// [(x0, x1), (y0, y1)]
type HVSepInterval = [Interval, Interval]; 
// [a view pool in same drawing level, 
//  a view pool overlapped with the first pool]
type ESepInterval = [DxView[], DxView[]];

// Find and calculate the separator (elevated, horizontal, vertical) intervals
// for a segment along with its pool
function findSepForSeg(
  seg: DxSegment, 
  pool: DxView[]
): [ESepInterval[], HVSepInterval[], HVSepInterval[]] {
  const segInv = Segments.bounds(seg)
  const rest = new XYIntervals(segInv);
  const tree = new XYIntervalTree<DxView|null>();
  tree.insert(segInv, null);
  for (const v of pool) {
    const bounds = Views.bounds(v);
    tree.insert(bounds, v);
    rest.remove(bounds);
  }
  // eSep are recognized by overlapped regions, 
  // they must belong to different drawing levels
  const eSep: ESepInterval[] = [];
  for (const v of pool) {
    const ove = tree.query(Views.bounds(v))
      .map(([, w]) => w)
      .filter(w => w != null && w != v) as DxView[];
    if (ove.length != 0) {
      eSep.push([pool.filter(w => w.drawingLevel == v.drawingLevel), ove]);
    }
  }
  // vSep are rest x intervals after removing
  const vSep: HVSepInterval[] = [];
  for (const inv of rest.x()) {
    // segment boundary is not a valid separator
    if (inv.low == Segments.x0(seg) || inv.high == Segments.x1(seg)) {
      continue;
    }
    vSep.push([inv, Interval.of(Segments.y0(seg), Segments.y1(seg))]);
  }
  // hSep are rest y intervals after removing
  const hSep: HVSepInterval[] = [];
  for (const inv of rest.y()) {
    // segment boundary is not a valid separator
    if (inv.low == Segments.y0(seg) || inv.high == Segments.y1(seg)) {
      continue;
    }
    hSep.push([Interval.of(Segments.x0(seg), Segments.x1(seg)), inv]);
  }
  return [eSep, hSep, vSep];
}

// Find both-side neighbor views of a separator
function findHVSepNeighbors(
  inv: [Interval, Interval], 
  dir: 'V' | 'H', 
  pool: DxView[]
): [DxView[], DxView[]] {
  const s1: DxView[] = [];
  const s2: DxView[] = [];
  if (dir == 'H') {
    const top = inv[1].low;
    const bottom = inv[1].high;
    for (const v of pool) {
      if (top == Views.y1(v)) {
        s1.push(v);
      } else if (bottom == Views.y0(v)) {
        s2.push(v);
      }
    }
  } else {
    const left = inv[0].low;
    const right = inv[0].high;
    for (const v of pool) {
      if (left == Views.x1(v)) {
        s1.push(v);
      } else if (right == Views.x0(v)) {
        s2.push(v);
      }
    }
  }
  if (s1.length == 0 || s2.length == 0) {
    throw new UiSegError(`Does not find neighbor views for separator |x:${inv[0]};y:${inv[1]}|`);
  }
  return [s1, s2];
}

// Find both-side views of a hv separator, return
// [left, right] for v separator
// [top, bottom] for h separator
function findHVBothSides(
  inv: [Interval, Interval], 
  dir: 'V' | 'H', 
  pool: DxView[]
): [DxView[], DxView[]] {
  const s1: DxView[] = [];
  const s2: DxView[] = [];
  if (dir == 'H') {
    const top = inv[1].low;
    const bottom = inv[1].high;
    for (const v of pool) {
      if (top >= Views.y1(v)) {
        s1.push(v);
      } else if (bottom <= Views.y0(v)) {
        s2.push(v);
      }
    }
  } else {
    const left = inv[0].low;
    const right = inv[0].high;
    for (const v of pool) {
      if (left >= Views.x1(v)) {
        s1.push(v);
      } else if (right <= Views.x0(v)) {
        s2.push(v);
      }
    }
  }
  if (s1.length == 0 || s2.length == 0) {
    throw new UiSegError(`Does not find views for separator |x:${inv[0]};y:${inv[1]}|`);
  }
  return [s1, s2];
}

// Find both-side views of a e separator, return
// [sameLevel, allOthers] for e separator
function findEBothSides(
  sep: ESepInterval,
  seg: DxSegment,
  pool: DxView[]
): [DxView[], DxView[]] {
  // sep[0] are always in the same level, put all 
  // views not in sep[0] to the other side
  return [sep[0], pool.filter(v => sep[0].indexOf(v) == -1)];
}

// Score a hv separator
function scoreHVSep(
  sep: HVSepInterval, 
  dir: 'V' | 'H',
  seg: DxSegment,
  s1: DxView[], 
  s2: DxView[]
): number {
  const {
    SP_SCORE_BASE,
    SP_SZ_RECOMMENDED,
    SP_SCORE_AWARD: AWARD,
  } = DEFAULTS;
  let score = SP_SCORE_BASE;
  // a better separator is wider
  if (dir == 'V') {
    score += Math.min((sep[0].high - sep[0].low + 1) / SP_SZ_RECOMMENDED * 100, AWARD.SZ_BEST);
  } else {
    score += Math.min((sep[1].high - sep[1].low + 1) / SP_SZ_RECOMMENDED * 100, AWARD.SZ_BEST);
  }
  // a better sep can separate more views
  if (s1.length != s2.length) {
    score += AWARD.NUM;
  }
  // a better sep can separate diverse views
  for (const a of s1) {
    for (const b of s2) {
      // different class is better
      if (a.cls != b.cls) {
        score += AWARD.CLS;
      }
      // different scrollable parent is better
      {
        let scrollParent = a.findVScrollableParent();
        if (scrollParent != null && scrollParent != b.findVScrollableParent()) {
          score += AWARD.VS_PARENT;
        }
        scrollParent = a.findHScrollableParent();
        if (scrollParent != null && scrollParent != b.findHScrollableParent()) {
          score += AWARD.HS_PARENT;
        }
      }
      // different background is better
      if (a.bgClass != b.bgClass && a.bgColor != b.bgColor) {
        score += AWARD.BG;
      } else if (a.bgClass != b.bgClass) {
        score += AWARD.BG_CLS;
      } else if (a.bgColor != b.bgColor) {
        score += AWARD.BG_COLOR;
      }
      // different informative is better
      {
        const aIsText = Views.isText(a);
        const bIsText = Views.isText(b);
        if (aIsText != bIsText) {
          score += AWARD.TEXT;
          score += AWARD.INFO;
        } else if (Views.informativeLevel(a) != Views.informativeLevel(b)) {
          score += AWARD.INFO;
        }
      }
    }
  }
  return score;
}

// Score a e separator
function scoreESep(
  sep: ESepInterval, 
  seg: DxSegment // eslint-disable-line
): number { 
  let score = DEFAULTS.SP_SCORE_BASE;
  score += Math.min((sep[0].length + sep[1].length) / DEFAULTS.SP_E_RECOMMENDED, 1) * 100;
  score += Math.min(Math.abs(sep[0].length - sep[1].length) / DEFAULTS.SP_E_RECOMMENDED_DIFF, 1) * 100;
  return score;
}

/** Segment a segment to two sub-segments */
function segSeg(seg: DxSegment, dev: DevInfo): N<DxShrinkSegSep | DxHVESegSep> {
  // divide views, put non-division to a pool
  const pool: DxView[] = [];
  for (const r of seg.roots) {
    segView(r, seg, pool, dev);
  }

  // find the separators for these views
  const [eSep, hSep, vSep] = findSepForSeg(seg, pool);

  // no separators found
  if (eSep.length == 0 && hSep.length == 0 && vSep.length == 0) {
    // there are views that are not in root,
    // this means there are views that are segmented,
    // then return a specific shrink separator
    if (pool.some(v => seg.roots.indexOf(v) == -1)) {
      return new DxShrinkSegSep(seg, Segments.create(pool, seg));
    } 
    // all views in pool are in roots, meaning this
    // segment is minimum and can no longer segmented
    else {
      return null;
    }
  }

  // if there are eseps, only take care of eseps
  if (eSep.length != 0) {
    let best = Number.MIN_SAFE_INTEGER;
    let bestSep: N<ESepInterval> = null;
    for (const sep of eSep) {
      const score = scoreESep(sep, seg);
      if (score > best) {
        best = score;
        bestSep = sep;
      }
    }
    const [s1, s2] = findEBothSides(bestSep!, seg, pool); // eslint-disable-line
    return new DxHVESegSep(
      best,
      'E',
      Interval.INF,
      Interval.INF,
      [
        Segments.create(s1, seg),
        Segments.create(s2, seg)
      ],
    );
  }

  // calculate scores for each hsep and rsep
  let best = Number.MIN_SAFE_INTEGER;
  let bestSep: N<HVSepInterval> = null;
  let bestSepDir: 'H' | 'V' = 'H';

  for (const sep of vSep) {
    const score = scoreHVSep(sep, 'V', seg, ...findHVSepNeighbors(sep, 'V', pool));
    // for same score, we always select the first one
    if (score > best) {
      best = score;
      bestSep = sep;
      bestSepDir = 'V';
    }
  }
  for (const sep of hSep) {
    const score = scoreHVSep(sep, 'H', seg,...findHVSepNeighbors(sep, 'H', pool));
    // for same score, we always select the first one
    if (score > best) {
      best = score;
      bestSep = sep;
      bestSepDir = 'H';
    }
  }

  // construct seg for separator
  const [s1, s2] = findHVBothSides(bestSep!, bestSepDir, pool); // eslint-disable-line
  return new DxHVESegSep(
    /* eslint-disable */
    best,
    bestSepDir,
    bestSep![0],
    bestSep![1], 
    [
      Segments.create(s1, seg), 
      Segments.create(s2, seg)
    ]
  );
}

/** Segment the Ui and return the segments and separators */
export default function segUi(a: DxActivity, dev: DevInfo): [DxSegment[], DxSegSep[]] {
  // firstly, we segment the ui but reserve the low-level
  // overlapped segments, 'cause it is often difficult and 
  // time-consuming to fully delete them safely 
  const decor = a.decorView!; // eslint-disable-line
  let segments: DxSegment[] = [];
  const separators: DxSegSep[] = [];
  const queue: DxSegment[] = [Segments.create([decor], null)];
  let hvSepCount = 0;
  while (queue.length != 0) {
    DxLog.debug('New Iteration');
    const seg = queue.shift()!;
    const sep = segSeg(seg, dev);
    // for shrink separator, create new segment and segment further,
    // for elevated separator, directly recognize it as a valid separator,
    // for horizontal/vertical separators, recognize them if and only if 
    // their scores are larger than the predefined threshold, or stop
    // segment this segment further
    if (sep instanceof DxShrinkSegSep) { // shrink and push to queue head
      queue.unshift(sep.after);
      separators.push(sep);
      DxLog.debug(`++ accept S xxyy=${Segments.xxyy(seg)} level=${seg.level}`);
    } else if (
      (sep == null) || // cannot segment further
      (sep.dir != 'E' && sep.score < DEFAULTS.SP_SCORE_THRESHOLD) || // 'H' or 'V', but score is too low
      (sep.dir != 'E' && hvSepCount >= DEFAULTS.SP_OPTIMAL_COUNT) // 'H' or 'V', but count is already optimal
    ) { 
      if (sep != null) {
        DxLog.debug(`-- decline ${sep.dir} ${sep.score} xxyy=[${sep.xinv.low};${sep.xinv.high};${sep.yinv.low};${sep.yinv.high}]`);
      }
      segments.push(seg);
    } else {
      queue.push(sep.sides[0], sep.sides[1]);
      separators.push(sep);
      if (sep.dir != 'E') {
        hvSepCount += 1;
      }
      DxLog.debug(`++ accept ${sep.dir} ${sep.score} xxyy=[${sep.xinv.low};${sep.xinv.high};${sep.yinv.low};${sep.yinv.high}]`);
    }
  }
  // secondly, we delete the low-level and overlapped
  // segments by their important for accessibility, 
  // 'cause low-level and overlapped segments are often
  // not important for accessibility (a better method
  // deletes the low-level overlapped segments by the
  // drawing level, however, the drawing level algorithm
  // of Android Studio Dynamic Layout Inspector is 
  // different from that of the drawing mechanism of
  // android itself, 'cause the actually drawing is
  // sometimes defined and controlled by the developers)
  segments = segments.filter(Segments.isAccImportant);
  if (false) {
    // secondly, we delete the low-level and overlapped
    // segments by their drawing levels
    const tree = new XYIntervalTree<DxSegment>();
    segments.forEach(s => tree.insert(Segments.bounds(s), s));
    segments = segments.filter(s => {
      const ove = tree.query(Segments.bounds(s))
        .map(([, o]) => o)
        .filter(o => o != s);
      // no overlapping
      if (ove.length != 0) {
        return true;
      }
      const min = Math.min(...[s.level, ...ove.map(o => o.level)]);
      const max = Math.max(...[s.level, ...ove.map(o => o.level)]);
      // v is not the low-level or is the max level
      if (min != s.level || max == s.level) {
        return true;
      }
      const inv = new XYIntervals(Segments.bounds(s));
      for (const o of ove) {
        inv.remove(Segments.bounds(o));
      }
      let vIsCovered = true;
      for (const j of inv.x()) {
        if (j.low != j.high) {
          vIsCovered = false;
          break;
        }
      }
      for (const j of inv.y()) {
        if (j.low != j.high) {
          vIsCovered = false;
          break;
        }
      }
      return !vIsCovered;
    });
  }
  return [segments, separators];
}