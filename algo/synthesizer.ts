import type DxSelector from './selector.ts';
import type { DxSegmentNormalizer } from './normalizer.ts';
import DxSegmentMatcher, { NO_MATCH } from './matcher.ts';
import type DxRecognizer from './recognizer.ts';
import type { DxPattern } from './recognizer.ts';
import type { DxXYEvent, DxEvSeq } from '../dxevent.ts';
import DxView, { Views } from '../ui/dxview.ts';
import type DxSegment from '../ui/dxseg.ts';
import type DxCompatUi from '../ui/dxui.ts';
import type { DevInfo, DroidInput } from '../dxdroid.ts';
import DxLog from '../dxlog.ts';
import { IllegalStateError } from '../utils/error.ts';

export interface SynthesizerComponents {
  input: DroidInput;
  selector: DxSelector;
  normalizer: DxSegmentNormalizer;
  matcher: DxSegmentMatcher;
  recognizer: DxRecognizer;
}

/** Synthesize a sorted array of patterns that can be used
 * in order to synthesize an equivalent event sequence for
 * the target event in the event sequence. Specifically,
 * the synthesizer
 * 1. normalizes the ui to a group of segments
 * 2. matches the segment
 * 3. then recognize the patterns
 * and returns the patterns */
export default class DxSynthesizer {
  public readonly input: DroidInput;
  // selector to select an view map
  public readonly selector: DxSelector;
  // normalize the ui to segments
  public readonly normalizer: DxSegmentNormalizer;
  // matcher to match the segment groups
  public readonly matcher: DxSegmentMatcher;
  // recognizer to recognize the patterns
  public readonly recognizer: DxRecognizer;
  constructor(comp: SynthesizerComponents) {
    this.input = comp.input;
    this.selector = comp.selector;
    this.normalizer = comp.normalizer;
    this.matcher = comp.matcher;
    this.recognizer = comp.recognizer;
  }

  async synthesize(
    seq: DxEvSeq, // the event seq
    event: DxXYEvent, // target event
    view: DxView, // target view extracted from event
    rUi: DxCompatUi,
    pUi: DxCompatUi,
    rDev: DevInfo,
    pDev: DevInfo
  ): Promise<DxPattern[]> {
    const patterns: DxPattern[] = [];

    // normalize the ui
    const [, rSegs] = await this.normalizer.normalize(rUi, rDev);
    const [, pSegs] = await this.normalizer.normalize(pUi, pDev);

    // match segment and find the target segment
    const match = await this.matcher.match(pSegs, rSegs);
    // find the segment where the w resides
    const rSeg = DxSynthesizer.findSegByView(view, rSegs);
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
      ...(await this.recognizer.recognize({
        e: event,
        v: view,
        s: seq,
        r: { u: rUi, s: rSeg, d: rDev },
        p: { u: pUi, s: pSeg, d: pDev },
      }))
    );

    return patterns;
  }

  protected static findSegByView(v: DxView, segs: DxSegment[]): DxSegment {
    for (const s of segs) {
      for (const r of s.roots) {
        if (r == v || Views.isChild(v, r)) {
          return s;
        }
      }
    }
    throw new IllegalStateError('Cannot find the view on any segment');
  }
}
