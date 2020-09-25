import DxAdb, { DevInfo } from './dxadb.ts';
import DxYota, {
  ViewInputOptions,
  ViewInputType,
  SelectOptions,
  ViewMap,
} from './dxyota.ts';
import type DxEvent from './dxevent.ts';
import type { DxSwipeEvent } from './dxevent.ts';
import DxView, { Views } from './ui/dxview.ts';
import type DxCompatUi from './ui/dxui.ts';
import DxLog from './dxlog.ts';
import { XYInterval } from './utils/interval.ts';
import { CannotReachHereError, IllegalStateError } from './utils/error.ts';

export { DevInfo };
export type { ViewInputType, ViewInputOptions, SelectOptions, ViewMap };

export class DxDroidError extends Error {}

export interface DroidInput {
  tap(x: number, y: number, v?: DxView): Promise<void>;
  longTap(x: number, y: number, v?: DxView): Promise<void>;
  doubleTap(x: number, y: number, v?: DxView): Promise<void>;
  swipe(
    x: number,
    y: number,
    dx: number,
    dy: number,
    duration: number,
    v?: DxView
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

class LoggedInput implements DroidInput {
  constructor(public readonly input: DroidInput) {}

  tap(x: number, y: number, v?: DxView): Promise<void> {
    DxLog.info(`tap (${x}, ${y}) ${this.asSimpleString(v)}`);
    return this.input.tap(x, y);
  }

  longTap(x: number, y: number, v?: DxView): Promise<void> {
    DxLog.info(`long-tap (${x}, ${y}) ${this.asSimpleString(v)}`);
    return this.input.tap(x, y);
  }

  doubleTap(x: number, y: number, v?: DxView): Promise<void> {
    DxLog.info(`double-tap (${x}, ${y}) ${this.asSimpleString(v)}`);
    return this.input.tap(x, y);
  }

  swipe(
    x: number,
    y: number,
    dx: number,
    dy: number,
    duration: number,
    v?: DxView
  ): Promise<void> {
    DxLog.info(`swipe (${x}, ${y}) + (${dx}, ${dy}) ${this.asSimpleString(v)}`);
    return this.input.swipe(x, y, dx, dy, duration);
  }

  key(key: string): Promise<void> {
    DxLog.info(`key ${key}`);
    return this.input.key(key);
  }

  text(text: string): Promise<void> {
    DxLog.info(`text ${text}`);
    return this.input.text(text);
  }

  hideSoftKeyboard(): Promise<void> {
    DxLog.info('hide-soft-keyboard');
    return this.input.hideSoftKeyboard();
  }

  select(opt: SelectOptions): Promise<ViewMap[]> {
    return this.input.select(opt);
  }

  view(type: ViewInputType, opt: ViewInputOptions): Promise<void> {
    return this.input.view(type, opt);
  }

  pressBack(): Promise<void> {
    DxLog.info('press-back');
    return this.input.pressBack();
  }

  convertInput(
    event: DxEvent,
    view: ViewMap | DxView,
    fromDev: DevInfo,
    toDev: DevInfo
  ): Promise<void> {
    DxLog.info(`${event.ty} ${this.asSimpleString(view)}`);
    return this.input.convertInput(event, view, fromDev, toDev);
  }

  private asSimpleString(view?: DxView | ViewMap) {
    if (!view) {
      return '';
    } else if (view instanceof DxView) {
      return `cls=${view.cls} id="${view.resId}" text="${view.text}" desc="${
        view.desc
      }" x=${Views.x0(view)}-${Views.x1(view)} y=${Views.y0(view)}-${Views.y1(
        view
      )} z=${Views.z(view)}`;
    } else {
      return `cls=${view.class} id="${view['resource-id']}" text="${view.text}" desc="${view['content-desc']}" x=${view.bounds.left}-${view.bounds.right} y=${view.bounds.top}-${view.bounds.bottom} z=0`;
    }
  }
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

  get adb(): DxAdb {
    this.check();
    return this.adb_;
  }

  decoding(flag?: boolean) {
    this.check();
    if (flag !== undefined) {
      this.decoding_ = true;
    }
    return this.decoding_;
  }

  setInputCenter(center: boolean = true) {
    this.inputOpt_.center = center;
  }

  get input(): DroidInput {
    this.check();
    const self = this;
    return new LoggedInput({
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
        const bounds = XYInterval.overlap(
          XYInterval.of(0, self.dev.width, 0, self.dev.height),
          XYInterval.of(left, right, top, bottom)
        );
        if (!bounds) {
          throw new IllegalStateError('View is not visible to user');
        }
        let realX: number;
        let realY: number;
        if (self.inputOpt_.center) {
          realX = (bounds.x.low + bounds.x.high) / 2;
          realY = (bounds.y.low + bounds.y.high) / 2;
        } else {
          realX = bounds.x.low + 1;
          realY = bounds.y.low + 1;
        }
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
    });
  }

  async windowCount(pkg: string) {
    return (await this.adb_.windows(pkg)).length;
  }

  async activityCount(pkg: string) {
    return (await this.adb_.activities(pkg)).length;
  }

  async topUi(
    pkg: string,
    tool: 'uiautomator' | 'dumpsys' = 'dumpsys'
  ): Promise<DxCompatUi> {
    if (tool == 'dumpsys') {
      if ((await this.windowCount(pkg)) == (await this.activityCount(pkg))) {
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
  private inputOpt_ = {
    center: true, // tap center, or top-left
  };
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
