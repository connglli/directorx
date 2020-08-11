import DxAdb, { AdbResult, AdbError } from './dxadb.ts';
import DxView, { ViewFactory, ViewType, ViewProps } from './ui/dxview.ts';
import DxCompatUi from './ui/dxui.ts';
import { NotImplementedError, IllegalStateError } from './utils/error.ts';
import { DevInfo } from './dxdroid.ts';
import { doc2freq, freq2vec, similarity } from './utils/vecutil.ts';
import { splitAsWords, filterStopwords } from './utils/strutil.ts';

/** Quotes shell command string with "" */
function q(s: string | number): string {
  return `'"${s}"'`;
}

export type InputType =
  | 'tap'
  | 'longtap'
  | 'doubletap'
  | 'swipe'
  | 'key'
  | 'text'
  | 'view';

export type ViewInputType = 'tap' | 'longtap' | 'doubletap' | 'swipe';

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
  compressed?: boolean; // compressed tree
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
    args += ' --duration 300';
  }

  return args;
}

function makeSelectOpts(opt: SelectOptions): string {
  let args = makeViewOpts(opt as ViewOptions);
  if (opt.n) {
    args += ` -n ${q(opt.n)}`;
  }
  if (opt.compressed) {
    args += ` --compressed`;
  }
  return args;
}

// Dumped view map properties
interface DumpViewProps {
  index: number;
  package: string;
  class: string;
  'resource-id': string;
  visible: boolean;
  text: string;
  'content-desc': string;
  clickable: boolean;
  'context-clickable': boolean;
  'long-clickable': boolean;
  scrollable: boolean;
  checkable: boolean;
  checked: boolean;
  focusable: boolean;
  focused: boolean;
  selected: boolean;
  password: boolean;
  enabled: boolean;
  important: boolean;
  background?: number;
  bounds: {
    // the visible and drawing bounds
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
}

// Dumped view hierarchy properties
interface DumpViewHierarchyProps extends DumpViewProps {
  children: DumpViewHierarchyProps[];
}

// Computed view map properties
interface CompViewProps {
  'resource-pkg': string;
  'resource-type': string;
  'resource-entry': string;
}

/** Exported ViewMap includes all properties from
 * dumped and computed
 */
export type ViewMap = DumpViewProps & CompViewProps;

function splitResourceId(resId: string): [string, string, string] {
  if (resId.length == 0) return ['', '', ''];
  const colon = resId.indexOf(':');
  const slash = resId.indexOf('/');
  if (colon == -1 || slash == -1) {
    return ['', '', ''];
  }
  return [
    resId.substring(0, colon),
    resId.substring(colon + 1, slash),
    resId.substring(slash + 1),
  ];
}

export class ActivityYotaBuilder {
  private width = -1;
  private height = -1;
  constructor(public app: string, public name: string, public dump: string) {}

  withWidth(width: number): ActivityYotaBuilder {
    this.width = width;
    return this;
  }

  withHeight(height: number): ActivityYotaBuilder {
    this.height = height;
    return this;
  }

  build(): DxCompatUi {
    const a = new DxCompatUi(this.app, this.name);
    const obj = JSON.parse(this.dump);
    const vhm = obj['hierarchy'] as DumpViewHierarchyProps;
    this.buildView(vhm, a);
    return a;
  }

  private buildView(vhp: DumpViewHierarchyProps, a: DxCompatUi): DxView {
    let v: DxView;
    if (a.decorView == null) {
      const decor = vhp;
      if (decor.bounds.left != 0 || decor.bounds.top != 0) {
        throw new IllegalStateError(
          `Expect the decor at (0, 0), but at (${decor.bounds.left}, ${decor.bounds.top})`
        );
      }
      a.installDecor(
        '',
        decor.bounds.right,
        decor.bounds.bottom,
        'ColorDrawable',
        decor.background!
      ); // eslint-disable-line
      if (a.decorView == null) {
        throw new IllegalStateError('Install decor failed');
      }
      v = a.decorView;
    } else {
      let [resPkg, resType, resEntry] = splitResourceId(vhp['resource-id']);
      const props: ViewProps = {
        package: vhp.package,
        class: vhp.class,
        id: '', // TODO: how to add id
        hash: '', // TODO: use dep-index to replace hash
        flags: {
          V: vhp.visible ? 'V' : 'I',
          f: vhp.focusable,
          F: vhp.focused,
          S: vhp.selected,
          E: vhp.enabled,
          d: true,
          s: {
            l: vhp.scrollable,
            r: vhp.scrollable,
            t: vhp.scrollable,
            b: vhp.scrollable,
          },
          c: vhp.clickable,
          lc: vhp['long-clickable'],
          cc: vhp['context-clickable'],
          a: vhp['important'],
        },
        shown: vhp.visible,
        bgClass: 'ColorDrawable',
        bgColor: vhp.background!, // eslint-disable-line
        foreground: null,
        left: vhp.bounds.left,
        top: vhp.bounds.top,
        right: vhp.bounds.right,
        bottom: vhp.bounds.bottom,
        elevation: 0,
        translationX: 0,
        translationY: 0,
        translationZ: 0,
        scrollX: 0,
        scrollY: 0,
        resPkg,
        resType,
        resEntry,
        desc: vhp['content-desc'],
        text: vhp.text,
      };
      v = ViewFactory.create(ViewType.VIEW, props);
    }

    for (const chm of vhp.children) {
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
  public static readonly BIN = '/data/local/tmp/yota';
  constructor(public readonly adb: DxAdb) {}

  async tap(x: number, y: number): Promise<void> {
    await this.adb.unsafeShell(`${DxYota.BIN} input tap -x ${q(x)} -y ${q(y)}`);
  }

  async longTap(x: number, y: number): Promise<void> {
    await this.adb.unsafeShell(
      `${DxYota.BIN} input longtap -x ${q(x)} -y ${q(y)}`
    );
  }

  // eslint-disable-next-line
  async doubleTap(x: number, y: number): Promise<void> {
    throw new NotImplementedError();
  }

  async swipe(
    x: number,
    y: number,
    dx: number,
    dy: number,
    duration: number
  ): Promise<void> {
    const toX = x + dx;
    const toY = y + dy;
    await this.adb.unsafeShell(
      `${DxYota.BIN} input swipe --from-x ${q(x)} --from-y ${q(y)} --to-x ${q(
        toX
      )} --to-y ${q(toY)} --duration ${q(duration)}`
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
    let retry = 3,
      status: AdbResult;
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
    let retry = 3,
      status: AdbResult;
    do {
      retry -= 1; // code == 2 means root is null, retry
      status = await this.adb.raw.shell(`${DxYota.BIN} select ${args}`);
    } while (status.code == 2 && retry > 0);
    if (status.code != 0) {
      throw new AdbError('yota select', status.code, status.out);
    }
    const dvps = JSON.parse(status.out) as DumpViewProps[];
    return dvps.map((dvp) => {
      const [resPkg, resType, resEntry] = splitResourceId(dvp['resource-id']);
      const cvp: CompViewProps = {
        'resource-pkg': resPkg,
        'resource-type': resType,
        'resource-entry': resEntry,
      };
      return { ...dvp, ...cvp };
    });
  }

  async info(cmd: string): Promise<string> {
    // TODO: info commands may fail on real devices
    return await this.adb.unsafeShell(`${DxYota.BIN} info ${cmd}`);
  }

  async adaptiveSelect(
    view: DxView,
    compressed = true // use this flag only when no compressed flag in optOrView
  ): Promise<ViewMap | null> {
    let opt: SelectOptions;
    let vms: ViewMap[];
    opt = {
      compressed: compressed,
    };
    // let's try the most comprehensive selection, i.e., use both text
    // and another property to select our target view
    opt.textContains = view.text.length > 0 ? view.text : undefined;
    opt.resIdContains = view.resId.length > 0 ? view.resEntry : undefined;
    opt.descContains = view.desc.length > 0 ? view.desc : undefined;
    // if there is only text, then use the less comprehensive selection
    if (opt.textContains && (opt.resIdContains || opt.descContains)) {
      vms = await this.select(opt);
      // choose the best match: text is complete same
      if (vms.length >= 1) {
        let found =
          (vms.find((vm) => vm.text == view.text) ||
            vms.find(
              (vm) => vm.text.toLowerCase() == view.text.toLowerCase()
            )) ??
          null;
        if (found) {
          return found;
        }
      }
    }
    // clear the opt
    opt.textContains = undefined;
    opt.resIdContains = undefined;
    opt.descContains = undefined;
    // let's try some less comprehensive selection: we always treat the
    // visual information (the text) as the most important because the
    // text is shown to users. we also think that, if a view is shown
    // to users using its text on one device, it must shown to users on
    // others using similar text, and thereby, if there are text in a view,
    // then we use the text to find the view, and if no views found, we
    // never try other props like res-id and content description
    if (view.text.length != 0) {
      // find the best one => the least length
      opt.textContains = view.text;
      vms = await this.select(opt);
      // always choose the best match, because if a view has
      // some text that presents to a user, it is probably
      // not changed across devices
      // TODO: what if there are multiple? (add context info)
      // FIX: sometimes, yota returns the capitalized text (because
      // of text view settings)
      return (
        (vms.find((vm) => vm.text == view.text) ||
          vms.find((vm) => vm.text.toLowerCase() == view.text.toLowerCase())) ??
        null
      );
    }
    // no text, let's try resource-id and content-desc
    if (view.resId.length != 0) {
      opt.resIdContains = view.resEntry;
      vms = await this.select(opt);
      if (vms.length == 1) {
        return vms[0];
      } else if (vms.length > 1) {
        // prefer same entries
        const sameEntries = vms.filter(
          (vm) => vm['resource-entry'] == view.resEntry
        );
        if (sameEntries.length == 1) {
          return sameEntries[0];
        }
        // no same entries, or multiple same entries
        vms = sameEntries.length == 0 ? vms : sameEntries;
        if (view.desc.length == 0) {
          // the view has no desc, choose the first one
          return vms[0];
        }
        // for the rest, we prefer having the same desc
        let best = vms.find((vm) => vm['content-desc'] == view.desc);
        if (best) {
          return best;
        }
        // or having similar desc (tfidf, 1-gram feature)
        const frequents = [view, ...vms]
          .map((w) => {
            let desc = w instanceof DxView ? w.desc : w['content-desc'];
            return filterStopwords(
              splitAsWords(desc).map((w) => w.toLowerCase())
            );
          })
          .map(doc2freq);
        const words = Array.from(new Set(frequents.flatMap(Object.keys)));
        const vectors = frequents.map((f) => freq2vec(f), words);
        let min = Number.POSITIVE_INFINITY;
        let minInd = -1;
        // return the most similar one using cosine similarity
        for (let i = 1; i < vectors.length; i++) {
          const s = similarity.cosine(vectors[0].vector, vectors[i].vector);
          if (s < min) {
            min = s;
            minInd = i;
          }
        }
        return vms[minInd];
      }
    }
    // no text, and does not find any by resource-id, let's try content-desc
    if (view.desc.length != 0) {
      opt.descContains = view.desc;
      vms = await this.select(opt);
      if (vms.length == 0) {
        return null;
      }
      // prefer having similar desc (i.e., the least length),
      // no doubt that same desc must have the least length
      // TODO: what if there are multiple? (add context info)
      vms.sort((a, b) => a['content-desc'].length - b['content-desc'].length);
      return vms[0];
    } else {
      throw new NotImplementedError('resId, text and desc are all empty');
    }
  }

  async dump(compressed = true): Promise<string> {
    return await this.adb.unsafeExecOut(
      `${DxYota.BIN} dump ${compressed ? '-c' : ''} -b -o stdout`
    );
  }

  async topActivity(pkg: string, dev: DevInfo): Promise<DxCompatUi> {
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
