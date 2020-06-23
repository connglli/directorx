import * as yota from './base/yota.ts';
import * as adb from './dxadb.ts';
import DxEvent, { DxKeyEvent, DxLongTapEvent, DxDoubleTapEvent, DxSwipeEvent, DxTapEvent } from './dxevent.ts';
import DxLog from './dxlog.ts';
import DxPacker from './dxpack.ts';
import * as time from './utils/time.ts';
import DxView, { DxActivity } from './dxview.ts';

type DevInfo = adb.DevInfo;

abstract class DxPlayer {
  public readonly timeSensitive = true;
  constructor(
    public readonly rdev: adb.DevInfo, // record device
    public readonly pdev: adb.DevInfo  // play device
  ) {}

  async play(seq: DxEvent[]): Promise<void> {
    let lastMs = -1;
    for (const e of seq) {
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

  abstract async playEvent(e: DxEvent): Promise<void>
}

/** DxPxPlayer plays each event pixel by pixel */
class DxPxPlayer extends DxPlayer {
  constructor(
    rdev: adb.DevInfo, // record device
    pdev: adb.DevInfo  // play device
  ) {
    super(rdev, pdev);
  }

  async playEvent(e: DxEvent): Promise<void> {
    switch (e.ty) {
    case 'tap':
      await yota.input.tap((e as DxTapEvent).x, (e as DxTapEvent).y);
      break;
    case 'long-tap':
      await yota.input.longTap((e as DxLongTapEvent).x, (e as DxLongTapEvent).y);
      break;
    case 'double-tap':
      await yota.input.doubleTap((e as DxDoubleTapEvent).x, (e as DxDoubleTapEvent).y);
      break;
    case 'swipe':
      await yota.input.swipe(
        (e as DxSwipeEvent).x, 
        (e as DxSwipeEvent).y, 
        (e as DxSwipeEvent).dx, 
        (e as DxSwipeEvent).dy
      );
      break;
    case 'key':
      await yota.input.key((e as DxKeyEvent).k);
      break;
    }
  }
}

/** DxPtPlayer plays each event percentage by percentage */
class DxPtPlayer extends DxPlayer {
  constructor(
    rdev: adb.DevInfo, // record device
    pdev: adb.DevInfo  // play device
  ) {
    super(rdev, pdev);
  }

  async playEvent(e: DxEvent): Promise<void> {
    if (e.ty == 'tap') {
      const {x, y} = (e as DxTapEvent);      
      await yota.input.tap(
        this.rec2play(x, false),
        this.rec2play(y, true)
      );
    } else if (e.ty == 'long-tap') {
      const {x, y} = (e as DxLongTapEvent);      
      await yota.input.longTap(
        this.rec2play(x, false),
        this.rec2play(y, true)
      );
    } else if (e.ty == 'double-tap') {
      const {x, y} = (e as DxDoubleTapEvent);      
      await yota.input.doubleTap(
        this.rec2play(x, false),
        this.rec2play(y, true)
      );
    } else if (e.ty == 'swipe') {
      const {
        x, y, dx, dy
      } = (e as DxSwipeEvent);
      await yota.input.swipe(
        this.rec2play(x, false),
        this.rec2play(y, true),
        this.rec2play(dx, false),
        this.rec2play(dy, true)
      );
    } else if (e.ty == 'key') {
      await yota.input.key((e as DxKeyEvent).k);
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

/** DxWdgPlayer plays each event according to its view */
class DxWdgPlayer extends DxPlayer {
  constructor(
    rdev: adb.DevInfo, // record device
    pdev: adb.DevInfo  // play device
  ) {
    super(rdev, pdev);
  }

  async playEvent(e: DxEvent): Promise<void> {
    if (e.ty == 'tap') {
      const {x, y} = (e as DxTapEvent);
      const [opt] = this.makeViewOptOrThrow(e.a, x, y);
      await yota.input.view('tap', opt);
    } else if (e.ty == 'long-tap') {
      const {x, y} = (e as DxLongTapEvent);
      const [opt] = this.makeViewOptOrThrow(e.a, x, y);
      await yota.input.view('longtap', opt);
    } else if (e.ty == 'double-tap') {
      const {x, y} = (e as DxDoubleTapEvent);
      const [opt] = this.makeViewOptOrThrow(e.a, x, y);
      await yota.input.view('doubletap', opt);
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
      await yota.input.view('swipe', opt);
    } else if (e.ty == 'key') {
      await yota.input.key((e as DxKeyEvent).k);
    }
  }

  private makeViewOptOrThrow(
    a: DxActivity, 
    x: number, 
    y: number
  ): [yota.ViewInputOptions, DxView] {
    const v = a.findViewByXY(x, y);
    if (v == null) {
      throw `No visible view found at (${x}, ${y}) on rec tree`;
    }
    const opt: yota.ViewInputOptions = {};
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

export type DxPlayerType = 
  | 'px' 
  | 'pt' 
  | 'wdg'
  | 'res'; 

export type DxPlayOptions = {
  pty: DxPlayerType; // player type
  dxpk: string;      // path to dxpk
};

export default async function dxPlay(opt: DxPlayOptions): Promise<void> {
  const {
    pty, dxpk
  } = opt;
  
  const packer = await DxPacker.load(dxpk);
  const dev = await adb.fetchInfo();
  const seq: DxEvent[] = [];

  for (const ep of packer.eventSeq) {
    seq.push(packer.unpack(ep));
  }

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
    player = new DxPxPlayer(packer.dev, dev);
    break;
  case 'pt':
    player = new DxPtPlayer(packer.dev, dev);
    break;
  case 'wdg':
    player = new DxWdgPlayer(packer.dev, dev);
    break;
  default:
    throw 'Not implemented by far';
  }

  try {
    await player.play(seq);
  } catch (t) {
    DxLog.critical(t);
  }
}