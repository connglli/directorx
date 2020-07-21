import DxView, { DxActivity, Views } from '../dxview.ts';
import { DevInfo } from '../dxdroid.ts';
import { XYIntervalTree } from '../utils/interval_tree.ts';
import Interval, { XYInterval, XYIntervals } from '../utils/interval.ts';
import DxLog from '../dxlog.ts';
import { CannotReachHereError } from '../utils/error.ts';

const DEFAULTS = {
  SP_OPTIMAL_COUNT: 5,      // optimal H and V separator count
  V_SZ_THRESHOLD: 0.07,     // size threshold of a sub view
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
    DIFF_NUM: 50,           // different number of views
    DIFF_CLS: 10,           // different view classes
    SAME_CLS: -50,          // same view class
    SAME_VS_PARENT: -80,    // same vertical scrollable parent
    SAME_HS_PARENT: -80,    // same horizontal scrollable parent
    DIFF_BG: 200,           // different bg classes and colors
    DIFF_BG_CLS: 50,        // different bg classes
    DIFF_BG_COLOR: 100,     // different bg colors
    SAME_BG: -80,           // same background
    BOTH_TXT: -80,          // both are text views
    DIFF_TEXT: 200,         // one side is text, the other is not
  },
  get SP_SCORE_THRESHOLD(): number {
    let minAward = Number.MAX_VALUE;
    for (const k in this.SP_SCORE_AWARD) {
      const v = (this.SP_SCORE_AWARD as {[key: string]: number})[k];
      // only check award (no punishment)
      if (v > 0 && v < minAward) {
        minAward = v;
      }
    }
    return this.SP_SCORE_BASE + minAward;
  }
};

export class UiSegError extends Error {
  constructor(msg: string) {
    super(`UiSegError: ${msg}`);
  }
}

/** DxSegment */
export type DxSegment = {
  roots: DxView[];
  // the drawing level
  level: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Segment separator */
export type DxSegSep = {
  /** Score of this sep */
  score: number;
  /** Separator direction */
  dir: 'H' | 'V' | 'E';
  /** Separator intervals, DON'T use them when dir is 'E' */
  xinv: Interval; // [x0, x1]
  yinv: Interval; // [y0, y1]
  /** Segments both sides, 
   * V: [left, right], or
   * H: [top, bottom]
   */
  sides: [DxSegment, DxSegment];
};

export class Segments {
  static adjust(
    roots: DxView[]
  ): DxSegment {
    if (roots.length == 0) {
      throw new UiSegError('roots is empty');
    }
    let xy = Views.bounds(roots[0]);
    for (let i = 1; i < roots.length; i ++) {
      xy = XYInterval.merge(xy, Views.bounds(roots[i]));
    }
    return {
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
  /** If the view is not informative (has no children, and 
   * provides no useful information), skip this view
   */
  ({ v }) => !Views.isInformative(v) ? 's' : '-',
  /** If the view has no children, don't divide this view */
  ({ v }) => v.children.length == 0 ? 'n' : '-',
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
  /** If the view is the *only* root of a segment, divide 
   * the view
   */
  ({v, s}) => s.roots.indexOf(v) != -1 && s.roots.length == 1 ? 'y' : '-',
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
      ((Views.areaOf(v) < Segments.areaOf(s) * DEFAULTS.V_SZ_THRESHOLD) &&
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
    return max < Segments.areaOf(s) * DEFAULTS.V_SZ_THRESHOLD 
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
    score += AWARD.DIFF_NUM;
  }
  // a better sep can separate diverse views
  for(const a of s1) {
    for(const b of s2) {
      // same class? very much bad
      if (a.cls == b.cls) {
        score += AWARD.SAME_CLS;
      } else {
        score += AWARD.DIFF_CLS;
      }
      // same scrollable parent? no
      {
        let scrollParent = a.findVScrollableParent();
        if (scrollParent != null && scrollParent == b.findVScrollableParent()) {
          score += AWARD.SAME_VS_PARENT;
        }
        scrollParent = a.findHScrollableParent();
        if (scrollParent != null && scrollParent == b.findHScrollableParent()) {
          score += AWARD.SAME_HS_PARENT;
        }
      }
      // thee diverse the background, the better
      if (a.bgClass != b.bgClass && a.bgColor != b.bgColor) {
        score += AWARD.DIFF_BG;
      } else if (a.bgClass != b.bgClass) {
        score += AWARD.DIFF_BG_CLS;
      } else if (a.bgColor != b.bgColor) {
        score += AWARD.DIFF_BG_COLOR;
      } else {
        score += AWARD.SAME_BG;
      }
      // both a are text views
      {
        const aIsText = Views.isText(a);
        const bIsText = Views.isText(b);
        if (aIsText && bIsText) {
          score += AWARD.BOTH_TXT;
        } else if (aIsText != bIsText) {
          score += AWARD.DIFF_TEXT;
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
function segSeg(seg: DxSegment, dev: DevInfo): DxSegSep | null {
  // divide views, put non-division to a pool
  const pool: DxView[] = [];
  for (const r of seg.roots) {
    segView(r, seg, pool, dev);
  }

  // find the separators for these views
  const [eSep, hSep, vSep] = findSepForSeg(seg, pool);

  // no separators, means this segment is minimum
  if (eSep.length == 0 && hSep.length == 0 && vSep.length == 0) {
    return null;
  }

  // if there are eseps, only take care of eseps
  if (eSep.length != 0) {
    let best = Number.MIN_SAFE_INTEGER;
    let bestSep: ESepInterval | null = null;
    for (const sep of eSep) {
      const score = scoreESep(sep, seg);
      if (score > best) {
        best = score;
        bestSep = sep;
      }
    }
    const [s1, s2] = findEBothSides(bestSep!, seg, pool); // eslint-disable-line
    return {
      score: best,
      dir: 'E',
      xinv: Interval.INF,
      yinv: Interval.INF,
      sides: [
        Segments.adjust(s1),
        Segments.adjust(s2)
      ],
    };
  }

  // calculate scores for each hsep and rsep
  let best = Number.MIN_SAFE_INTEGER;
  let bestSep: HVSepInterval | null = null;
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
  const sides: [DxSegment, DxSegment] = [Segments.adjust(s1), Segments.adjust(s2)];
  return {
    /* eslint-disable */
    score: best,
    dir: bestSepDir,
    xinv: bestSep![0],
    yinv: bestSep![1], 
    sides
  };
}

/** Segment the Ui and return the segments and separators */
export default function segUi(a: DxActivity, dev: DevInfo): [DxSegment[], DxSegSep[]] {
  const decor = a.decorView!; // eslint-disable-line
  const segments: DxSegment[] = [];
  const separators: DxSegSep[] = [];
  const queue: DxSegment[] = [Segments.adjust([decor])];
  let hvSepCount = 0;
  while (queue.length != 0) {
    DxLog.debug('New Iteration');
    const seg = queue.shift()!;
    const sep = segSeg(seg, dev);
    // for elevated separator, directly recognize it as a valid separator,
    // for horizontal/vertical separators, recognize them if and only if 
    // their scores are larger than the predefined threshold, or stop
    // segment this segment further
    if (
      (sep == null) || // cannot segment further
      (sep.dir != 'E' && sep.score < DEFAULTS.SP_SCORE_THRESHOLD) || // 'H' or 'V', but score is too low
      (sep.dir != 'E' && hvSepCount > DEFAULTS.SP_OPTIMAL_COUNT) // 'H' or 'V', but count is already optimal
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
  return [segments, separators];
}