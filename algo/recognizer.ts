import type DxSelector from './selector.ts';
import type DxEvent from '../dxevent.ts';
import type { DxEvSeq } from '../dxevent.ts';
import type DxView from '../ui/dxview.ts';
import type DxSegment from '../ui/dxseg.ts';
import type DxCompatUi from '../ui/dxui.ts';
import type { DroidInput, DevInfo } from '../dxdroid.ts';

export interface PatternArgs {
  // original fired event
  e: DxEvent;
  // view on recordee
  v: DxView;
  // the event sequence
  s: DxEvSeq;
  // the recordee
  r: {
    s: DxSegment;
    u: DxCompatUi;
    d: DevInfo;
  };
  // the playee
  p: {
    s: DxSegment;
    u: DxCompatUi;
    d: DevInfo;
  };
}

export abstract class DxPattern {
  // when set to true, it means that this pattern has
  // produced some side effects to the app, and one is
  // expected to try to dismiss such side effects before
  // any following work, or stop executing directly
  private dirty_ = false;
  constructor(protected readonly args: PatternArgs) {}
  /** Pattern name */
  abstract get name(): string;
  /** Whether current circumstance match this pattern */
  abstract async match(): Promise<boolean>;
  /** Apply the pattern and return whether the original event is consumed */
  abstract async apply(
    input: DroidInput,
    selector: DxSelector
  ): Promise<boolean>;
  /** Return whether this pattern has produced some side effects */
  get dirty() {
    return this.dirty_;
  }
  /** Dismiss the side effects, returning whether the side
   * effects is dismissed or not, currently not supported */
  dismiss() {
    return false;
  }
  protected setDirty() {
    this.dirty_ = true;
  }
  protected clearDirty() {
    this.dirty_ = false;
  }
}

/** Given args, a recognizer recognizes patterns to synthesize an
 * equivalent event sequence for a given event. These patterns
 * are sorted into an array, and they should be fired one by one
 * in order, but should stop all following when a pattern is
 * successfully applied (i.e., no exceptions are raised)
 */
export default interface DxRecognizer {
  recognize(args: PatternArgs): Promise<DxPattern[]>;
}
