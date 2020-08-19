import DxAdb, { DevInfo } from './dxadb.ts';
import DxYota, {
  ViewInputOptions,
  ViewInputType,
  SelectOptions,
  ViewMap,
} from './dxyota.ts';
import DxCompatUi from './ui/dxui.ts';

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

  get input(): DroidInput {
    this.check();
    return this.yota_;
  }

  async topActivity(
    pkg: string,
    decoding = true,
    tool: 'uiautomator' | 'dumpsys' = 'dumpsys'
  ): Promise<DxCompatUi> {
    // TODO: recognize window count, and use uiautomator
    // if there are multiple windows
    if (tool == 'dumpsys') {
      return await this.adb_.topActivity(pkg, decoding, this.dev);
    } else {
      return await this.yota_.topActivity(pkg, this.dev);
    }
  }

  async isSoftKeyboardPresent(): Promise<boolean> {
    return await this.adb_.isSoftKeyboardPresent();
  }

  private inited = false;
  private dev_: DevInfo = (null as any) as DevInfo; // eslint-disable-line
  private constructor(
    private readonly adb_: DxAdb,
    private readonly yota_: DxYota
  ) {}

  private async init(): Promise<void> {
    this.dev_ = await this.adb_.fetchInfo();
    this.inited = true;
  }

  private check() {
    if (!this.inited) {
      throw new DxDroidError(
        'Not initialized by far, use init() to init first'
      );
    }
  }
}
