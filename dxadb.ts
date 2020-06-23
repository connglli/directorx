export * from './base/adb.ts';
import * as adb from './base/adb.ts';

export class AdbException {
  constructor(public cmd: string, public code: number, public msg: string) {}
  toString(): string {
    return `AdbException: \`${this.cmd}\` exited with ${this.code}\n${this.msg}`;
  }
}

export async function unsafeShell(
  cmd: string, 
  gOpt?: adb.AdbGlobalOptions
): Promise<string> {
  const { code, out } = await adb.shell(cmd, gOpt);
  if (code != 0) {
    throw new AdbException(cmd, code, out);
  }
  return out;
}

export async function unsafeExecOut(
  cmd: string,
  gOpt?: adb.AdbGlobalOptions,
): Promise<string> {
  const { code, out } = await adb.execOut(cmd, gOpt);
  if (code != 0) {
    throw new AdbException(cmd, code, out);
  }
  return out;
}

export async function clearLogcat(gOpt?: adb.AdbGlobalOptions): Promise<void> {
  await adb.logcat(undefined, { clear: true }, gOpt);
}

export async function getprop(prop: string, gOpt?: adb.AdbGlobalOptions): Promise<string> {
  return (await unsafeExecOut(`getprop ${prop}`, gOpt)).trim();
}

export async function cmd(args: string, gOpt?: adb.AdbGlobalOptions): Promise<string> {
  return await unsafeExecOut(`cmd ${args}`, gOpt);
}

export class DevInfo {
  constructor(
    public readonly board: string,   // device base board, e.g., sdm845
    public readonly brand: string,   // device brand, e.g., OnePlus
    public readonly model: string,   // device brand mode, e.g, OnePlus6T
    public readonly abi: string,     // device cpu abi
    public readonly width: number,   // device width, in pixel
    public readonly height: number,  // device height, in pixel
    public readonly dpi: number,     // device dpi (dots per inch) = density * 160
    public readonly sdk: number,     // Android sdk version
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

export async function fetchInfo(
  gOpt?: adb.AdbGlobalOptions
): Promise<DevInfo> {
  let width: number;
  let height: number;
  let dpi: number;
  let out = (await unsafeExecOut('wm size', gOpt)).trim();
  let res = PAT_DEVICE_SIZE.exec(out);
  if (!res || !res.groups) {
    throw new AdbException('window size', -1, 'Match device size failed');
  } else if (res.groups.ow && res.groups.oh) {
    width = Number.parseInt(res.groups.ow);
    height = Number.parseInt(res.groups.oh);
  } else if (res.groups.pw && res.groups.pw) {
    width = Number.parseInt(res.groups.pw);
    height = Number.parseInt(res.groups.ph);
  } else {
    throw new AdbException('window size', -1, 'Match device size failed');
  }
  out = (await unsafeExecOut('wm density', gOpt)).trim();
  res = PAT_DEVICE_DENS.exec(out);
  if (!res || !res.groups) {
    throw new AdbException('window density', -1, 'Match device density failed');
  } else if (res.groups.od) {
    dpi = Number.parseInt(res.groups.od);
  } else if (res.groups.pd) {
    dpi = Number.parseInt(res.groups.pd);
  } else {
    throw new AdbException('window density', -1, 'Match device density failed');
  }
  return new DevInfo(
    await getprop('ro.product.board', gOpt),
    await getprop('ro.product.brand', gOpt),
    await getprop('ro.product.device', gOpt),
    await getprop('ro.product.cpu.abi', gOpt),
    width, height, dpi,
    Number.parseInt(await getprop('ro.system.build.version.sdk', gOpt)),
    Number.parseFloat(await getprop('ro.system.build.version.release', gOpt)),
  );
}

if (import.meta.main) {
  const dev = await fetchInfo();
  console.log(dev);
  for await (const l of adb.pl.logcat()) {
    console.log(l);
  }
}