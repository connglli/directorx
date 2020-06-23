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
  | 'doubletap'
  | 'swipe' 
  | 'key' 
  | 'text'
  | 'view';

async function yotaInput(type: InputType, args: string): Promise<adb.AdbResult> {
  return await adb.shell(`/data/local/tmp/yota input ${type} ${args}`);
}

/** Quotes shell command string with "" */
function q(s: string | number): string {
  return `\\"${s}\\"`;
}

async function tap(x: number, y: number): Promise<void> {
  const {code, out} = await yotaInput('tap', `-x ${q(x)} -y ${q(y)}"`);
  if (code != 0) {
    throw new YotaException('input tap', code, out);
  }
}

async function longTap(x: number, y: number): Promise<void> {
  const {code, out} = await yotaInput('longtap', `-x ${q(x)} -y ${q(y)}`);
  if (code != 0) {
    throw new YotaException('input longtap', code, out);
  }
}

// eslint-disable-next-line
async function doubleTap(x: number, y: number): Promise<void> {
  throw 'Not implemented by far';
}

async function swipe(x: number, y: number, dx: number, dy: number): Promise<void> {
  const steps = 1;
  const toX = x + dx;
  const toY = y + dy;
  const {code, out} = await yotaInput(
    'swipe',
    `--from-x ${q(x)} --from-y ${q(y)} --to-x ${q(toX)} --to-y ${q(toY)} --steps ${q(steps)}`,
  );
  if (code != 0) {
    throw new YotaException('input swipe', code, out);
  }
}

async function key(key: string): Promise<void> {
  const {code, out} = await yotaInput('key', key);
  if (code != 0) {
    throw new YotaException('input key', code, out);
  }
}

async function text(text: string): Promise<void> {
  const {code, out} = await yotaInput('text', text);
  if (code != 0) {
    throw new YotaException('input text', code, out);
  }
}

export type ViewInputType = 
  | 'tap'
  | 'longtap'
  | 'doubletap'
  | 'swipe';

export type ViewInputOptions = {
  cls?: string;
  pkg?: string;
  resIdContains?: string;
  textContains?: string;
  descContains?: string;
  clickable?: boolean;
  longClickable?: boolean;
  scrollable?: boolean;
  checkable?: boolean;
  checked?: boolean;
  focusable?: boolean;
  focused?: boolean;
  selected?: boolean;
  dx?: number; // for swipe only
  dy?: number; // for swipe only
}

function makeViewInputOpts(type: ViewInputType, opt: ViewInputOptions): string {
  if (type == 'doubletap') {
    throw 'Not implemented by far';
  }
  let args = `--type ${type}`;
  if (opt.cls) {
    args += ` --cls ${opt.cls}`;
  }
  if (opt.pkg) {
    args += ` --pkg ${opt.pkg}`;
  }
  if (opt.resIdContains) {
    args += ` --res-id-contains ${q(opt.resIdContains)}`;
  }
  if (opt.textContains) {
    args += ` --txt-contains ${q(opt.textContains)}`;
  }
  if (opt.descContains) {
    args += ` --desc-contains ${q(opt.descContains)}`;
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
  if (type == 'swipe') {
    if (opt.dx) {
      args += ` --dx ${q(opt.dx)}`;
    }
    if (opt.dy) {
      args += ` --dy ${q(opt.dy)}`;
    }
    args += ' --steps 1';
  }
  return args;
}

class YotaNoSuchViewException extends YotaException {
  constructor() {
    super('yota input view', 5, 'No such view found');
  }
}

async function view(type: ViewInputType, opt: ViewInputOptions = {}): Promise<void> {
  const args = makeViewInputOpts(type, opt);
  let retry = 3, status: adb.AdbResult;
  do {
    retry -= 1; // code == 6 means root is null, retry
    status = await yotaInput('view', args);
  } while (status.code == 6 && retry > 0);
  if (status.code == 5) {
    throw new YotaNoSuchViewException();
  } else if (status.code != 0) {
    throw new YotaException('yota input view', status.code, status.out);
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