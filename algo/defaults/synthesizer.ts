import DxSynthesizer from '../synthesizer.ts';
import DxSelector from '../selector.ts';
import { NO_MATCH } from '../matcher.ts';
import { DxPattern, PatternArgs } from '../recognizer.ts';
import { DxXYEvent, DxEvSeq, isXYEvent } from '../../dxevent.ts';
import DxView, { Views, ViewFinder } from '../../ui/dxview.ts';
import DxCompatUi from '../../ui/dxui.ts';
import { DevInfo, DroidInput } from '../../dxdroid.ts';
import { IllegalStateError } from '../../utils/error.ts';

type N<T> = T | null;

interface LookaheadArgs extends PatternArgs {
  // number of events to lookahead
  kVal: number;
  sel: DxSelector;
  inp: DroidInput;
}

/** Lookahead tries to look ahead next K events, and skip several events,
 * these events (including current) can be skipped if and only
 * if their next event can be fired directly on current ui */
class Lookahead extends DxPattern {
  private nPopped = -1;

  constructor(protected args: LookaheadArgs) {
    super(args);
  }

  get name() {
    return `lookahead:${this.args.kVal}`;
  }

  async match(): Promise<boolean> {
    this.nPopped = await this.tryLookahead(
      this.args.v,
      this.args.s,
      this.args.kVal,
      this.args.sel,
      this.args.inp
    );
    return this.nPopped >= 0;
  }

  async apply() {
    if (this.nPopped < 0) {
      throw new IllegalStateError("No events to pop, don't apply");
    }
    this.args.s.popN(this.nPopped);
    return true;
  }

  private async tryLookahead(
    view: DxView,
    seq: DxEvSeq,
    kVal: number,
    sel: DxSelector,
    inp: DroidInput
  ): Promise<number> {
    // TODO: add more rules to check whether v can be skipped
    if (view.text.length != 0 || seq.size() <= 0) {
      return -1;
    }
    const nextK = seq.topN(this.args.kVal);
    for (let i = 0; i < nextK.length; i++) {
      const ne = nextK[i];
      // we come across an non-xy event, fail
      if (!isXYEvent(ne)) {
        return -1;
      }

      // find the view in recordee
      const nv = ne.ui.findViewByXY(ne.x, ne.y);
      if (nv == null) {
        throw new IllegalStateError(
          `No visible view found on recordee tree at (${ne.x}, ${ne.y})`
        );
      }

      // find its target view map in playee
      const nvm = await sel.select(nv, true);
      if (nvm != null && nvm.visible) {
        return i;
      }
    }
    return -1;
  }
}

interface InvisibleArgs extends PatternArgs {
  // view on playee
  vp: DxView;
}

/** Invisible pattern is used for those views which are
 * invisible but still presented on the view tree. Invisible
 * pattern assumes that the invisible button can be manifested
 * by actions on its visible parent, currently the actions
 * includes only the tap action. */
class Invisible extends DxPattern {
  // parent that are visible to user
  private vParent: N<DxView> = null;
  constructor(protected args: InvisibleArgs) {
    super(args);
  }

  get name(): string {
    return 'invisible';
  }

  async match(): Promise<boolean> {
    // find its visible parent
    const {
      vp: view,
      p: { u: act, d: dev },
    } = this.args;
    this.vParent = ViewFinder.findParent(
      view,
      (p) => Views.isViewImportantForA11y(p) && Views.isVisibleToUser(p, dev)
    );
    return !!this.vParent;
  }

  async apply(input: DroidInput): Promise<boolean> {
    // TODO: what if the view is not triggered by
    // tapping its visible parent?
    if (this.vParent == null) {
      throw new IllegalStateError("Pattern is not satisfied, don't apply");
    }
    await input.tap(Views.x0(this.vParent) + 1, Views.y0(this.vParent) + 1);
    this.setDirty();
    return false;
  }
}

/** CompactSynthesizer enhances the default synthesizer with ability of
 * lookahead, and invisible before it does actual synthesis work
 */
export default class CompactSynthesizer extends DxSynthesizer {
  constructor(
    public readonly baseSynthesizer: DxSynthesizer,
    public readonly kVal: number
  ) {
    super({
      input: baseSynthesizer.input,
      selector: baseSynthesizer.selector,
      normalizer: baseSynthesizer.normalizer,
      matcher: baseSynthesizer.matcher,
      recognizer: baseSynthesizer.recognizer,
    });
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

    // Lookahead and Invisible does not need any segment
    const args = {
      e: event,
      v: view,
      s: seq,
      r: { u: rUi, s: NO_MATCH, d: rDev },
      p: { u: pUi, s: NO_MATCH, d: pDev },
    };

    // let's see if the view can be skipped by lookahead
    {
      const pattern = new Lookahead({
        ...args,
        kVal: this.kVal,
        sel: this.selector,
        inp: this.input,
      });
      if (await pattern.match()) {
        return [pattern];
      }
    }

    // let's see if the view is invisible, and apply
    // the invisible pattern if possible
    const ivm = await this.selector.select(view, false);
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
        ...args,
        vp: v,
      });
      if (await pattern.match()) {
        patterns.push(pattern);
      }
    }

    patterns.push(
      ...(await this.baseSynthesizer.synthesize(
        seq,
        event,
        view,
        rUi,
        pUi,
        rDev,
        pDev
      ))
    );

    return patterns;
  }
}
