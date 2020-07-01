import { 
  AdbBindShape, 
  bindAdb, 
  AdbGlobalOptions, 
  LogcatBuffer, 
  LogcatBufferSize 
} from './base/adb.ts';
export * from './base/adb.ts';

export class AdbError extends Error {
  constructor(
    public cmd: string, 
    public code: number, 
    public msg: string
  ) {
    super(`AdbError[\`${cmd}\`=>${code}] ${msg}`);
  }
}

export class DevInfo {
  constructor(
    public readonly board: string,  // device base board, e.g., sdm845
    public readonly brand: string,  // device brand, e.g., OnePlus
    public readonly model: string,  // device brand mode, e.g, OnePlus6T
    public readonly abi: string,    // device cpu abi
    public readonly width: number,  // device width, in pixel
    public readonly height: number, // device height, in pixel
    public readonly dpi: number,    // device dpi (dots per inch) = density * 160
    public readonly sdk: number,    // Android sdk version
    public readonly release: number // Android release version 
  ) {}

  get density(): number {
    return this.dpi / 160;
  }

  px2dp(px: number): number {
    return px * this.density;
  }

  dp2px(dp: number): number {
    return dp / this.density;
  }
}

const PAT_DEVICE_SIZE = /Physical\ssize:\s(?<pw>\d+)x(?<ph>\d+)(\nOverride\ssize:\s(?<ow>\d+)x(?<oh>\d+))?/;
const PAT_DEVICE_DENS = /Physical\sdensity:\s(?<pd>\d+)(\nOverride\sdensity:\s(?<od>\d+))?/;

export class DxAdb {
  public readonly raw: AdbBindShape;
  constructor(gOpt: AdbGlobalOptions) {
    this.raw = bindAdb(gOpt);
  }

  async unsafeShell(cmd: string): Promise<string> {
    const { code, out } = await this.raw.shell(cmd);
    if (code != 0) {
      throw new AdbError(cmd, code, out);
    }
    return out;
  }

  async unsafeExecOut(cmd: string): Promise<string> {
    const { code, out } = await this.raw.execOut(cmd);
    if (code != 0) {
      throw new AdbError(cmd, code, out);
    }
    return out;
  }

  async clearLogcat(buffers: LogcatBuffer[] = ['all']): Promise<void> {
    await this.raw.logcat(undefined, { 
      clear: true, 
      buffers 
    });
  }

  async setLogcatSize(size: LogcatBufferSize, buffers: LogcatBuffer[] = ['all']): Promise<void> {
    await this.raw.logcat(undefined, {
      buffers,
      bufSize: size
    });
  }

  async getprop(prop: string): Promise<string> {
    return (await this.unsafeExecOut(`getprop ${prop}`)).trim();
  }

  async cmd(args: string): Promise<string> {
    return await this.unsafeExecOut(`cmd ${args}`);
  }

  async fetchInfo(): Promise<DevInfo> {
    let width: number;
    let height: number;
    let dpi: number;
    let out = (await this.unsafeExecOut('wm size')).trim();
    let res = PAT_DEVICE_SIZE.exec(out);
    if (!res || !res.groups) {
      throw new AdbError('window size', -1, 'Match device size failed');
    } else if (res.groups.ow && res.groups.oh) {
      width = Number.parseInt(res.groups.ow);
      height = Number.parseInt(res.groups.oh);
    } else if (res.groups.pw && res.groups.pw) {
      width = Number.parseInt(res.groups.pw);
      height = Number.parseInt(res.groups.ph);
    } else {
      throw new AdbError('window size', -1, 'Match device size failed');
    }
    out = (await this.unsafeExecOut('wm density')).trim();
    res = PAT_DEVICE_DENS.exec(out);
    if (!res || !res.groups) {
      throw new AdbError('window density', -1, 'Match device density failed');
    } else if (res.groups.od) {
      dpi = Number.parseInt(res.groups.od);
    } else if (res.groups.pd) {
      dpi = Number.parseInt(res.groups.pd);
    } else {
      throw new AdbError('window density', -1, 'Match device density failed');
    }
    return new DevInfo(
      await this.getprop('ro.product.board'),
      await this.getprop('ro.product.brand'),
      await this.getprop('ro.product.device'),
      await this.getprop('ro.product.cpu.abi'),
      width, height, dpi,
      Number.parseInt(await this.getprop('ro.system.build.version.sdk')),
      Number.parseFloat(await this.getprop('ro.system.build.version.release'))
    );
  }
}