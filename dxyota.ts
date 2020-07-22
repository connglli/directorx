import DxAdb, { 
  AdbResult, 
  AdbError
} from './dxadb.ts';
import DxView, { DxActivity, DxViewFactory, DxViewType } from './dxview.ts';
import { NotImplementedError, IllegalStateError } from './utils/error.ts';
import { DevInfo } from './dxdroid.ts';

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
    throw new NotImplementedError();
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

export interface ViewMap {
  'index': number;
  'package': string;
  'class': string;
  'resource-id': string;
  'visible': boolean;
  'text': string;
  'content-desc': string;
  'clickable': boolean;
  'context-clickable': boolean;
  'long-clickable': boolean;
  'scrollable': boolean;
  'checkable': boolean;
  'checked': boolean;
  'focusable': boolean;
  'focused': boolean;
  'selected': boolean;
  'password': boolean;
  'enabled': boolean;
  'background'?: number;
  'bounds': { // the visible and drawing bounds
    'left': number;
    'right': number;
    'top': number;
    'bottom': number;
  }
}

export interface ViewHierarchyMap extends ViewMap {
  'children': ViewHierarchyMap[]
}

export class ActivityYotaBuilder {
  private width = -1;
  private height = -1;
  constructor(
    public app: string,
    public name: string,
    public dump: string
  ) {}

  withWidth(width: number): ActivityYotaBuilder {
    this.width = width;
    return this;
  }

  withHeight(height: number): ActivityYotaBuilder {
    this.height = height;
    return this;
  }

  build(): DxActivity {
    const a = new DxActivity(this.app, this.name);
    const obj = JSON.parse(this.dump);
    const vhm = obj['hierarchy'] as ViewHierarchyMap;
    this.buildView(vhm, a);
    return a;
  }

  private buildView(vhm: ViewHierarchyMap, a: DxActivity): DxView {
    let v: DxView;
    if (a.decorView == null) {
      const decor = vhm;
      if (decor.bounds.left != 0 || decor.bounds.top != 0) {
        throw new IllegalStateError(`Expect the decor at (0, 0), but at (${decor.bounds.left}, ${decor.bounds.top})`);
      }
      a.installDecor(decor.bounds.right, decor.bounds.bottom, 'ColorDrawable', decor.background!); // eslint-disable-line
      if (a.decorView == null) {
        throw new IllegalStateError('Install decor failed');  
      }
      v = a.decorView;
    } else {
      v = DxViewFactory.create(DxViewType.OTHERS);
      let [resPkg, resType, resEntry] = ['', '', ''];
      if (vhm['resource-id'].length != 0) {
        const resId = vhm['resource-id'];
        const colon = resId.indexOf(':');
        const slash = resId.indexOf('/');
        resPkg = resId.substring(0, colon);
        resType = resId.substring(colon + 1, slash);
        resEntry = resId.substring(slash + 1);
      }
      v.reset(
        vhm.package,
        vhm.class,
        {
          V: vhm.visible ? 'V' : 'I',
          f: vhm.focusable,
          F: vhm.focused,
          S: vhm.selected,
          E: vhm.enabled,
          d: true,
          hs: vhm.scrollable,
          vs: vhm.scrollable,
          c: vhm.clickable,
          lc: vhm['long-clickable'],
          cc: vhm['context-clickable'],
          a: true // TODO, for a non-compressed dump, this is not correct
        },
        vhm.visible,
        'ColorDrawable',
        vhm.background!, // eslint-disable-line
        null,
        vhm.bounds.left,
        vhm.bounds.top,
        vhm.bounds.right,
        vhm.bounds.bottom,
        0,
        0, 0, 0, 0, 0,
        resPkg, resType, resEntry,
        vhm['content-desc'],
        vhm.text
      );
    }

    for (const chm of vhm.children) {
      v!.addView(this.buildView(chm, a)); // eslint-disable-line
    }

    return v!; // eslint-disable-line
  }

  private checkRequiredOrThrow() {
    if (this.width < 0) {
      throw new IllegalStateError('No width exists');
    }
    if (this.height < 0) {
      throw new IllegalStateError('No height exists');
    }
  }
}

export class YotaNoSuchViewError extends AdbError {
  constructor(code: number) {
    super('yota input view', code, 'No such view found');
  }
}

export default class DxYota {
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
    throw new NotImplementedError();
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
      throw new YotaNoSuchViewError(5);
    } else if (status.code != 0) {
      throw new AdbError('yota input view', status.code, status.out);
    }
  }

  async select(opt: ViewOptions): Promise<ViewMap[]> {
    const args = makeSelectOpts(opt);
    let retry = 3, status: AdbResult;
    do {
      retry -= 1; // code == 2 means root is null, retry
      status = await this.adb.raw.shell(`${DxYota.BIN} select ${args}`);
    } while (status.code == 2 && retry > 0);
    if (status.code != 0) {
      throw new AdbError('yota select', status.code, status.out);
    }
    const map = JSON.parse(status.out);
    return map as ViewMap[];
  }

  async info(cmd: string): Promise<string> {
    // TODO info commands may fail on real devices
    return await this.adb.unsafeShell(`${DxYota.BIN} info ${cmd}`);
  }

  async dump(compressed = true): Promise<string> {
    return await this.adb.unsafeExecOut(`${DxYota.BIN} dump ${compressed ? '-c' : ''} -b -o stdout`);
  }

  async topActivity(pkg: string, dev: DevInfo): Promise<DxActivity> {
    const info = await this.info('topactivity');
    const tokens = info.split('/');
    if (tokens[1].startsWith('.')) {
      tokens[1] = tokens[0] + tokens[1];
    }
    if (pkg != tokens[0]) {
      throw new IllegalStateError(`Expect ${pkg}, got ${tokens[0]}`);
    }
    return new ActivityYotaBuilder(pkg, tokens[1], await this.dump())
      .withHeight(dev.height)
      .withWidth(dev.width)
      .build();
  }
}