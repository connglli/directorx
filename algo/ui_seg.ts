import { Range, XYRange, MemorizedXYRanges } from '../utils/ranges.ts';
import DxView, { DxActivity } from '../dxview.ts';
import DxDroid from '../dxdroid.ts';
import DxLog from '../dxlog.ts';
import { CannotReachHereError } from '../utils/error.ts';

const DEFAULTS = {
  V_SZ_THRESHOLD: 0.07,
  // The recommended separator size, by default, this
  // value is set to 30px, and this is the value set
  // default by Bootstrap, see also Bootstrap "Grid options"
  // https://getbootstrap.com/docs/4.0/layout/grid/#grid-options
  SP_SZ_RECOMMENDED: 30,
  SP_E_RECOMMENDED: 15,
  SP_SCORE_BASE: 100,
  SP_SCORE_AWARD: {
    SZ_BEST: 120,        // best score for separator size
    DIFF_NUM: 50,        // different number of views
    DIFF_CLS: 10,        // different view classes
    SAME_CLS: -50,       // same view class
    SAME_VS_PARENT: -80, // same vertical scrollable parent
    SAME_HS_PARENT: -80, // same horizontal scrollable parent
    DIFF_BG: 200,        // different bg classes and colors
    DIFF_BG_CLS: 50,     // different bg classes
    DIFF_BG_COLOR: 100,  // different bg colors
    SAME_BG: -80,        // same background
    BOTH_TXT: -80,       // both are text views
    DIFF_TEXT: 200,      // one side is text, the other is not
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
  roots: DxView[],
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
  /** Separator ranges, DON'T use them when dir is 'E' */
  xrg: Range; // [x0, x1]
  yrg: Range; // [y0, y1]
  /** Segments both sides, 
   * V: [left, right], or
   * H: [top, bottom]
   */
  sides: [DxSegment, DxSegment];
};

class Views {
  static isStatusBar(v: DxView): boolean {
    return v.resId == 'android:id/statusBarBackground';
  }

  static isNavBar(v: DxView): boolean {
    return v.resId == 'android:id/navigationBarBackground';
  }

  static isText(v: DxView): boolean {
    return v.text.length != 0;
  }

  static isValid(v: DxView): boolean {
    return v.width != 0 && v.height != 0;
  }

  static isVisibleToUser(v: DxView): boolean {
    if (v.flags.V != 'V') {
      return false;
    }
    const { width, height } = DxDroid.get().dev;
    const wx = new Range(0, width);
    const wy = new Range(0, height);
    const vx = new Range(Views.x0(v), Views.x1(v));
    const vy = new Range(Views.y0(v), Views.y1(v));
    const x = Range.cover(wx, vx) >= 0 
      || Range.cross(wx, vx) >= 0;
    const y = Range.cover(wy, vy) >= 0 
      || Range.cross(wy, vy) >= 0;
    return x && y;
  }

  static hasValidChild(v: DxView): boolean {
    return v.children.some(c => this.isValid(c));
  }

  static areaOf(v: DxView): number {
    return v.width * v.height;
  }

  static siblings(v: DxView, self = false): DxView[] {
    if (self) {
      return v.parent?.children ?? [];
    } else {
      return v.parent?.children.filter(c => c != v) ?? [];
    }
  }

  static xxyy(v: DxView): [number, number, number, number] {
    return [Views.x0(v), Views.x1(v), Views.y0(v), Views.y1(v)];
  }

  static x0(v: DxView): number {
    return v.drawingX;
  }

  static x1(v: DxView): number {
    return v.drawingX + v.width;
  }

  static y0(v: DxView): number {
    return v.drawingY;
  }

  static y1(v: DxView): number {
    return v.drawingY + v.height;
  }
}

class Segments {
  static adjust(
    roots: DxView[]
  ): DxSegment {
    if (roots.length == 0) {
      throw new UiSegError('roots is empty');
    }
    let xy = new XYRange(...Views.xxyy(roots[0]));
    for (let i = 1; i < roots.length; i ++) {
      xy = XYRange.merge(xy, new XYRange(...Views.xxyy(roots[i])));
    }
    return {
      roots: roots,
      x: xy.x.st,
      y: xy.y.st,
      w: xy.x.ed - xy.x.st,
      h: xy.y.ed - xy.y.st
    };
  }

  static areaOf(s: DxSegment) {
    return s.w * s.h;
  }

  static coverAll(s: DxSegment, vs: DxView[]) {
    const xy = new XYRange(...Segments.xxyy(s));
    for (const v of vs) {
      const c = new XYRange(...Views.xxyy(v));
      if (Range.cover(xy.x, c.x) < 0 || Range.cover(xy.y, c.y) < 0) {
        return false;
      }
    }
    return true;
  }

  static xxyy(s: DxSegment): [number, number, number, number] {
    return [Segments.x0(s), Segments.x1(s), Segments.y0(s), Segments.y1(s)];
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
  ({ v }) => !Views.isVisibleToUser(v) ? 's' : '-',
  /** If the view is invalid, skip it */
  ({ v }) => !Views.isValid(v) ? 's' : '-',
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
function segView(v: DxView, seg: DxSegment, pool: DxView[]) {
  const ctx = { v, s: seg, p: pool };
  for (const r of rules) {
    switch (r(ctx)) {
    case 'y': // divide, recursively to its children
      for (const c of v.children) {
        segView(c, seg, pool);
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
type HVSepRange = [Range, Range]; 
// [a view pool, a view pool]
type ESepRange = [DxView[], DxView[]];

// ViewRange is range with extra DxView
class ViewRange extends XYRange {
  constructor(
    public readonly v: DxView
  ) {
    super(...Views.xxyy(v));
  }
}

// Find and calculate the separator (elevated, horizontal, vertical) ranges
// for a segment along with its pool
function findSepForSeg(
  seg: DxSegment, 
  pool: DxView[]
): [ESepRange[], HVSepRange[], HVSepRange[]] {
  const rgs = new MemorizedXYRanges(
    new XYRange(seg.x, seg.x + seg.w, seg.y, seg.y + seg.h)
  );
  for (const v of pool) {
    DxLog.debug('== Find separators');
    DxLog.debug(`${v.cls} resId=${v.resId} text="${v.text}" desc="${v.desc}"`);
    DxLog.debug('XXXX (vsep)');
    for (const r of rgs.x()) {
      DxLog.debug(r.toString());
    }
    DxLog.debug('YYYY (hsep)');
    for (const r of rgs.y()) {
      DxLog.debug(r.toString());
    }
    DxLog.debug(`RMX ${Views.x0(v)}-${Views.x1(v)}`);
    DxLog.debug(`RMY ${Views.y0(v)}-${Views.y1(v)}`);
    rgs.remove(new ViewRange(v));
    for (const r of rgs.x()) {
      DxLog.debug(r.toString());
    }
    for (const r of rgs.y()) {
      DxLog.debug(r.toString());
    }
  }
  const hSep: HVSepRange[] = [];
  const vSep: HVSepRange[] = [];
  const eSep: ESepRange[] = [];
  for (const rg of rgs.x()) {
    // segment boundary is not a valid separator
    if (rg.st == seg.x || rg.ed == (seg.x + seg.w)) {
      continue;
    }
    vSep.push([rg, new Range(seg.y, seg.y + seg.h)]);
  }
  for (const rg of rgs.y()) {
    // segment boundary is not a valid separator
    if (rg.st == seg.y || rg.ed == (seg.y + seg.h)) {
      continue;
    }
    hSep.push([new Range(seg.x, seg.x + seg.w), rg]);
  }
  // eSep are recognized by overlapped regions
  for (const rg of rgs.memory()) {
    const ove = rgs.getOverlappingMemory(rg);
    if (ove.length != 0) {
      eSep.push([
        [(rg as ViewRange).v],
        ove.map(org => (org as ViewRange).v)
      ]);
    }
  }
  return [eSep, hSep, vSep];
}

// Find both-side neighbor views of a separator
function findHVSepNeighbors(
  rg: [Range, Range], 
  dir: 'V' | 'H', 
  pool: DxView[]
): [DxView[], DxView[]] {
  const s1: DxView[] = [];
  const s2: DxView[] = [];
  if (dir == 'H') {
    const top = rg[1].st;
    const bottom = rg[1].ed;
    for (const v of pool) {
      if (top == Views.y1(v)) {
        s1.push(v);
      } else if (bottom == Views.y0(v)) {
        s2.push(v);
      }
    }
  } else {
    const left = rg[0].st;
    const right = rg[0].ed;
    for (const v of pool) {
      if (left == Views.x1(v)) {
        s1.push(v);
      } else if (right == Views.x0(v)) {
        s2.push(v);
      }
    }
  }
  if (s1.length == 0 || s2.length == 0) {
    throw new UiSegError(`Does not find neighbor views for separator |x:${rg[0]};y:${rg[1]}|`);
  }
  return [s1, s2];
}

// Find both-side views of a hv separator, return
// [left, right] for v separator
// [top, bottom] for h separator
function findHVBothSides(
  rg: [Range, Range], 
  dir: 'V' | 'H', 
  pool: DxView[]
): [DxView[], DxView[]] {
  const s1: DxView[] = [];
  const s2: DxView[] = [];
  if (dir == 'H') {
    const top = rg[1].st;
    const bottom = rg[1].ed;
    for (const v of pool) {
      if (top >= Views.y1(v)) {
        s1.push(v);
      } else if (bottom <= Views.y0(v)) {
        s2.push(v);
      }
    }
  } else {
    const left = rg[0].st;
    const right = rg[0].ed;
    for (const v of pool) {
      if (left >= Views.x1(v)) {
        s1.push(v);
      } else if (right <= Views.x0(v)) {
        s2.push(v);
      }
    }
  }
  if (s1.length == 0 || s2.length == 0) {
    throw new UiSegError(`Does not find views for separator |x:${rg[0]};y:${rg[1]}|`);
  }
  return [s1, s2];
}

// Find both-side views of a e separator, return
// [lessSide, mostSide] for e separator
function findEBothSides(
  sep: ESepRange,
  seg: DxSegment,
  pool: DxView[]
): [DxView[], DxView[]] {
  // Always put other views in pool to mostSide
  let less: number;
  if (sep[0].length < sep[1].length) {
    less = 0;
  } else if (sep[0].length > sep[1].length) {
    less = 1;
  } else {
    // However, if there are same number of sides
    // in sep, then treat the sep which is outside
    // of the seg as less side
    const r0 = Segments.coverAll(seg, sep[0]);
    const r1 = Segments.coverAll(seg, sep[1]);
    if (r0 && !r1) {
      less = 1;
    } else if (r1 && !r0) {
      less = 0;
    } else {
      // However, if they are all covered by seg,
      // then always choose the smaller one as the
      // less one, because the smaller one is always
      // more scattered than the larger one
      const sz0 = sep[0].reduce((s, v) => s + Views.areaOf(v), 0);
      const sz1 = sep[1].reduce((s, v) => s + Views.areaOf(v), 0);
      less = sz0 >= sz1 ? 1 : 0;
    }
  }
  const more = 1 - less;

  const lessSide = [...sep[less]];
  const moreSide = [...sep[more]];
  for (const v of pool) {
    if (lessSide.indexOf(v) == -1 && moreSide.indexOf(v) == -1) {
      moreSide.push(v);
    }
  }

  return [lessSide, moreSide];
}

// Score a hv separator
function scoreHVSep(
  sep: HVSepRange, 
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
    score += Math.min((sep[0].ed - sep[0].st + 1) / SP_SZ_RECOMMENDED * 100, AWARD.SZ_BEST);
  } else {
    score += Math.min((sep[1].ed - sep[1].st + 1) / SP_SZ_RECOMMENDED * 100, AWARD.SZ_BEST);
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
  sep: ESepRange, 
  seg: DxSegment // eslint-disable-line
): number { 
  let score = DEFAULTS.SP_SCORE_BASE;
  score += Math.min((sep[0].length + sep[1].length) / DEFAULTS.SP_E_RECOMMENDED, 1) * 100;
  return score;
}

/** Segment a segment to two sub-segments */
function segSeg(seg: DxSegment): DxSegSep | null {
  // divide views, put non-division to a pool
  const pool: DxView[] = [];
  for (const r of seg.roots) {
    segView(r, seg, pool);
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
    let bestSep: ESepRange | null = null;
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
      xrg: new Range(Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY),
      yrg: new Range(Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY),
      sides: [
        Segments.adjust(s1),
        Segments.adjust(s2)
      ],
    };
  }

  // calculate scores for each hsep and rsep
  let best = Number.MIN_SAFE_INTEGER;
  let bestSep: HVSepRange | null = null;
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
    xrg: bestSep![0],
    yrg: bestSep![1], 
    sides
  };
}

export default function segUi(a: DxActivity): [DxSegment[], DxSegSep[]] {
  const decor = a.decorView!; // eslint-disable-line
  const initialSeg = { 
    roots: [decor],
    x: decor.drawingX,
    y: decor.drawingY,
    w: decor.width,
    h: decor.height
  };
  const segments: DxSegment[] = [];
  const separators: DxSegSep[] = [];
  const queue: DxSegment[] = [initialSeg];
  while (queue.length != 0) {
    DxLog.debug('>>>> New Iteration');
    const seg = queue.shift()!;
    const sep = segSeg(seg);
    // for elevated separator, directly recognize it as a valid separator,
    // for horizontal/vertical separators, recognize them if and only if 
    // their scores are larger than the predefined threshold, or stop
    // segment this segment further
    if ((sep == null) || (sep.dir != 'E' && sep.score < DEFAULTS.SP_SCORE_THRESHOLD)) { 
      if (sep != null) {
        DxLog.debug(`-- abandon ${sep.dir} ${sep.score} ${sep.xrg.st};${sep.yrg.st};${sep.xrg.ed};${sep.yrg.ed}`);
      }
      segments.push(seg);
    } else {
      queue.push(sep.sides[0], sep.sides[1]);
      separators.push(sep);
      DxLog.debug(`++ add ${sep.dir} ${sep.score} ${sep.xrg.st};${sep.yrg.st};${sep.xrg.ed};${sep.yrg.ed}`);
    }
  }
  return [segments, separators];
}