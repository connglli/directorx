import { DevInfo, DxAdb } from './dxadb.ts';
import { 
  DxYota, 
  ViewInputOptions as YotaViewInputOptions, 
  SelectOptions
} from './dxyota.ts';
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
import * as time from './utils/time.ts';
import DxView, { DxActivity, DxViewMap } from './dxview.ts';
import { 
  IllegalStateError, 
  NotImplementedError, 
  CannotReachHereError 
} from './utils/error.ts';

abstract class DxPlayer {
  public readonly timeSensitive = true;
  protected seq: DxEvSeq | null = null;
  constructor(
    public readonly rdev: DevInfo, // record device
    public readonly pdev: DevInfo, // play device,
    public readonly yota: DxYota   // input command
  ) {}

  async play(seq: DxEvSeq): Promise<void> {
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
      await this.playEvent(e);
      DxLog.info(e.toString());
      lastMs = e.t;
    }
  }

  protected abstract async playEvent(e: DxEvent): Promise<void>
}

/** DxPxPlayer plays each event pixel by pixel */
class DxPxPlayer extends DxPlayer {
  protected async playEvent(e: DxEvent): Promise<void> {
    switch (e.ty) {
    case 'tap':
      await this.yota.tap((e as DxTapEvent).x, (e as DxTapEvent).y);
      break;
    case 'long-tap':
      await this.yota.longTap((e as DxLongTapEvent).x, (e as DxLongTapEvent).y);
      break;
    case 'double-tap':
      await this.yota.doubleTap((e as DxDoubleTapEvent).x, (e as DxDoubleTapEvent).y);
      break;
    case 'swipe':
      await this.yota.swipe(
        (e as DxSwipeEvent).x, 
        (e as DxSwipeEvent).y, 
        (e as DxSwipeEvent).dx, 
        (e as DxSwipeEvent).dy
      );
      break;
    case 'key':
      await this.yota.key((e as DxKeyEvent).k);
      break;
    }
  }
}

/** DxPtPlayer plays each event percentage by percentage */
class DxPtPlayer extends DxPlayer {
  protected async playEvent(e: DxEvent): Promise<void> {
    if (e.ty == 'tap') {
      const {x, y} = (e as DxTapEvent);      
      await this.yota.tap(
        this.rec2play(x, false),
        this.rec2play(y, true)
      );
    } else if (e.ty == 'long-tap') {
      const {x, y} = (e as DxLongTapEvent);      
      await this.yota.longTap(
        this.rec2play(x, false),
        this.rec2play(y, true)
      );
    } else if (e.ty == 'double-tap') {
      const {x, y} = (e as DxDoubleTapEvent);      
      await this.yota.doubleTap(
        this.rec2play(x, false),
        this.rec2play(y, true)
      );
    } else if (e.ty == 'swipe') {
      const {
        x, y, dx, dy
      } = (e as DxSwipeEvent);
      await this.yota.swipe(
        this.rec2play(x, false),
        this.rec2play(y, true),
        this.rec2play(dx, false),
        this.rec2play(dy, true)
      );
    } else if (e.ty == 'key') {
      await this.yota.key((e as DxKeyEvent).k);
    }
  }

  private rec2play(x: number, height = false): number {
    if (height) {
      return x / this.rdev.height * this.pdev.height;
    } else {
      return x / this.rdev.width * this.pdev.width;
    }
  }
}

/** DxWdgPlayer plays each event according to its view widget.
 * It matches each view according to its:
 * 1. resId (contains-ignore-case)
 * 2. desc (contains-ignore-case)
 * 3. text (contains-ignore-case)
 * If no views are found, a YotaNoSuchViewException is thrown.
 */
class DxWdgPlayer extends DxPlayer {
  protected async playEvent(e: DxEvent): Promise<void> {
    if (e.ty == 'tap') {
      const {x, y} = (e as DxTapEvent);
      const [opt] = this.makeViewOptOrThrow(e.a, x, y);
      await this.yota.view('tap', opt);
    } else if (e.ty == 'long-tap') {
      const {x, y} = (e as DxLongTapEvent);
      const [opt] = this.makeViewOptOrThrow(e.a, x, y);
      await this.yota.view('longtap', opt);
    } else if (e.ty == 'double-tap') {
      const {x, y} = (e as DxDoubleTapEvent);
      const [opt] = this.makeViewOptOrThrow(e.a, x, y);
      await this.yota.view('doubletap', opt);
    } else if (e.ty == 'swipe') {
      const { x, y } = (e as DxSwipeEvent);
      let  { dx, dy } = (e as DxSwipeEvent);
      const [opt, v] = this.makeViewOptOrThrow(e.a, x, y);
      // adjust so that does not swipe out of screen
      const hCenter = (v.left + v.right) / 2;
      const vCenter = (v.top + v.bottom) / 2;
      if (dx < 0 && hCenter + dx < 0) {
        dx = -hCenter;
      } else if (dx > 0 && hCenter + dx > this.pdev.width) {
        dx = this.pdev.width - hCenter;
      }
      if (dy < 0 && vCenter + dy < 0) {
        dy = -vCenter;
      } else if (dy > 0 && vCenter + dy > this.pdev.height) {
        dy = this.pdev.height - vCenter;
      }
      opt.dx = dx; opt.dy = dy;
      await this.yota.view('swipe', opt);
    } else if (e.ty == 'key') {
      await this.yota.key((e as DxKeyEvent).k);
    }
  }

  private makeViewOptOrThrow(
    a: DxActivity, 
    x: number, 
    y: number
  ): [YotaViewInputOptions, DxView] {
    const v = a.findViewByXY(x, y);
    if (v == null) {
      throw new IllegalStateError(`No visible view found at (${x}, ${y}) on rec tree`);
    }
    const opt: YotaViewInputOptions = {};
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

/** DxResPlayer plays each event responsively */
class DxResPlayer extends DxPlayer {
  constructor(
    rdev: DevInfo,
    pdev: DevInfo,
    yota: DxYota,
    public readonly K: number
  ) {
    super(rdev, pdev, yota);
  }

  protected async playEvent(e: DxEvent): Promise<void> {
    if (!isXYEvent(e)) {
      if (e.ty == 'key') {
        await this.yota.key((e as DxKeyEvent).k);
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

    // ui segmentation -> area matching -> synthesis
    throw new NotImplementedError('Ui Segmentation -> Area Matching -> Synthesis');
  }

  private async find(e: DxXYEvent): Promise<DxViewMap | null> {
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
    const vms = await this.yota.select(opt);
    if (vms.length == 0) {
      return null;
    } else {
      return vms[0];
    }
  }

  private async fireOnViewMap(e: DxEvent, v: DxViewMap) {
    const { bounds: { left, right, top, bottom } } = v;
    const x = (left + right) / 2;
    const y = (top + bottom) / 2;
    switch (e.ty) {
    case 'tap':
      return await this.yota.tap(x, y);
    case 'double-tap':
      return await this.yota.doubleTap(x, y);
    case 'long-tap':
      return await this.yota.longTap(x, y);
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
  K?:       number;      // look ahead, if use res
};

export default async function dxPlay(opt: DxPlayOptions): Promise<void> {
  const {
    serial, pty, dxpk
  } = opt;
  const adb = new DxAdb({ serial });
  const yota = new DxYota(adb);
  
  const packer = await DxPacker.load(dxpk);
  const dev = await adb.fetchInfo();
  const seq = new DxEvSeq(packer.eventSeq.map(e => packer.unpack(e)));

  let player: DxPlayer;
  switch (pty) {
  case 'px':
    if (
      dev.width != packer.dev.width || 
      dev.height != packer.dev.height || 
      dev.dpi != packer.dev.dpi
    ) {
      DxLog.warning('Screen setting is different, you\'d better use a more advanced player');
    }
    player = new DxPxPlayer(packer.dev, dev, yota);
    break;
  case 'pt':
    player = new DxPtPlayer(packer.dev, dev, yota);
    break;
  case 'wdg':
    player = new DxWdgPlayer(packer.dev, dev, yota);
    break;
  case 'res':
    if (!opt.K) {
      DxLog.critical('Lookahead K is not specified, use -K or --lookahead to specify it');
      Deno.exit(1);
    }
    player = new DxResPlayer(packer.dev, dev, yota, opt.K);
    break;
  default:
    throw new CannotReachHereError();
  }

  await player.play(seq);
}