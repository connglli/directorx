import * as adb from './adb.ts';

export class YotaException {
  constructor(public cmd: string, public code: number, public msg: string) {}
  toString(): string {
    return `YotaException: \`${this.cmd}\` exited with ${this.code}\n${this.msg}`;
  }
}

export type InputType = 
  | 'tap' 
  | 'longtap' 
  | 'swipe' 
  | 'key' 
  | 'text'
  | 'view';

async function _input(type: InputType, ...args: string[]): Promise<number> {
  return (await adb.shell(`/data/local/tmp/yota input ${type} ${args}`)).code;
}

async function tap(x: number, y: number): Promise<boolean> {
  return await _input('tap', `-x ${x} -y ${y}`) == 0;
}

async function longTap(x: number, y: number): Promise<boolean> {
  return await _input('longtap', `-x ${x} -y ${y}`) == 0;
}

async function doubleTap(x: number, y: number): Promise<boolean> {
  throw 'Not implemented by far';
}

async function swipe(x: number, y: number, dx: number, dy: number, ms: number): Promise<boolean> {
  const steps = ms / 5;
  const toX = x + dx;
  const toY = y + dy;
  return await _input(
    'swipe',
    `--from-x ${x} --from-y ${y} --to-x ${toX} --to-y ${toY} --steps ${steps}`,
  ) == 0;
}

async function key(key: string): Promise<boolean> {
  return await _input('key', key) == 0;
}

async function text(text: string): Promise<boolean> {
  return await _input('text', text) == 0;
}

export type ViewInputType = 
  | 'tap'
  | 'longtap';

export type ViewInputOptions = {
  cls?: string;
  pkg?: string;
  resId?: string;
  text?: string;
  desc?: string;
  clickable?: boolean;
  longClickable?: boolean;
  scrollable?: boolean;
  checkable?: boolean;
  checked?: boolean;
  focusable?: boolean;
  focused?: boolean;
  selected?: boolean;
}

export enum ViewInputRetCode {
  OK, NOK, NO_SUCH_VIEW
}

async function view(type: InputType, opt: ViewInputOptions = {}): Promise<ViewInputRetCode> {
  let args = `--type ${type}`;
  if (opt.cls) {
    args += ` --cls "${opt.cls}"`;
  }
  if (opt.pkg) {
    args += ` --pkg "${opt.pkg}"`;
  }
  if (opt.resId) {
    args += ` --res-id "${opt.resId}"`;
  }
  if (opt.text) {
    args += ` --txt "${opt.text}"`;
  }
  if (opt.desc) {
    args += ` --desc "${opt.desc}"`;
  }
  if (opt.clickable) {
    args += ' --clickable';
  }
  if (opt.longClickable) {
    args += ' --long-clickable';
  }
  if (opt.scrollable) {
    args += ' --scrollable';
  }
  if (opt.checkable) {
    args += ' --checkable';
  }
  if (opt.checked) {
    args += ' --checked';
  }
  if (opt.focusable) {
    args += ' --focusable';
  }
  if (opt.focused) {
    args += ' --focused';
  }
  if (opt.selected) {
    args += ' --selected';
  }
  let retry = 3, code = 0;
  do {
    retry -= 1; // code == 6 means root is null, retry
    code = await _input('view', args);
  } while (code == 6 && retry > 0);
  if (code == 0) {
    return ViewInputRetCode.OK;
  } else if (code == 5) {
    return ViewInputRetCode.NO_SUCH_VIEW;
  } else {
    return ViewInputRetCode.NOK;
  }
}

export const input = {
  tap, 
  longTap, 
  doubleTap, 
  swipe,
  key, 
  text,
  view
};