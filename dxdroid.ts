import DxAdb, { DevInfo } from './dxadb.ts';
import DxYota, {
  ViewInputOptions,
  ViewInputType,
  SelectOptions,
  ViewMap,
} from './dxyota.ts';
import DxEvent, { DxSwipeEvent } from './dxevent.ts';
import DxView, { Views } from './ui/dxview.ts';
import DxCompatUi from './ui/dxui.ts';
import { CannotReachHereError } from './utils/error.ts';

export { DevInfo, ViewInputType, ViewInputOptions, SelectOptions, ViewMap };

export class DxDroidError extends Error {}

export interface DroidInput {
  tap(x: number, y: number): Promise<void>;
  longTap(x: number, y: number): Promise<void>;
  doubleTap(x: number, y: number): Promise<void>;
  swipe(
    x: number,
    y: number,
    dx: number,
    dy: number,
    duration: number
  ): Promise<void>;
  key(key: string): Promise<void>;
  text(text: string): Promise<void>;
  hideSoftKeyboard(): Promise<void>;
  select(opt: SelectOptions): Promise<ViewMap[]>;
  view(type: ViewInputType, opt: ViewInputOptions): Promise<void>;
  pressBack(): Promise<void>;
  convertInput(
    event: DxEvent,
    view: ViewMap | DxView,
    fromDev: DevInfo,
    toDev: DevInfo
  ): Promise<void>;
}

export default class DxDroid {
  private static instance: DxDroid | null = null;

  static async connect(serial?: string): Promise<void> {
    const adb = new DxAdb({ serial });
    const yota = new DxYota(adb);
    this.instance = new DxDroid(adb, yota);
    await this.instance.init();
  }

  static get(): DxDroid {
    if (DxDroid.instance == null) {
      throw new DxDroidError(
        'Not connected by far, use connect() to connect first'
      );
    }
    return DxDroid.instance!; // eslint-disable-line
  }

  get dev(): DevInfo {
    this.check();
    return this.dev_;
  }

  decoding(flag?: boolean) {
    if (flag !== undefined) {
      this.decoding_ = true;
    }
    return this.decoding_;
  }

  get input(): DroidInput {
    this.check();
    return {
      tap: this.yota_.tap.bind(this.yota_),
      longTap: this.yota_.longTap.bind(this.yota_),
      doubleTap: this.yota_.doubleTap.bind(this.yota_),
      swipe: this.yota_.swipe.bind(this.yota_),
      key: this.yota_.key.bind(this.yota_),
      text: this.yota_.text.bind(this.yota_),
      hideSoftKeyboard: this.yota_.hideSoftKeyboard.bind(this.yota_),
      select: this.yota_.select.bind(this.yota_),
      view: this.yota_.view.bind(this.yota_),
      pressBack: this.yota_.pressBack.bind(this.yota_),
      convertInput: async function (
        event: DxEvent,
        view: ViewMap | DxView,
        fromDev: DevInfo,
        toDev: DevInfo
      ) {
        let left: number;
        let right: number;
        let top: number;
        let bottom: number;
        if (view instanceof DxView) {
          left = Views.x0(view);
          right = Views.x1(view);
          top = Views.y0(view);
          bottom = Views.y1(view);
        } else {
          left = view.bounds.left;
          right = view.bounds.right;
          top = view.bounds.top;
          bottom = view.bounds.bottom;
        }
        const realX = Math.min(left + 1, right);
        const realY = Math.min(top + 1, bottom);
        switch (event.ty) {
          case 'tap':
            return await this.tap(realX, realY);
          case 'double-tap':
            return await this.doubleTap(realX, realY);
          case 'long-tap':
            return await this.longTap(realX, realY);
          case 'swipe': {
            const { dx, dy, t0, t1 } = event as DxSwipeEvent;
            const duration = t1 - t0;
            const fromX = dx >= 0 ? left + 1 : right - 1;
            const fromY = dy >= 0 ? top + 1 : bottom - 1;
            let realDx = (dx / fromDev.width) * toDev.width;
            let realDy = (dy / fromDev.height) * toDev.height;
            if (fromY + realDy <= 0) {
              realDy = -fromY + 1;
            } else if (fromY + realDy >= toDev.height) {
              realDy = toDev.height - 1 - fromY;
            }
            if (fromX + realDx <= 0) {
              realDx = -fromX + 1;
            } else if (fromX + realDx >= toDev.width) {
              realDx = toDev.width - 1 - fromX;
            }
            return await this.swipe(fromX, fromY, realDx, realDy, duration);
          }
          default:
            throw new CannotReachHereError();
        }
      },
    };
  }

  async windowCount(pkg: string) {
    return (await this.adb_.windows(pkg)).length;
  }

  async topUi(
    pkg: string,
    tool: 'uiautomator' | 'dumpsys' = 'dumpsys'
  ): Promise<DxCompatUi> {
    if (tool == 'dumpsys') {
      if ((await this.windowCount(pkg)) == 1) {
        return await this.adb_.topActivity(pkg, this.decoding_, this.dev);
      } else {
        return await this.yota_.topUi(pkg, this.dev);
      }
    } else {
      return await this.yota_.topUi(pkg, this.dev);
    }
  }

  async isSoftKeyboardPresent(): Promise<boolean> {
    return await this.adb_.isSoftKeyboardPresent();
  }

  private init_ = false;
  private decoding_ = true;
  private dev_: DevInfo = (null as any) as DevInfo; // eslint-disable-line
  private constructor(
    private readonly adb_: DxAdb,
    private readonly yota_: DxYota
  ) {}

  private async init(): Promise<void> {
    this.dev_ = await this.adb_.fetchInfo();
    this.init_ = true;
  }

  private check() {
    if (!this.init_) {
      throw new DxDroidError(
        'Not initialized by far, use init() to init first'
      );
    }
  }
}
