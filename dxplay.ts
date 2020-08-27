import DxEvent, {
  DxKeyEvent,
  DxLongTapEvent,
  DxDoubleTapEvent,
  DxSwipeEvent,
  DxTapEvent,
  isXYEvent,
  DxEvSeq,
  DxTextEvent,
} from './dxevent.ts';
import DxLog from './dxlog.ts';
import DxPacker from './dxpack.ts';
import DxView from './ui/dxview.ts';
import DxCompatUi from './ui/dxui.ts';
import DxDroid, { DevInfo, ViewInputOptions, ViewMap } from './dxdroid.ts';
import { adaptiveSelect, synthesizePattern, DxBpPat } from './algo/mod.ts';
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
      case 'text':
        await input.key((e as DxTextEvent).x);
        break;
      case 'hsk':
        await DxDroid.get().input.hideSoftKeyboard();
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
    } else if (e.ty == 'text') {
      await input.text((e as DxTextEvent).x);
    } else if (e.ty == 'hsk') {
      await DxDroid.get().input.hideSoftKeyboard();
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
      const [opt] = this.makeViewOptOrThrow(e.ui, x, y);
      await input.view('tap', opt);
    } else if (e.ty == 'long-tap') {
      const { x, y } = e as DxLongTapEvent;
      const [opt] = this.makeViewOptOrThrow(e.ui, x, y);
      await input.view('longtap', opt);
    } else if (e.ty == 'double-tap') {
      const { x, y } = e as DxDoubleTapEvent;
      const [opt] = this.makeViewOptOrThrow(e.ui, x, y);
      await input.view('doubletap', opt);
    } else if (e.ty == 'swipe') {
      const { x, y } = e as DxSwipeEvent;
      let { dx, dy } = e as DxSwipeEvent;
      const [opt, v] = this.makeViewOptOrThrow(e.ui, x, y);
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
    } else if (e.ty == 'text') {
      await input.text((e as DxTextEvent).x);
    } else if (e.ty == 'hsk') {
      await DxDroid.get().input.hideSoftKeyboard();
    }
  }

  private makeViewOptOrThrow(
    u: DxCompatUi,
    x: number,
    y: number
  ): [ViewInputOptions, DxView] {
    const v = u.findViewByXY(x, y);
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
    public readonly K: number,
    public readonly autoHideSoftKeyboard: boolean
  ) {
    super(app);
  }

  async playEvent(e: DxEvent, rDev: DevInfo): Promise<void> {
    if (!isXYEvent(e)) {
      if (e.ty == 'key') {
        await DxDroid.get().input.key((e as DxKeyEvent).k);
      } else if (e.ty == 'text') {
        await DxDroid.get().input.text((e as DxTextEvent).x);
      } else if (e.ty == 'hsk') {
        await DxDroid.get().input.hideSoftKeyboard();
      } else {
        throw new NotImplementedError();
      }
      return;
    }

    // let's hide the soft keyboard firstly
    const droid = DxDroid.get();
    if (this.autoHideSoftKeyboard && (await droid.isSoftKeyboardPresent())) {
      await droid.input.hideSoftKeyboard();
    }

    // find the view in recordee
    const { ui: rUi, x, y } = e;
    const v = rUi.findViewByXY(x, y);
    if (v == null) {
      throw new IllegalStateError(
        `No visible view found on recordee tree at (${x}, ${y})`
      );
    }

    // adaptively select the target view map in playee
    const pDev = droid.dev;
    const vm = await adaptiveSelect(droid.input, v);
    if (vm != null && vm.visible) {
      return await this.fireOnViewMap(e, vm, rDev, pDev);
    }

    // let's synthesize a pattern, and apply the pattern to
    // synthesize an equivalent event sequence
    const pUi = await this.top();
    const patterns = await synthesizePattern(
      this.seq,
      e,
      v,
      rUi,
      pUi,
      rDev,
      pDev,
      droid.input,
      this.K
    );
    if (patterns.length == 0) {
      throw new NotImplementedError('No patterns are synthesized');
    }

    // let's try to apply the patterns one by one in order
    for (const pattern of patterns) {
      if (pattern instanceof DxBpPat) {
        DxLog.info(`try-pattern ${pattern.level}:${pattern.name}`);
      } else {
        DxLog.info(`try-pattern ${pattern.name}`);
      }

      // apply the pattern to get the synthesized event
      try {
        // successfully applied the pattern
        let consumed = await pattern.apply(droid.input);
        if (!consumed) {
          // push the raw event back to the sequence if the event
          // has not been consumed by the pattern
          this.seq.push(e);
        }
        return;
      } catch (x) {
        // failed to apply the pattern
        if (x instanceof IllegalStateError) {
          throw x;
        }
        // throw the exception if the pattern is dirty, i.e.,
        // produced some side effects to the app, and the side
        // effects cannot be dismissed
        if (pattern.dirty && !pattern.dismiss()) {
          throw x;
        } else {
          DxLog.warning(`pattern-failed ${x} try next`);
        }
      }
    }
  }

  private async fireOnViewMap(
    e: DxEvent,
    v: ViewMap,
    rDev: DevInfo,
    pDev: DevInfo
  ) {
    // fire on the top-left corner
    const {
      bounds: { left, right, top, bottom },
    } = v;
    const realX = Math.min(left + 1, right);
    const realY = Math.min(top + 1, bottom);
    switch (e.ty) {
      case 'tap':
        return await DxDroid.get().input.tap(realX, realY);
      case 'double-tap':
        return await DxDroid.get().input.doubleTap(realX, realY);
      case 'long-tap':
        return await DxDroid.get().input.longTap(realX, realY);
      case 'swipe': {
        const { dx, dy, t0, t1 } = e as DxSwipeEvent;
        const duration = t1 - t0;
        const fromX = dx >= 0 ? left + 1 : right - 1;
        const fromY = dy >= 0 ? top + 1 : bottom - 1;
        const realDx = (dx / rDev.width) * pDev.width;
        const realDy = (dy / rDev.height) * pDev.height;
        return await DxDroid.get().input.swipe(
          fromX,
          fromY,
          realDx,
          realDy,
          duration
        );
      }
      default:
        throw new CannotReachHereError();
    }
  }

  private async top(): Promise<DxCompatUi> {
    // TODO: check windows count, and invoke uiautomator at time
    return await DxDroid.get().topActivity(this.app, this.decode, 'dumpsys');
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
  autoHideSoftKeyboard?: boolean; // hide soft keyboard automatically
};

export default async function dxPlay(opt: DxPlayOptions): Promise<void> {
  const {
    serial,
    pty,
    dxpk,
    verbose = false,
    autoHideSoftKeyboard = true,
  } = opt;

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
      player = new ResPlayer(pkr.app, opt.decode, opt.K, autoHideSoftKeyboard);
      break;
    default:
      throw new CannotReachHereError();
  }

  await player.play(seq, pkr.dev);
}
