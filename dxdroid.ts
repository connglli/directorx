import DxAdb, { DevInfo } from './dxadb.ts';
import DxYota, { ViewInputOptions, SelectOptions, ViewMap } from './dxyota.ts';
import { DxActivity } from './dxview.ts';

export {
  DevInfo,
  ViewInputOptions, 
  SelectOptions,
  ViewMap
};

export class DxDroidError extends Error {}

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
      throw new DxDroidError('Not connected by far, use connect() to connect first');
    }
    return DxDroid.instance!; // eslint-disable-line
  }

  get dev(): DevInfo {
    this.check();
    return this.dev_;
  }

  get input(): DxYota {
    this.check();
    return this.yota_;
  }

  async topActivity(pkg: string, decoding = true, tool: 'uiautomator' | 'dumpsys' = 'dumpsys'): Promise<DxActivity> {
    if (tool == 'dumpsys') {
      return await this.adb_.topActivity(pkg, decoding, this.dev);
    } else {
      return await this.yota_.topActivity(pkg, this.dev);
    }
  }

  private inited = false;
  private dev_: DevInfo = null as any as DevInfo; // eslint-disable-line
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
      throw new DxDroidError('Not initialized by far, use init() to init first');
    }
  }
}