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
      this.playEvent(e);
      lastMs = e.t;
    }
  }

  abstract playEvent(e: DxEvent): void
}

/** DxPxPlayer plays each event pixel by pixel */
class DxPxPlayer extends DxPlayer {
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
        (e as DxSwipeEvent).dy, 
        (e as DxSwipeEvent).t1 - (e as DxSwipeEvent).t0,
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
    public readonly playDev: DevInfo, 
    public readonly recDev: DevInfo
  ) {
    super();
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
        x, y, dx, dy, t0, t1
      } = (e as DxSwipeEvent);
      await yota.input.swipe(
        this.rec2play(x, false),
        this.rec2play(y, true),
        this.rec2play(dx, false),
        this.rec2play(dy, true),
        t1 - t0
      );
    } else if (e.ty == 'key') {
      await yota.input.key((e as DxKeyEvent).k);
    }
  }

  private rec2play(x: number, height = false): number {
    if (height) {
      return x / this.recDev.height * this.playDev.height;
    } else {
      return x / this.recDev.width * this.playDev.width;
    }
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
    player = new DxPxPlayer();
    break;
  case 'pt':
    player = new DxPtPlayer(dev, packer.dev);
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