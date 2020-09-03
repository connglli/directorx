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
import DxSynthesizer from './algo/mod.ts';
import {
  CompactSynthesizer,
  AdaptiveUiAutomatorSelector,
  AdaptiveDumpsysSelector,
  UiSegmenter,
  TfIdfMatcher,
  BottomUpRecognizer,
  IdentityUi,
} from './algo/defaults/mod.ts';
import DxPlugin, { createPlugin, applyPlugin } from './module/plugin.custom.ts';
import createUiNormalizer from './module/uinorm.node.ts';
import * as time from './utils/time.ts';
import {
  IllegalStateError,
  NotImplementedError,
  CannotReachHereError,
} from './utils/error.ts';

type N<T> = T | null;

abstract class DxPlayer {
  static readonly TIME_WARPING_MS_LOW = 100;
  static readonly TIME_WARPING_THRESHOLD_MS_LOW = 700;
  static readonly TIME_WARPING_THRESHOLD_MS_HIGH = 3000;
  static readonly TIME_WARPING_MS_HIGH = 3000;

  static warpTime(t: number) {
    return t < this.TIME_WARPING_THRESHOLD_MS_LOW
      ? this.TIME_WARPING_MS_LOW
      : t > this.TIME_WARPING_THRESHOLD_MS_HIGH
      ? this.TIME_WARPING_MS_HIGH
      : t;
  }

  private seq_: N<DxEvSeq> = null;
  constructor(
    public readonly app: string, // app to play
    public readonly timeSens = true, // time sensitive
    public readonly timeWarp = true // warp time or not
  ) {}

  get seq(): DxEvSeq {
    if (this.seq_) {
      return this.seq_;
    }
    throw new IllegalStateError('Not in playing state');
  }

  async play(seq: DxEvSeq, rDev: DevInfo): Promise<void> {
    this.seq_ = seq;
    let prevEvent: N<DxEvent> = null;
    while (!this.seq.empty()) {
      const currEvent = this.seq.pop();
      DxLog.info(`next-event ${currEvent}`);
      if (this.timeSens) {
        // when time sensitive, let's accumulate time
        let waitTime = 0;
        if (currEvent != prevEvent) {
          // a new event comes
          if (prevEvent) {
            // not the first event, let renew the wait time
            waitTime = currEvent.t - prevEvent.t;
            if (this.timeWarp) {
              waitTime = DxPlayer.warpTime(waitTime);
            }
          } else {
            // do not wait for the first event
            waitTime = 0;
          }
        } else {
          // same as last event, let's wait a minim time
          waitTime = 50;
        }
        if (waitTime > 0) {
          DxLog.info(`wait-time ${waitTime}ms`);
          await time.sleep(waitTime);
        }
      }
      await this.playEvent(currEvent, rDev);
      prevEvent = currEvent;
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
 * If no views are found, a YotaNoSuchViewException is thrown. */
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

type ResPlayerCreateOptions = {
  K?: number; // look ahead count
  autoHideSoftKeyboard?: boolean; // hide soft keyboard automatically
  pluginPath?: string; // plugin that is used before any patterns
  uiNormalizerPath?: string; // ui normalizer that is used to normalize the ui
};

/** ResPlayer plays each event responsively */
class ResPlayer extends DxPlayer {
  constructor(
    app: string,
    public readonly K: number,
    public readonly autoHideSoftKeyboard: boolean,
    public readonly droid: DxDroid,
    public readonly synthesizer: DxSynthesizer,
    public readonly plugin: N<DxPlugin>
  ) {
    super(app);
  }

  static async create(
    app: string,
    droid: DxDroid,
    opt: ResPlayerCreateOptions
  ) {
    const { autoHideSoftKeyboard = true, pluginPath, uiNormalizerPath } = opt;

    if (!opt.K) {
      DxLog.critical(
        'Lookahead K is not specified, use -K or --lookahead to specify it'
      );
      Deno.exit(1);
    }

    const uiNormalizer = uiNormalizerPath
      ? await createUiNormalizer(uiNormalizerPath, droid)
      : new IdentityUi();
    const selector = uiNormalizerPath
      ? new AdaptiveDumpsysSelector(app, droid, uiNormalizer)
      : new AdaptiveUiAutomatorSelector(app, droid);

    const synthesizer = new CompactSynthesizer(
      new DxSynthesizer({
        input: droid.input,
        selector,
        normalizer: new UiSegmenter(),
        matcher: new TfIdfMatcher(),
        recognizer: new BottomUpRecognizer(),
      }),
      opt.K
    );

    const plugin: N<DxPlugin> = pluginPath
      ? await createPlugin(pluginPath, droid)
      : null;

    return new ResPlayer(
      app,
      opt.K,
      autoHideSoftKeyboard,
      droid,
      synthesizer,
      plugin
    );
  }

  async playEvent(e: DxEvent, rDev: DevInfo): Promise<void> {
    if (!isXYEvent(e)) {
      if (e.ty == 'key') {
        await this.droid.input.key((e as DxKeyEvent).k);
      } else if (e.ty == 'text') {
        await this.droid.input.text((e as DxTextEvent).x);
      } else if (e.ty == 'hsk') {
        await this.droid.input.hideSoftKeyboard();
      } else {
        throw new NotImplementedError();
      }
      return;
    }

    // let's hide the soft keyboard firstly
    const droid = this.droid;
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
    const vm = await this.synthesizer.selector.select(v, true);
    if (vm != null && vm.visible) {
      return await droid.input.convertInput(e, vm, rDev, pDev);
    }

    // apply the plugins firstly before our synthesis
    const pUi = await this.synthesizer.selector.topUi();
    if (this.plugin) {
      DxLog.info(`try-plugin ${this.plugin.name()}`);
      if (
        await applyPlugin(this.plugin, {
          event: e,
          view: v,
          seq: this.seq,
          recordee: {
            ui: rUi,
            dev: rDev,
          },
          playee: {
            ui: pUi,
            dev: pDev,
          },
          synthesizer: this.synthesizer,
        })
      ) {
        return;
      } else {
        DxLog.warning('plugin-failed, try next');
      }
    }

    // let's synthesize a pattern, and apply the pattern to
    // synthesize an equivalent event sequence
    const patterns = await this.synthesizer.synthesize(
      this.seq,
      e,
      v,
      rUi,
      pUi,
      rDev,
      pDev
    );
    if (patterns.length == 0) {
      throw new NotImplementedError('No patterns are synthesized');
    }

    // let's try to apply the patterns one by one in order
    for (const pattern of patterns) {
      DxLog.info(`try-pattern ${pattern.name}`);

      // apply the pattern to get the synthesized event
      try {
        // successfully applied the pattern
        let consumed = await pattern.apply(
          droid.input,
          this.synthesizer.selector
        );
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
}

export type DxPlayerType = 'px' | 'pt' | 'wdg' | 'res';

export interface DxPlayOptions extends ResPlayerCreateOptions {
  serial?: string; // phone serial no
  pty: DxPlayerType; // player type
  dxpk: string; // path to dxpk
  decode: boolean; // decode or not
  verbose?: boolean; // verbose mode
}

export default async function dxPlay(opt: DxPlayOptions): Promise<void> {
  const { serial, pty, dxpk, verbose = false, decode } = opt;

  if (verbose) {
    DxLog.setLevel('DEBUG');
  }

  // connect to droid
  await DxDroid.connect(serial);
  DxDroid.get().decoding(decode);

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
      player = await ResPlayer.create(pkr.app, DxDroid.get(), opt);
      break;
    default:
      throw new CannotReachHereError();
  }

  await player.play(seq, pkr.dev);
}
