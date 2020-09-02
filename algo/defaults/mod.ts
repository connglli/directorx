import CompactSynthesizer from './synthesizer.ts';
import AdaptiveUiAutomatorSelector from './selector/ui_automator.ts';
import UiSegmenter from './normalizer/segment.ts';
import IdentityUi from './normalizer/compatui.ts';
import TfIdfMatcher from './matcher.ts';
import BottomUpRecognizer from './recognizer/recognizer.ts';

export {
  CompactSynthesizer,
  AdaptiveUiAutomatorSelector,
  UiSegmenter,
  IdentityUi,
  TfIdfMatcher,
  BottomUpRecognizer,
};
