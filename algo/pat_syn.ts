import DxLog from '../dxlog.ts';
import { DxXYEvent } from '../dxevent.ts';
import DxView, { Views } from '../ui/dxview.ts';
import DxSegment from '../ui/dxseg.ts';
import DxCompatUi from '../ui/dxui.ts';
import { DevInfo, DroidInput } from '../dxdroid.ts';
import adaptSel from './ada_sel.ts';
import segUi from './ui_seg.ts';
import matchSeg, { NO_MATCH } from './seg_mat.ts';
import recBpPat, { DxPat, Invisible } from './pat_rec.ts';
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

export default async function synPattern(
  event: DxXYEvent, // target event
  view: DxView, // target view extracted from event
  pUi: DxCompatUi,
  rDev: DevInfo,
  pDev: DevInfo,
  input: DroidInput
): Promise<N<DxPat>> {
  const rUi = event.ui;

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
    return pattern.match() ? pattern : null;
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
      throw new NotImplementedError(
        `Multiple best matched segments with score ${score}`
      );
    }
    pSeg = matched[0];
  }

  // return the recognized bp pattern
  return recBpPat({
    e: event,
    v: view,
    r: { u: rUi, s: rSeg, d: rDev },
    p: { u: pUi, s: pSeg, d: pDev },
  });
}
