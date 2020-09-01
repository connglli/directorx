export * from './selector.ts';
export * from './normalizer.ts';
export * from './matcher.ts';
export * from './recognizer.ts';
export * from './synthesizer.ts';

import DxSelector from './selector.ts';
import DxNormalizer from './normalizer.ts';
import DxSegmentMatcher from './matcher.ts';
import DxSynthesizer from './synthesizer.ts';

export default DxSynthesizer;
export { DxSelector, DxNormalizer, DxSegmentMatcher };
