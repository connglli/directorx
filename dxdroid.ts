import DxAdb, { DevInfo } from './dxadb.ts';
import DxYota, { ViewInputOptions, SelectOptions } from './dxyota.ts';

export {
  DevInfo,
  ViewInputOptions, 
  SelectOptions
};

export class DxDroidError extends Error {}

export default class DxDroid {
  private static instance: DxDroid | null = null;

  static async connect(serial: string | undefined): Promise<void> {
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