import DxLog from '../dxlog.ts';
import { DxXYEvent, DxEvSeq } from '../dxevent.ts';
import DxView, { Views } from '../ui/dxview.ts';
import DxSegment from '../ui/dxseg.ts';
import DxCompatUi from '../ui/dxui.ts';
import { DevInfo, DroidInput } from '../dxdroid.ts';
import adaptSel from './ada_sel.ts';
import segUi from './ui_seg.ts';
import matchSeg, { NO_MATCH } from './seg_mat.ts';
import {
  DxPat,
  Invisible,
  Lookahead,
  DxBpPat,
  BpPatRecArgs,
  NavigationUp,
  VagueText,
  VagueTextExt,
  VagueTextDesc,
  Scroll,
  MoreOptions,
  DrawerMenu,
  TabHostTab,
  TabHostContent,
  TabHost,
  DoubleSideViewPager,
  SingleSideViewPager,
  DualFragmentGotoDescriptive,
  DualFragmentGotoDetailed,
  NewButton,
} from './patterns.ts';
import { IllegalStateError, NotImplementedError } from '../utils/error.ts';

type N<T> = T | null;

function findSegByView(v: DxView, segs: DxSegment[]): DxSegment {
  for (const s of segs) {
    for (const r of s.roots) {
      if (r == v || Views.isChild(v, r)) {
        return s;
      }
    }
  }
  throw new IllegalStateError('Cannot find the view on any segment');
}

// The Pattern is sorted bottom-up, in order of
// [None, Reflow, Transform, Expand, Merge, Reveal]
// put Transform before Expand because the Transform
// is fully controlled by app developers, and it is
// sometimes simply, but sometimes complicated
const bpPatternClasses = [
  // Transform
  NavigationUp,
  // Expand
  VagueText,
  VagueTextExt,
  // VagueTextDesc,
  Scroll,
  // Reveal
  MoreOptions,
  DrawerMenu,
  TabHostTab,
  TabHostContent,
  TabHost,
  DoubleSideViewPager,
  SingleSideViewPager,
  // Merge
  DualFragmentGotoDescriptive,
  DualFragmentGotoDetailed,
  NewButton,
];

/** Recognize the pattern bottom-up from None to
 * Transform. This is an assume and check process, i.e.,
 * assume a pattern, and test the pattern condition.
 * Confirm the pattern and return if and only if the
 * condition passes, or test next pattern. The returned
 * are all patterns that matched, they are expected to
 * fired one by one in order */
async function recBpPat(
  args: BpPatRecArgs,
  vagueOnly = false
): Promise<DxBpPat[]> {
  const patterns = bpPatternClasses
    .map((P) => new P(args))
    .filter((p) => !vagueOnly || p instanceof VagueText);
  const ret: DxBpPat[] = [];
  for (const p of patterns) {
    if (await p.match()) {
      ret.push(p);
    }
  }
  return ret;
}

/** Synthesize a sorted array of patterns that can be used
 * in order to synthesize an equivalent event sequence for
 * the target event in the event sequence */
export default async function synPattern(
  seq: DxEvSeq, // the event seq
  event: DxXYEvent, // target event
  view: DxView, // target view extracted from event
  rUi: DxCompatUi,
  pUi: DxCompatUi,
  rDev: DevInfo,
  pDev: DevInfo,
  input: DroidInput,
  kVal: number
): Promise<DxPat[]> {
  const patterns: DxPat[] = [];

  // let's see if the view can be skipped by lookahead
  {
    const pattern = new Lookahead({
      e: event,
      v: view,
      k: kVal,
      s: seq,
      i: input,
    });
    if (await pattern.match()) {
      return [pattern];
    }
  }

  // let's see if the view is invisible, and apply
  // the invisible pattern if possible
  const ivm = await adaptSel(input, view, false);
  if (ivm && !ivm.important) {
    // sometimes an important or invisible view may got,
    // even though it is not suitable to fire it, it provides
    // useful information, specific patterns can be used.
    let v: DxView | null = null;
    // TODO: what if multiple views with same text
    if (ivm.text.length > 0) {
      v = pUi.findViewByText(ivm.text);
      // FIX: view's text given by droid are often capitalized
      if (!v) {
        v = pUi.findViewByText(ivm.text, true);
      }
    } else if (ivm['resource-id'].length > 0) {
      v = pUi.findViewByResource(ivm['resource-type'], ivm['resource-entry']);
    } else if (ivm['content-desc'].length > 0) {
      v = pUi.findViewByDesc(ivm['content-desc']);
    } else {
      v = pUi.findViewByXY(ivm.bounds.left + 1, ivm.bounds.top + 1);
    }
    if (v == null) {
      throw new IllegalStateError('Cannot find view on playee tree');
    }
    const pattern = new Invisible({
      e: event,
      v,
      u: pUi,
      d: pDev,
    });
    if (await pattern.match()) {
      patterns.push(pattern);
    }
  }

  // segment the ui
  const [, rSegs] = segUi(rUi, rDev);
  const [, pSegs] = segUi(pUi, pDev);

  // match segment and find the target segment
  const match = matchSeg(pSegs, rSegs);
  // find the segment where the w resides
  const rSeg = findSegByView(view, rSegs);
  let pSeg = match.getPerfectMatch(rSeg);
  if (!pSeg) {
    throw new IllegalStateError(
      'Does not find any matched segment, even NO_MATCH'
    );
  } else if (pSeg == NO_MATCH) {
    DxLog.info('Perfect Match does not found, tune to Best Matches');
    const [score, matched] = match.getBestMatches(rSeg);
    if (matched.length == 0) {
      throw new IllegalStateError('Best Matches do not found');
    } else if (matched.length != 1) {
      DxLog.warning(
        `Multiple best matched segments with score ${score}, use the first one`
      );
    }
    pSeg = matched[0];
  }

  patterns.push(
    ...(await recBpPat({
      e: event,
      v: view,
      r: { u: rUi, s: rSeg, d: rDev },
      p: { u: pUi, s: pSeg, d: pDev },
    }))
  );

  return patterns;
}
