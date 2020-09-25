export * from './selector.ts';
export * from './normalizer.ts';
export * from './matcher.ts';
export * from './recognizer.ts';
export * from './synthesizer.ts';

import DxSelector from './selector.ts';
import type DxNormalizer from './normalizer.ts';
import type DxSegmentMatcher from './matcher.ts';
import type DxRecognizer from './recognizer.ts';
import DxSynthesizer from './synthesizer.ts';

export default DxSynthesizer;
export { DxSelector };
export type { DxNormalizer, DxSegmentMatcher, DxRecognizer };
