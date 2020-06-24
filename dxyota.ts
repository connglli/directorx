import { 
  AdbResult, 
  AdbException, 
  DxAdb
} from './dxadb.ts';
import { DxViewMap } from './dxview.ts';

/** Quotes shell command string with "" */
function q(s: string | number): string {
  return `\\"${s}\\"`;
}

export type InputType = 
  | 'tap' 
  | 'longtap' 
  | 'doubletap'
  | 'swipe' 
  | 'key' 
  | 'text'
  | 'view';

export type ViewInputType = 
  | 'tap'
  | 'longtap'
  | 'doubletap'
  | 'swipe';

export interface ViewOptions {
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
}

export interface ViewInputOptions extends ViewOptions {
  dx?: number; // for swipe only
  dy?: number; // for swipe only
}

export interface SelectOptions extends ViewOptions {
  n?: number; // which one
}

function makeViewOpts(opt: ViewOptions): string {
  let args = '';
  if (opt.cls) {
    args += ` --cls ${opt.cls}`;
  }
  if (opt.pkg) {
    args += ` --pkg ${opt.pkg}`;
  }
  if (opt.resIdContains) {
    args += ` --res-id-contains-ignore-case ${q(opt.resIdContains)}`;
  }
  if (opt.textContains) {
    args += ` --txt-contains-ignore-case ${q(opt.textContains)}`;
  }
  if (opt.descContains) {
    args += ` --desc-contains-ignore-case ${q(opt.descContains)}`;
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

  return args;
}

function makeViewInputOpts(type: string, opt: ViewInputOptions): string {
  if (type == 'doubletap') {
    throw 'Not implemented by far';
  }

  let args = `--type ${type} `;
  args += makeViewOpts(opt as ViewOptions);
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

function makeSelectOpts(opt: SelectOptions): string {
  let args = makeViewOpts(opt as ViewOptions);
  if (opt.n) {
    args += ` -n ${q(opt.n)}`;
  }
  return args;
}

export class YotaNoSuchViewException extends AdbException {
  constructor() {
    super('yota input view', 5, 'No such view found');
  }
}

export class DxYota {
  public static readonly BIN = '/data/local/tmp/yota'
  constructor(
    public readonly adb: DxAdb
  ) {}

  async tap(x: number, y: number): Promise<void> { 
    await this.adb.unsafeShell(`${DxYota.BIN} input tap -x ${q(x)} -y ${q(y)}`);
  }

  async longTap(x: number, y: number): Promise<void> {
    await this.adb.unsafeShell(`${DxYota.BIN} input longtap -x ${q(x)} -y ${q(y)}`);
  }

  // eslint-disable-next-line
  async doubleTap(x: number, y: number): Promise<void> {
    throw 'Not implemented by far';
  }

  async swipe(x: number, y: number, dx: number, dy: number): Promise<void> {
    const steps = 1;
    const toX = x + dx;
    const toY = y + dy;
    await this.adb.unsafeShell(
      `${DxYota.BIN} input swipe --from-x ${q(x)} --from-y ${q(y)} --to-x ${q(toX)} --to-y ${q(toY)} --steps ${q(steps)}`,
    );
  }

  async key(key: string): Promise<void> {
    await this.adb.unsafeShell(`${DxYota.BIN} input key ${key}`);
  }

  async text(text: string): Promise<void> {
    await this.adb.unsafeShell(`${DxYota.BIN} input text ${text}`);
  }

  async view(type: ViewInputType, opt: ViewInputOptions = {}): Promise<void> {
    const args = makeViewInputOpts(type, opt);
    let retry = 3, status: AdbResult;
    do {
      retry -= 1; // code == 6 means root is null, retry
      status = await this.adb.raw.shell(`${DxYota.BIN} input view ${args}`);
    } while (status.code == 6 && retry > 0);
    if (status.code == 5) {
      throw new YotaNoSuchViewException();
    } else if (status.code != 0) {
      throw new AdbException('yota input view', status.code, status.out);
    }
  }

  async select(opt: ViewOptions): Promise<DxViewMap[]> {
    const args = makeSelectOpts(opt);
    let retry = 3, status: AdbResult;
    do {
      retry -= 1; // code == 2 means root is null, retry
      status = await this.adb.raw.shell(`${DxYota.BIN} select ${args}`);
    } while (status.code == 2 && retry > 0);
    if (status.code != 0) {
      throw new AdbException('yota select', status.code, status.out);
    }
    const map = JSON.parse(status.out);
    return map as DxViewMap[];
  }
}
