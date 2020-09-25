import type DxRecognizer from '../../recognizer.ts';
import type { DxPattern, PatternArgs } from '../../recognizer.ts';
import {
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
export default class BottomUpRecognizer implements DxRecognizer {
  async recognize(args: PatternArgs): Promise<DxPattern[]> {
    const ret: DxPattern[] = [];
    for (const p of bpPatternClasses.map((P) => new P(args))) {
      if (await p.match()) {
        ret.push(p);
      }
    }
    return ret;
  }
}
