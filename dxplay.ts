import DxEvent, {
  DxXYEvent,
  DxKeyEvent,
  DxLongTapEvent,
  DxDoubleTapEvent,
  DxSwipeEvent,
  DxTapEvent,
  isXYEvent,
  DxEvSeq,
} from './dxevent.ts';
import DxLog from './dxlog.ts';
import DxPacker from './dxpack.ts';
import DxView, { DxActivity, Views } from './dxview.ts';
import DxSegment from './dxseg.ts';
import DxDroid, {
  DevInfo,
  ViewInputOptions,
  SelectOptions,
  ViewMap,
} from './dxdroid.ts';
import segUi from './algo/ui_seg.ts';
import matchSeg, { NO_MATCH } from './algo/seg_mat.ts';
import recBpPat, { Invisible } from './algo/pat_syn.ts';
import * as time from './utils/time.ts';
import {
  IllegalStateError,
  NotImplementedError,
  CannotReachHereError,
} from './utils/error.ts';

type N<T> = T | null;

abstract class DxPlayer {
  public readonly timeSensitive = true;
  private seq_: N<DxEvSeq> = null;
  constructor(
    public readonly app: string // app to play
  ) {}

  get seq(): DxEvSeq {
    if (this.seq_) {
      return this.seq_;
    }
    throw new IllegalStateError('Not in playing state');
  }

  async play(seq: DxEvSeq, rDev: DevInfo): Promise<void> {
    this.seq_ = seq;
    let lastMs = -1;
    while (!this.seq.empty()) {
      const e = this.seq.pop();
      if (lastMs != -1) {
        if (this.timeSensitive) {
          const wait = e.t - lastMs;
          if (wait > 0) {
            await time.sleep(wait);
          }
        }
      }
      await this.playEvent(e, rDev);
      DxLog.info(e.toString());
      lastMs = e.t;
    }
  }

  protected abstract async playEvent(e: DxEvent, rDev: DevInfo): Promise<void>;
}

/** PxPlayer plays each event pixel by pixel */
class PxPlayer extends DxPlayer {
  async playEvent(e: DxEvent): Promise<void> {
    const input = DxDroid.get().input;
    switch (e.ty) {
      case 'tap':
        await input.tap((e as DxTapEvent).x, (e as DxTapEvent).y);
        break;
      case 'long-tap':
        await input.longTap((e as DxLongTapEvent).x, (e as DxLongTapEvent).y);
        break;
      case 'double-tap':
        await input.doubleTap(
          (e as DxDoubleTapEvent).x,
          (e as DxDoubleTapEvent).y
        );
        break;
      case 'swipe':
        await input.swipe(
          (e as DxSwipeEvent).x,
          (e as DxSwipeEvent).y,
          (e as DxSwipeEvent).dx,
          (e as DxSwipeEvent).dy,
          (e as DxSwipeEvent).t1 - (e as DxSwipeEvent).t0
        );
        break;
      case 'key':
        await input.key((e as DxKeyEvent).k);
        break;
    }
  }
}

/** PtPlayer plays each event percentage by percentage */
class PtPlayer extends DxPlayer {
  async playEvent(e: DxEvent, rDev: DevInfo): Promise<void> {
    const input = DxDroid.get().input;
    const dev = DxDroid.get().dev;
    if (e.ty == 'tap') {
      const { x, y } = e as DxTapEvent;
      await input.tap(
        this.rec2play(x, dev, rDev, false),
        this.rec2play(y, dev, rDev, true)
      );
    } else if (e.ty == 'long-tap') {
      const { x, y } = e as DxLongTapEvent;
      await input.longTap(
        this.rec2play(x, dev, rDev, false),
        this.rec2play(y, dev, rDev, true)
      );
    } else if (e.ty == 'double-tap') {
      const { x, y } = e as DxDoubleTapEvent;
      await input.doubleTap(
        this.rec2play(x, dev, rDev, false),
        this.rec2play(y, dev, rDev, true)
      );
    } else if (e.ty == 'swipe') {
      const { x, y, dx, dy, t0, t1 } = e as DxSwipeEvent;
      await input.swipe(
        this.rec2play(x, dev, rDev, false),
        this.rec2play(y, dev, rDev, true),
        this.rec2play(dx, dev, rDev, false),
        this.rec2play(dy, dev, rDev, true),
        t0 - t1
      );
    } else if (e.ty == 'key') {
      await input.key((e as DxKeyEvent).k);
    }
  }

  private rec2play(
    x: number,
    pDev: DevInfo,
    rDev: DevInfo,
    height = false
  ): number {
    if (height) {
      return (x / rDev.height) * pDev.height;
    } else {
      return (x / rDev.width) * pDev.width;
    }
  }
}

/** WdgPlayer plays each event according to its view widget.
 * It matches each view according to its:
 * 1. resId (contains-ignore-case)
 * 2. desc (contains-ignore-case)
 * 3. text (contains-ignore-case)
 * If no views are found, a YotaNoSuchViewException is thrown.
 */
class WdgPlayer extends DxPlayer {
  async playEvent(e: DxEvent): Promise<void> {
    const input = DxDroid.get().input;
    const dev = DxDroid.get().dev;
    if (e.ty == 'tap') {
      const { x, y } = e as DxTapEvent;
      const [opt] = this.makeViewOptOrThrow(e.a, x, y);
      await input.view('tap', opt);
    } else if (e.ty == 'long-tap') {
      const { x, y } = e as DxLongTapEvent;
      const [opt] = this.makeViewOptOrThrow(e.a, x, y);
      await input.view('longtap', opt);
    } else if (e.ty == 'double-tap') {
      const { x, y } = e as DxDoubleTapEvent;
      const [opt] = this.makeViewOptOrThrow(e.a, x, y);
      await input.view('doubletap', opt);
    } else if (e.ty == 'swipe') {
      const { x, y } = e as DxSwipeEvent;
      let { dx, dy } = e as DxSwipeEvent;
      const [opt, v] = this.makeViewOptOrThrow(e.a, x, y);
      // adjust so that does not swipe out of screen
      const hCenter = (v.left + v.right) / 2;
      const vCenter = (v.top + v.bottom) / 2;
      if (dx < 0 && hCenter + dx < 0) {
        dx = -hCenter;
      } else if (dx > 0 && hCenter + dx > dev.width) {
        dx = dev.width - hCenter;
      }
      if (dy < 0 && vCenter + dy < 0) {
        dy = -vCenter;
      } else if (dy > 0 && vCenter + dy > dev.height) {
        dy = dev.height - vCenter;
      }
      opt.dx = dx;
      opt.dy = dy;
      await input.view('swipe', opt);
    } else if (e.ty == 'key') {
      await input.key((e as DxKeyEvent).k);
    }
  }

  private makeViewOptOrThrow(
    a: DxActivity,
    x: number,
    y: number
  ): [ViewInputOptions, DxView] {
    const v = a.findViewByXY(x, y);
    if (v == null) {
      throw new IllegalStateError(
        `No visible view found at (${x}, ${y}) on rec tree`
      );
    }
    const opt: ViewInputOptions = {};
    if (v.resId.length != 0) {
      opt.resIdContains = v.resEntry;
    }
    if (v.text.length != 0) {
      opt.textContains = v.text;
    }
    if (v.desc.length != 0) {
      opt.descContains = v.desc;
    }
    return [opt, v];
  }
}

/** ResPlayer plays each event responsively */
class ResPlayer extends DxPlayer {
  constructor(
    app: string,
    public readonly decode: boolean,
    public readonly K: number
  ) {
    super(app);
  }

  async playEvent(e: DxEvent, rDev: DevInfo): Promise<void> {
    if (!isXYEvent(e)) {
      if (e.ty == 'key') {
        await DxDroid.get().input.key((e as DxKeyEvent).k);
      } else {
        throw new NotImplementedError();
      }
      return;
    }

    // find the view in playee first
    let vm = await this.find(e);
    if (vm != null) {
      if (this.isVmVisibleToUser(vm)) {
        await this.fireOnViewMap(e, vm);
        return;
      }
      // sometimes an important or invisible view may got,
      // even though it is not suitable to fire it, it provides
      // useful information, specific patterns can be used.
      const droid = DxDroid.get();
      const pAct = await this.top();
      let v: DxView | null = null;
      // TODO: what if multiple views with same text
      if (vm.text.length > 0) {
        v = pAct.findViewByText(vm.text);
      } else if (vm['resource-id'].length > 0) {
        v = pAct.findViewByResource(vm['resource-type'], vm['resource-entry']);
      } else if (vm['content-desc'].length > 0) {
        v = pAct.findViewByDesc(vm['content-desc']);
      } else {
        v = pAct.findViewByXY(vm.bounds.left + 1, vm.bounds.top + 1);
      }
      if (v == null) {
        throw new IllegalStateError('Cannot find view on playee tree');
      }
      const pattern = new Invisible({
        v,
        a: pAct,
        d: droid.dev,
      });
      if (!pattern.match()) {
        throw new NotImplementedError('Pattern is not invisible');
      } else {
        DxLog.info('pattern invisible');
      }
      // push the raw event back to the sequence, and try again
      this.seq.push(e);
      // apply the rules to get the synthesized event
      await pattern.apply(droid);
      return;
    }

    // try to look ahead next K events
    // TODO: not all events can be skipped, check for reasonable events
    const nextK = this.seq.topN(this.K);
    for (const i in nextK) {
      const ne = nextK[i];
      if (!isXYEvent(ne)) {
        continue;
      }
      vm = await this.find(ne);
      if (vm != null && this.isVmVisibleToUser(vm)) {
        if (!this.canSkip(vm)) {
          // can skip more views
          break;
        }
        // find one, directly skip all previously
        this.seq.popN(Number(i) + 1);
        DxLog.info(`/* skip ${e.toString()} */`);
        return await this.fireOnViewMap(ne, vm);
      }
    }

    // when lookahead fails, segment the ui,
    // find the matched segment, and synthesize
    // the equivalent event sequence
    const rAct = e.a;
    const v = rAct.findViewByXY(e.x, e.y);
    if (v == null) {
      throw new IllegalStateError(
        `No visible view found on rec tree at (${e.x}, ${e.y})`
      );
    }

    // segment the ui
    const droid = DxDroid.get();
    const [, rSegs] = segUi(rAct, rDev);
    const pAct = await this.top();
    const pDev = droid.dev;
    const [, pSegs] = segUi(pAct, pDev);

    // match segment and find the target segment
    const match = matchSeg(pSegs, rSegs);
    // find the segment where the w resides
    const rSeg = this.findSegByView(v, rSegs);
    const pSeg = match.getMatch(rSeg);
    if (!pSeg) {
      throw new IllegalStateError(
        'Does not find any matched segment, even NO_MATCH'
      );
    } else if (pSeg == NO_MATCH) {
      throw new NotImplementedError('Matched segment is NO_MATCH');
    }

    // recognize the pattern
    const pattern = recBpPat({
      v,
      r: { a: rAct, s: rSeg, d: rDev },
      p: { a: pAct, s: pSeg, d: pDev },
    });
    if (pattern == null) {
      throw new NotImplementedError('No pattern is recognized');
    } else {
      DxLog.info(`pattern ${pattern.level()}`);
    }
    // push the raw event back to the sequence, and try again
    this.seq.push(e);
    // apply the rules to get the synthesized event
    await pattern.apply(droid);
  }

  private findSegByView(v: DxView, segs: DxSegment[]): DxSegment {
    for (const s of segs) {
      for (const r of s.roots) {
        if (Views.isChild(v, r)) {
          return s;
        }
      }
    }
    throw new IllegalStateError('Cannot find the view on any segment');
  }

  private async find(e: DxXYEvent): Promise<N<ViewMap>> {
    // TODO: what if multiple views with same text
    const { a, x, y } = e;
    // retrieve the view on recordee
    const v = a.findViewByXY(x, y);
    if (v == null) {
      throw new IllegalStateError(
        `No visible view found on recordee tree at (${x}, ${y})`
      );
    }
    // try to select its corresponding view on playee
    const vms = await DxDroid.get().input.select(v);
    return vms.length == 0 ? null : vms[0];
  }

  private async fireOnViewMap(e: DxEvent, v: ViewMap) {
    const {
      bounds: { left, right, top, bottom },
    } = v;
    const x = (left + right) / 2;
    const y = (top + bottom) / 2;
    switch (e.ty) {
      case 'tap':
        return await DxDroid.get().input.tap(x, y);
      case 'double-tap':
        return await DxDroid.get().input.doubleTap(x, y);
      case 'long-tap':
        return await DxDroid.get().input.longTap(x, y);
      case 'swipe':
        throw new NotImplementedError();
      default:
        throw new CannotReachHereError();
    }
  }

  private async top(): Promise<DxActivity> {
    return await DxDroid.get().topActivity(this.app, this.decode, 'dumpsys');
  }

  private isVmVisibleToUser(vm: ViewMap): boolean {
    return vm.visible && vm.important;
  }

  // TODO: add more rules for checking, some views even
  // text view can be skipped, e.g., MoreOptions, maybe
  // a word2vec model should be used here to test more??
  private canSkip(vm: ViewMap): boolean {
    return vm.text == null;
  }
}

export type DxPlayerType = 'px' | 'pt' | 'wdg' | 'res';

export type DxPlayOptions = {
  serial?: string; // phone serial no
  pty: DxPlayerType; // player type
  dxpk: string; // path to dxpk
  K?: number; // look ahead, if use res
  decode: boolean; // decode or not
  verbose?: boolean; // verbose mode
};

export default async function dxPlay(opt: DxPlayOptions): Promise<void> {
  const { serial, pty, dxpk, verbose = false } = opt;

  if (verbose) {
    DxLog.setLevel('DEBUG');
  }

  // connect to droid
  await DxDroid.connect(serial);

  const pkr = await DxPacker.load(dxpk);
  const dev = DxDroid.get().dev;
  const seq = new DxEvSeq(pkr.eventSeq.map((e) => pkr.unpack(e)));

  let player: DxPlayer;
  switch (pty) {
    case 'px':
      if (
        dev.width != pkr.dev.width ||
        dev.height != pkr.dev.height ||
        dev.dpi != pkr.dev.dpi
      ) {
        DxLog.warning(
          "Screen setting is different, you'd better use a more advanced player"
        );
      }
      player = new PxPlayer(pkr.app);
      break;
    case 'pt':
      player = new PtPlayer(pkr.app);
      break;
    case 'wdg':
      player = new WdgPlayer(pkr.app);
      break;
    case 'res':
      if (!opt.K) {
        DxLog.critical(
          'Lookahead K is not specified, use -K or --lookahead to specify it'
        );
        Deno.exit(1);
      }
      player = new ResPlayer(pkr.app, opt.decode, opt.K);
      break;
    default:
      throw new CannotReachHereError();
  }

  await player.play(seq, pkr.dev);
}
