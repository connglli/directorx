import Ranges, { Range } from '../utils/ranges.ts';
import DxView, { DxActivity, DxViewVisibility } from '../dxview.ts';
import { CannotReachHereError } from '../utils/error.ts';

const DEFAULTS = {
  V_SZ_THRESHOLD: 0.07,
  // The recommended separator size, by default, this
  // value is set to 30px, and this is the value set
  // default by Bootstrap, see also Bootstrap "Grid options"
  // https://getbootstrap.com/docs/4.0/layout/grid/#grid-options
  SP_SZ_RECOMMENDED: 30,
  SP_SCORE_BASE: 100,
  SP_SCORE_AWARD: {
    SZ_BEST: 120, // best score for separator size
    DIFF_NUM: 50, // different number of views
    DIFF_CLS: 10,  // different view classes
    SAME_CLS: -50, // same view class
    SAME_SCROLL_PARENT: -80, // same scrollable parent
    DIFF_BG: 200, // different bg classes and colors
    DIFF_BG_CLS: 50, // different bg classes
    DIFF_BG_COLOR: 100, // different bg colors
    SAME_BG: -80, // same background
    BOTH_TXT: -80, // both are text views
    DIFF_TEXT: 200, // one side is text, the other is not
  },
  get SP_SCORE_THRESHOLD() {
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
  dir: 'H' | 'V';
  /** Separator ranges */
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

  static isVisible(v: DxView): boolean {
    return v.flags.V == DxViewVisibility.VISIBLE;
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
  static areaOf(s: DxSegment) {
    return s.w * s.h;
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
  ({ v }) => !Views.isVisible(v) ? 's' : '-',
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
type SepRange = [Range, Range]; 

// Find and calculate the separator ranges
// for a segment along with its pool
function findSepForSeg(
  seg: DxSegment, 
  pool: DxView[]
): [SepRange[], SepRange[]] {
  const xRgs = new Ranges(seg.x, seg.x + seg.w);
  const yRgs = new Ranges(seg.y, seg.y + seg.h);
  for (const v of pool) {
    xRgs.remove(Views.x0(v), Views.x1(v));
    yRgs.remove(Views.y0(v), Views.y1(v));
  }
  const hSep: SepRange[] = [];
  const vSep: SepRange[] = [];
  for (const rg of xRgs) {
    // segment boundary is not a valid separator
    if (rg.st == seg.x || rg.ed == (seg.x + seg.w)) {
      continue;
    }
    vSep.push([rg, new Range(seg.y, seg.y + seg.h)]);
  }
  for (const rg of yRgs) {
    // segment boundary is not a valid separator
    if (rg.st == seg.y || rg.ed == (seg.y + seg.h)) {
      continue;
    }
    hSep.push([new Range(seg.x, seg.x + seg.w), rg]);
  }
  return [hSep, vSep];
}

// Find both-side neighbor views of a separator
function findSepNeighbors(
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

// Find both-side views of a separator
function findBothSides(
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

function scoreSep(
  sep: SepRange, 
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
          score += AWARD.SAME_SCROLL_PARENT;
        }
        scrollParent = a.findHScrollableParent();
        if (scrollParent != null && scrollParent == b.findHScrollableParent()) {
          score += AWARD.SAME_SCROLL_PARENT;
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

/** Segment a segment to two sub-segments */
function segSeg(seg: DxSegment): DxSegSep | null {
  // divide views, put non-division to a pool
  const pool: DxView[] = [];
  for (const r of seg.roots) {
    segView(r, seg, pool);
  }

  // find the separators for these views
  const [hSep, vSep] = findSepForSeg(seg, pool);

  // no separators, means this segment is minimum
  if (hSep.length == 0 && vSep.length == 0) {
    return null;
  }

  // calculate scores for each sep
  let best = Number.MIN_SAFE_INTEGER;
  let bestSep: SepRange | null = null;
  let bestSepDir: 'H' | 'V' = 'H';

  for (const sep of vSep) {
    const score = scoreSep(sep, 'V', seg, ...findSepNeighbors(sep, 'V', pool));
    // for same score, we always select the first one
    if (score > best) {
      best = score;
      bestSep = sep;
      bestSepDir = 'V';
    }
  }
  for (const sep of hSep) {
    const score = scoreSep(sep, 'H', seg,...findSepNeighbors(sep, 'H', pool));
    // for same score, we always select the first one
    if (score > best) {
      best = score;
      bestSep = sep;
      bestSepDir = 'H';
    }
  }

  // construct seg for separator
  const [s1, s2] = findBothSides(bestSep!, bestSepDir, pool); // eslint-disable-line
  let sides: [DxSegment, DxSegment];
  if (bestSepDir == 'V') {
    /* eslint-disable */
    sides = [
      { roots: s1, x: seg.x, y: seg.y, w: bestSep![0].st - seg.x, h: seg.h },
      { roots: s2, x: bestSep![0].ed, y: seg.y, w: seg.x + seg.w - bestSep![0].ed, h: seg.h }
    ]
  } else {
    /* eslint-disable */   
    sides = [
      { roots: s1, x: seg.x, y: seg.y, w: seg.w, h: bestSep![1].st - seg.y },
      { roots: s2, x: seg.x, y: bestSep![1].st, w: seg.w, h: seg.y + seg.h - bestSep![1].st }
    ]
  }
  return {
    score: best,
    dir: bestSepDir,
    xrg: bestSep![0],
    yrg: bestSep![1], 
    sides
  }
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
    const seg = queue.shift()!;
    const sep = segSeg(seg);
    if (sep != null && sep.score >= DEFAULTS.SP_SCORE_THRESHOLD) {
      queue.push(sep.sides[0], sep.sides[1]);
      separators.push(sep);
    } else {
      segments.push(seg);
    }
  }
  return [segments, separators];
}