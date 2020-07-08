import DxEvent, { 
  DxXYEvent,
  DxKeyEvent, 
  DxLongTapEvent, 
  DxDoubleTapEvent, 
  DxSwipeEvent, 
  DxTapEvent, 
  isXYEvent,
  DxEvSeq
} from './dxevent.ts';
import DxLog from './dxlog.ts';
import DxPacker from './dxpack.ts';
import DxView, { DxActivity } from './dxview.ts';
import DxDroid, {
  DevInfo,
  ViewInputOptions, 
  SelectOptions,
  ViewMap
} from './dxdroid.ts';
import * as time from './utils/time.ts';
import { 
  IllegalStateError, 
  NotImplementedError, 
  CannotReachHereError 
} from './utils/error.ts';

abstract class DxPlayer {
  public readonly timeSensitive = true;
  protected seq: DxEvSeq | null = null;
  constructor(
    public readonly app: string,   // app to play
  ) {}

  async play(seq: DxEvSeq, rDev: DevInfo): Promise<void> {
    this.seq = seq;
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

  protected abstract async playEvent(e: DxEvent, rDev: DevInfo): Promise<void>
}

/** PxPlayer plays each event pixel by pixel */
class PxPlayer extends DxPlayer {
  protected async playEvent(e: DxEvent): Promise<void> {
    const input = DxDroid.get().input;
    switch (e.ty) {
    case 'tap':
      await input.tap((e as DxTapEvent).x, (e as DxTapEvent).y);
      break;
    case 'long-tap':
      await input.longTap((e as DxLongTapEvent).x, (e as DxLongTapEvent).y);
      break;
    case 'double-tap':
      await input.doubleTap((e as DxDoubleTapEvent).x, (e as DxDoubleTapEvent).y);
      break;
    case 'swipe':
      await input.swipe(
        (e as DxSwipeEvent).x, 
        (e as DxSwipeEvent).y, 
        (e as DxSwipeEvent).dx, 
        (e as DxSwipeEvent).dy
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
  protected async playEvent(e: DxEvent, rDev: DevInfo): Promise<void> {
    const input = DxDroid.get().input;
    const dev = DxDroid.get().dev;
    if (e.ty == 'tap') {
      const {x, y} = (e as DxTapEvent);      
      await input.tap(
        this.rec2play(x, dev, rDev, false),
        this.rec2play(y, dev, rDev, true)
      );
    } else if (e.ty == 'long-tap') {
      const {x, y} = (e as DxLongTapEvent);      
      await input.longTap(
        this.rec2play(x, dev, rDev, false),
        this.rec2play(y, dev, rDev, true)
      );
    } else if (e.ty == 'double-tap') {
      const {x, y} = (e as DxDoubleTapEvent);      
      await input.doubleTap(
        this.rec2play(x, dev, rDev, false),
        this.rec2play(y, dev, rDev, true)
      );
    } else if (e.ty == 'swipe') {
      const {
        x, y, dx, dy
      } = (e as DxSwipeEvent);
      await input.swipe(
        this.rec2play(x, dev, rDev, false),
        this.rec2play(y, dev, rDev, true),
        this.rec2play(dx, dev, rDev, false),
        this.rec2play(dy, dev, rDev, true)
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
      return x / rDev.height * pDev.height;
    } else {
      return x / rDev.width * pDev.width;
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
  protected async playEvent(e: DxEvent): Promise<void> {
    const input = DxDroid.get().input;
    const dev = DxDroid.get().dev;
    if (e.ty == 'tap') {
      const {x, y} = (e as DxTapEvent);
      const [opt] = this.makeViewOptOrThrow(e.a, x, y);
      await input.view('tap', opt);
    } else if (e.ty == 'long-tap') {
      const {x, y} = (e as DxLongTapEvent);
      const [opt] = this.makeViewOptOrThrow(e.a, x, y);
      await input.view('longtap', opt);
    } else if (e.ty == 'double-tap') {
      const {x, y} = (e as DxDoubleTapEvent);
      const [opt] = this.makeViewOptOrThrow(e.a, x, y);
      await input.view('doubletap', opt);
    } else if (e.ty == 'swipe') {
      const { x, y } = (e as DxSwipeEvent);
      let  { dx, dy } = (e as DxSwipeEvent);
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
      opt.dx = dx; opt.dy = dy;
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
      throw new IllegalStateError(`No visible view found at (${x}, ${y}) on rec tree`);
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

  protected async playEvent(e: DxEvent): Promise<void> {
    if (!isXYEvent(e)) {
      if (e.ty == 'key') {
        await DxDroid.get().input.key((e as DxKeyEvent).k);
      } else {
        throw new NotImplementedError();
      }
      return;
    }

    // find the widget first
    let v = await this.find(e);
    if (v != null) {
      return await this.fireOnViewMap(e, v);
    }

    // try to look ahead next K events
    const nextK = this.seq!.topN(this.K); // eslint-disable-line
    for (const i in nextK) {
      const ne = nextK[i];
      if (!isXYEvent(ne)) { continue; }
      v = await this.find(ne);
      if (v != null) { // find one, directly skip all previously
        this.seq!.popN(Number(i) + 1); // eslint-disable-line
        DxLog.info(`/* skip ${e.toString()} */`);
        return await this.fireOnViewMap(ne, v);
      }
    }

    // ui segmentation -> segment matching -> synthesis
    throw new NotImplementedError('Ui Segmentation -> Segment Matching -> Synthesis');
  }

  private async find(e: DxXYEvent): Promise<ViewMap | null> {
    const { a, x, y } = e;
    const v = a.findViewByXY(x, y);
    if (v == null) {
      throw new IllegalStateError(`No visible view found on rec tree at (${x}, ${y})`);
    }
    const opt: SelectOptions = {
      n: 1
    };
    if (v.resId.length != 0) {
      opt.resIdContains = v.resEntry;
    }
    if (v.text.length != 0) {
      opt.textContains = v.text;
    }
    if (v.desc.length != 0) {
      opt.descContains = v.desc;
    }
    if (!opt.resIdContains && !opt.textContains && !opt.descContains) {
      throw new NotImplementedError('resId, text and desc are all empty');
    }
    const vms = await DxDroid.get().input.select(opt);
    if (vms.length == 0) {
      return null;
    } else {
      return vms[0];
    }
  }

  private async fireOnViewMap(e: DxEvent, v: ViewMap) {
    const { bounds: { left, right, top, bottom } } = v;
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
}

export type DxPlayerType = 
  | 'px' 
  | 'pt' 
  | 'wdg'
  | 'res'; 

export type DxPlayOptions = {
  serial?: string;       // phone serial no
  pty:     DxPlayerType; // player type
  dxpk:    string;       // path to dxpk
  K?:      number;       // look ahead, if use res
  decode:  boolean;      // decode or not
  verbose?: boolean;     // verbose mode
};

export default async function dxPlay(opt: DxPlayOptions): Promise<void> {
  const {
    serial, pty, dxpk, verbose = false
  } = opt;

  if (verbose) {
    DxLog.setLevel('DEBUG');
  }

  // connect to droid
  await DxDroid.connect(serial);
  
  const pkr = await DxPacker.load(dxpk);
  const dev = DxDroid.get().dev;
  const seq = new DxEvSeq(pkr.eventSeq.map(e => pkr.unpack(e)));

  let player: DxPlayer;
  switch (pty) {
  case 'px':
    if (
      dev.width != pkr.dev.width || 
      dev.height != pkr.dev.height || 
      dev.dpi != pkr.dev.dpi
    ) {
      DxLog.warning('Screen setting is different, you\'d better use a more advanced player');
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
      DxLog.critical('Lookahead K is not specified, use -K or --lookahead to specify it');
      Deno.exit(1);
    }
    player = new ResPlayer(pkr.app, opt.decode, opt.K);
    break;
  default:
    throw new CannotReachHereError();
  }

  await player.play(seq, pkr.dev);
}