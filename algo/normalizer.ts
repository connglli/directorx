import DxCompatUi from '../ui/dxui.ts';
import DxSegment from '../ui/dxseg.ts';
import { DevInfo } from '../dxdroid.ts';

export class NormalizeError extends Error {
  constructor(msg: string) {
    super(`NormalizeError: ${msg}`);
  }
}

/** A normalizer normalizes the input typed I to output typed O */
export default interface DxNormalizer<I, O, D = undefined> {
  normalize(i: I, d?: D): O;
}

/** An DxUiNormalizer normalizes an ui and returns a new
 * normalized ui */
export abstract class DxUiNormalizer
  implements DxNormalizer<DxCompatUi, Promise<DxCompatUi>, DevInfo> {
  abstract normalize(u: DxCompatUi, d: DevInfo): Promise<DxCompatUi>;
}

/** A DxSegmentNormalizer normalizes an ui and returns the root
 * segment along with all the accepted segments, which is
 * equivalent of Segments.acceptsOf(root) */
export abstract class DxSegmentNormalizer
  implements
    DxNormalizer<DxCompatUi, Promise<[DxSegment, DxSegment[]]>, DevInfo> {
  abstract normalize(
    u: DxCompatUi,
    d: DevInfo
  ): Promise<[DxSegment, DxSegment[]]>;
}
