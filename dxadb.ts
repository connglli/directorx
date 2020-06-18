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

export type DevInfo = {
  board: string;   // device base board, e.g., sdm845
  brand: string;   // device brand, e.g., OnePlus
  model: string;   // device brand mode, e.g, OnePlus6T
  abi: string;     // device cpu abi
  width: number;   // device width
  height: number;  // device height
  density: number; // device density
  sdk: number;     // Android sdk version
  release: number; // Android release version 
}

const PAT_DEVICE_SIZE = /Physical\ssize:\s(?<w>\d+)x(?<h>\d+)/;
const PAT_DEVICE_DENS = /Physical\sdensity:\s(?<d>\d+)/;

export async function fetchInfo(
  gOpt?: adb.AdbGlobalOptions
): Promise<DevInfo> {
  let width: number;
  let height: number;
  let density: number;
  let out = (await cmd('window size', gOpt)).trim();
  let res = PAT_DEVICE_SIZE.exec(out);
  if (!res || !res.groups) {
    throw new AdbException('window size', -1, 'Match device size failed');
  } else {
    /* eslint-disable */
    width = Number.parseInt(res.groups.w!);
    height = Number.parseInt(res.groups.h!);
  }
  out = (await cmd("window density", gOpt)).trim().split('\n')[0];
  res = PAT_DEVICE_DENS.exec(out);
  if (!res || !res.groups) {
    throw new AdbException("window density", -1, "Match device density failed");
  } else {
    /* eslint-disable */
    density = Number.parseInt(res.groups.d!);
  }

  return {
    board: await getprop('ro.product.board', gOpt),
    brand: await getprop('ro.product.brand', gOpt),
    model: await getprop('ro.product.device', gOpt),
    abi: await getprop('ro.product.cpu.abi', gOpt),
    sdk: Number.parseInt(await getprop('ro.system.build.version.sdk', gOpt)),
    release: Number.parseFloat(await getprop('ro.system.build.version.release', gOpt)),
    width, height, density
  }
}

if (import.meta.main) {
  const dev = await fetchInfo();
  console.log(dev);
  for await (const l of adb.pl.logcat()) {
    console.log(l);
  }
}