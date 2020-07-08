import { 
  AdbBindShape, 
  bindAdb, 
  AdbGlobalOptions, 
  LogcatBuffer, 
  LogcatBufferSize 
} from './base/adb.ts';
import DxView, { 
  DxActivity, 
  DxViewFlags, 
  DxViewPager,
  DxTabHost,
  DxViewType,
  DxViewCache,
  DxViewFactory
} from './dxview.ts';
import * as base64 from './utils/base64.ts';
import { IllegalStateError } from './utils/error.ts';

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

const PAT_DEVICE_SIZE = /Physical\ssize:\s(?<pw>\d+)x(?<ph>\d+)(\nOverride\ssize:\s(?<ow>\d+)x(?<oh>\d+))?/;
const PAT_DEVICE_DENS = /Physical\sdensity:\s(?<pd>\d+)(\nOverride\sdensity:\s(?<od>\d+))?/;

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

const PAT_AV_HEADER = /ACTIVITY\s(?<pkg>[\w.]+)\/(?<name>[\w.]+).*/;

class DumpSysActivityInfo {
  private viewHierarchy_: [number, number] = [-1, -1];
  private name_ = '';

  constructor(
    private readonly pkg_: string, 
    private readonly info: string[]
  ) {
    this.init();
  }

  get(): string[] {
    return this.info;
  }
  
  get pkg(): string {
    return this.pkg_;
  }

  get name(): string {
    return this.name_;
  }

  get viewHierarchy(): [number, number] {
    return this.viewHierarchy_;
  }

  private init() {
    // parse head to pkg and name
    this.initHeader();
    // parse to find view hierarchy
    this.initViewHierarchy(true);
  }

  private initHeader() {
    const res = PAT_AV_HEADER.exec(this.info[0]);
    if (!res || !res.groups) {
      throw new IllegalStateError('Expect ACTIVITY header');
    }
    const { pkg = '' } = res.groups;
    if (pkg != this.pkg_) {
      throw new IllegalStateError(`Expect ${this.pkg_}, got ${pkg}`);
    }
    let { name = '' } = res.groups;
    if (pkg == '' || name == '') {
      throw new IllegalStateError('Expect pkg and name in ACTIVITY header');
    }
    if (name.startsWith('.')) {
      name = pkg + name; 
    }
    this.name_ = name;
  }

  private initViewHierarchy(rmNavSta = false) {
    // find the view hierarchy start line
    let viewHierarchyStartLine = -1;
    const viewHierarchyStartLinePrefix = '  View Hierarchy:';
    for (let i = 0; i < this.info.length; i ++) {
      if (this.info[i].startsWith(viewHierarchyStartLinePrefix)) {
        viewHierarchyStartLine = i + 1;
        break;
      }
    }
    if (viewHierarchyStartLine == -1) {
      throw new AdbError('dumpsys activity top', 0, 'No view hierarchies exist');
    }
    // find the view hierarchy end line
    let viewHierarchyEndLine = this.info.length;
    const viewHierarchyLinePrefix = '    ';
    for (let i = viewHierarchyStartLine; i < this.info.length; i ++) {
      if (!this.info[i].startsWith(viewHierarchyLinePrefix)) {
        viewHierarchyEndLine = i;
        break;
      }
    }
    if (rmNavSta) {
      // find and drop navigation and status bar
      let statusBarStartLine = -1;
      let navBarStartLine = -1;
      for (let i = viewHierarchyStartLine; i < viewHierarchyEndLine; i ++) {
        if (this.info[i].indexOf('android:id/navigationBarBackground') != -1) {
          navBarStartLine = i;
        } else if (this.info[i].indexOf('android:id/statusBarBackground') != -1) {
          statusBarStartLine = i;
        }
        if (navBarStartLine != -1 && statusBarStartLine != -1) {
          break;
        }
      }
      // in case there are children
      if (statusBarStartLine != -1) {
        let statusBarEndLine = statusBarStartLine + 1;
        const statusBarPrefix = this.info[statusBarStartLine].substring(0, this.info[statusBarStartLine].indexOf('android.view.View')) + '  ';
        for (let i = statusBarEndLine; i < viewHierarchyEndLine; i ++) {
          if (!this.info[i].startsWith(statusBarPrefix)) {
            statusBarEndLine = i;
            break;
          }
        }
        const deleted = (statusBarEndLine - statusBarStartLine);
        this.info.splice(statusBarStartLine, deleted);
        viewHierarchyEndLine -= deleted;
        if (navBarStartLine > statusBarStartLine) {
          navBarStartLine -= deleted;
        }
      }
      if (navBarStartLine != -1) {
        let navBarEndLine = navBarStartLine + 1;
        const navBarPrefix = this.info[navBarStartLine].substring(0, this.info[navBarStartLine].indexOf('android.view.View')) + '  ';
        for (let i = navBarEndLine; i < viewHierarchyEndLine; i ++) {
          if (!this.info[i].startsWith(navBarPrefix)) {
            navBarEndLine = i;
            break;
          }
        }
        const deleted = (navBarEndLine - navBarStartLine);
        this.info.splice(navBarStartLine, deleted);
        viewHierarchyEndLine -= deleted;
      }
      this.viewHierarchy_ = [viewHierarchyStartLine, viewHierarchyEndLine];
    }
  }
}

// FIX: some apps/devices often output non-standard attributes 
// for example aid=1073741824 following resource-id
const PAT_AV_DECOR = /DecorView@[a-fA-F0-9]+\[\w+\]\{dx-bg-class=(?<bgclass>[\w.]+)\sdx-bg-color=(?<bgcolor>[+-]?[\d.]+)\}/;
const PAT_AV_VIEW = /(?<dep>\s*)(?<cls>[\w$.]+)\{(?<hash>[a-fA-F0-9]+)\s(?<flags>[\w.]{9})\s(?<pflags>[\w.]{8})\s(?<left>[+-]?\d+),(?<top>[+-]?\d+)-(?<right>[+-]?\d+),(?<bottom>[+-]?\d+)(?:\s#(?<id>[a-fA-F0-9]+))?(?:\s(?<rpkg>[\w.]+):(?<rtype>\w+)\/(?<rentry>\w+).*?)?\sdx-tx=(?<tx>[+-]?[\d.]+)\sdx-ty=(?<ty>[+-]?[\d.]+)\sdx-tz=(?<tz>[+-]?[\d.]+)\sdx-sx=(?<sx>[+-]?[\d.]+)\sdx-sy=(?<sy>[+-]?[\d.]+)\sdx-desc="(?<desc>.*?)"\sdx-text="(?<text>.*?)"\sdx-bg-class=(?<bgclass>[\w.]+)\sdx-bg-color=(?<bgcolor>[+-]?[\d.]+)(:?\sdx-pgr-curr=(?<pcurr>[+-]?\d+))?(:?\sdx-tab-curr=(?<tcurr>[+-]?\d+))?\}/;

export class ActivityDumpSysBuilder {

  private pfxLen = 0;
  private step = 1;
  private decode = true;
  private viewHierarchy: string[] = []
  private width = -1;
  private height = -1;
  private cache: DxViewCache | null = null;

  constructor(
    private readonly app: string,
    private readonly name: string
  ) {}

  withWidth(width: number): ActivityDumpSysBuilder {
    this.width = width;
    return this;
  }

  withHeight(height: number): ActivityDumpSysBuilder {
    this.height = height;
    return this;
  }

  withDecoding(decode: boolean): ActivityDumpSysBuilder {
    this.decode = decode;
    return this;
  }

  withPrefixLength(len: number): ActivityDumpSysBuilder {
    this.pfxLen = len;
    return this;
  }

  withStep(step: number): ActivityDumpSysBuilder {
    this.step = step;
    return this;
  }

  withCache(cache: DxViewCache): ActivityDumpSysBuilder {
    this.cache = cache;
    return this;
  }

  withViewHierarchy(viewHierarchy: string[]): ActivityDumpSysBuilder {
    this.viewHierarchy = viewHierarchy;
    return this;
  }

  build(): DxActivity {
    this.checkRequiredOrThrow();
    const act = new DxActivity(this.app, this.name);
    let cview: DxView | null = null; // current view
    let cdep = -1; // current depth
    // build views one by one
    for (let vhl of this.viewHierarchy) {
      vhl = vhl.trimEnd();
      if (this.pfxLen != 0) {
        vhl = vhl.substring(this.pfxLen);
      }
      if (vhl.length == 0) {
        continue;
      }
      // build and update current view/depth
      [cview, cdep] = this.buildView(vhl, act, cview, cdep);
    }
    return act;
  }

  private buildView(
    line: string, 
    act: DxActivity, 
    cview: DxView | null,
    cdep: number
  ): [DxView, number] {
    // check and install decor if necessary
    if (!act.decorView || !cview) {
      const res = PAT_AV_DECOR.exec(line);
      if (!res || !res.groups) {
        throw new IllegalStateError('Expect DecorView');
      }

      const {
        bgclass: bgClass,
        bgcolor: sBgColor
      } = res.groups;
      if (bgClass == '.') {
        throw new IllegalStateError('Expect DecorView to have at least a background');
      }
      
      act.installDecor(
        this.width, this.height,
        bgClass,
        sBgColor == '.' ? null : Number(sBgColor)
      );

      return [act.decorView!, 0]; // eslint-disable-line
    }

    // parse view line by line
    const res = PAT_AV_VIEW.exec(line);
    if (!res || !res.groups) {
      throw new IllegalStateError(`No activity entries match: ${line}`);
    }

    const {
      dep: sDep, 
      cls, flags: sFlags, pflags: sPflags,
      left: sOffL, top: sOffT, 
      right: sOffR, bottom: sOffB,
      rpkg = '', rtype = '', rentry = '',
      tx: sTx, ty: sTy, tz: sTz,
      sx: sSx, sy: sSy,
      desc: sDesc = '', text: sText = '',
      bgclass: sBgClass, bgcolor: sBgColor,
      pcurr: sPcurr, tcurr: sTcurr
    } = res.groups;

    // find parent of current view
    const dep = sDep.length / this.step;
    let parent: DxView;
    let diff = dep - cdep;
    if (diff == 0) { // sibling of curr
      parent = cview.parent as DxView;
    } else if (diff > 0) { // child of curr
      if (diff != 1) {
        throw new IllegalStateError(`Expect a direct child, but got an indirect (+${diff}) child`);
      }
      parent = cview;
    } else { // sibling of an ancestor
      let ptr = cview;
      while (diff != 0) {
        ptr = ptr.parent!; // eslint-disable-line
        diff += 1;
      }
      parent = ptr.parent!; // eslint-disable-line
    }

    // parse and construct the view
    const flags: DxViewFlags = {
      V: sFlags[0] == 'V' 
        ? 'V'
        : sFlags[0] == 'I' 
          ? 'I'
          : 'G',
      f: sFlags[1] == 'F',
      F: sPflags[1] == 'F',
      E: sFlags[2] == 'E',
      S: sPflags[2] == 'S',
      d: sFlags[3] == 'D',
      hs: sFlags[4] == 'H',
      vs: sFlags[5] == 'V',
      c: sFlags[6] == 'C',
      lc: sFlags[7] == 'L',
      cc: sFlags[8] == 'X'
    };

    // tune visibility according its parent's visibility
    if (parent.flags.V == 'I') {
      if (flags.V == 'V') {
        flags.V = 'I';
      }
    } else if (parent.flags.V == 'G') {
      flags.V = 'G';
    }

    // parse background
    const bgClass = sBgClass == '.' 
      ? parent.bgClass      // inherits from its parent
      : sBgClass;
    const bgColor = sBgClass == '.'
      ? parent.bgColor      // inherits from its parent
      : sBgColor == '.'
        ? null              // not color, maybe ripple, images
        : Number(sBgColor); // color int value

    // calculate absolute bounds, translation, and scroll
    const left = parent.left + Number(sOffL);
    const top = parent.top + Number(sOffT);
    const right = parent.left + Number(sOffR);
    const bottom = parent.top + Number(sOffB);
    const tx = parent.translationX + Number(sTx);
    const ty = parent.translationY + Number(sTy);
    const tz = parent.translationZ + Number(sTz);
    const sx = parent.scrollX + Number(sSx);
    const sy = parent.scrollY + Number(sSy);

    // decode if necessary
    const text: string = this.decode ? base64.decode(sText) : sText;
    const desc: string = this.decode ? base64.decode(sDesc) : sDesc; 
    
    // create the view
    let view: DxView;
    if (sPcurr) {
      view = this.newView(DxViewType.VIEW_PAGER);
    } else if (sTcurr) {
      view = this.newView(DxViewType.TAB_HOST);
    } else {
      view = this.newView(DxViewType.OTHERS);
    }

    // reset common properties
    view.reset(
      parent.pkg, cls, flags,
      bgClass, bgColor,
      left, top, right, bottom,
      tx, ty, tz, sx, sy,
      rpkg, rtype, rentry,
      desc, text
    );
    // set properties for specific views
    if (sPcurr && view instanceof DxViewPager) {
      view.currItem = Number(sPcurr);
    } else if (sTcurr && view instanceof DxTabHost) {
      view.currTab = Number(sTcurr);
    }

    // add to parent
    parent.addView(view);

    return [view, dep];
  }

  private newView(type: DxViewType): DxView {
    if (this.cache) {
      return this.cache.get(type);
    } else {
      return DxViewFactory.create(type);
    }
  }

  private checkRequiredOrThrow() {
    if (this.viewHierarchy.length == 0) {
      throw new IllegalStateError('No view hierarchy exists');
    }
    if (this.width < 0) {
      throw new IllegalStateError('No width exists');
    }
    if (this.height < 0) {
      throw new IllegalStateError('No height exists');
    }
  }
}

export default class DxAdb {
  public readonly raw: AdbBindShape;
  constructor(gOpt: AdbGlobalOptions = {}) {
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
    return await this.raw.execOut(cmd);
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

  async topActivity(pkg: string, decoding: boolean, dev: DevInfo): Promise<DxActivity> {
    const info = await this.dumpTopActivity(pkg);
    const vhIndex = info.viewHierarchy;
    const viewHierarchy = info.get().slice(vhIndex[0], vhIndex[1]);
    return new ActivityDumpSysBuilder(pkg, info.name)
      .withHeight(dev.height)
      .withWidth(dev.width)
      .withDecoding(decoding)
      .withPrefixLength(4) // hard code here
      .withStep(2)         // hard code here
      .withViewHierarchy(viewHierarchy)
      .build();
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

  private async dumpTopActivity(pkg: string): Promise<DumpSysActivityInfo> {
    const out = (await this.unsafeExecOut('dumpsys activity top')).split('\n');
    // find the task start line
    let taskStartLine = -1;
    const taskStartLinePrefix = `TASK ${pkg} `;
    for (let i = 0; i < out.length; i++) {
      if (out[i].startsWith(taskStartLinePrefix)) {
        taskStartLine = i;
        break;
      }
    }
    if (taskStartLine == -1) {
      throw new AdbError('dumpsys activity top', 0, `Cannot find any task for ${pkg}`);
    }
    // find the activity start line, there is only one
    // ACTIVITY entry and its mResumed=true 'cause we're
    // using the `top` command
    let activityStartLine = -1;
    const activityStartPrefix = '  ACTIVITY ';
    for (let i = taskStartLine + 1; i < out.length; i ++) {
      if (out[i].startsWith(taskStartLinePrefix)) {
        break;
      } if (out[i].startsWith(activityStartPrefix)) {
        activityStartLine = i;
        break;
      }
    }
    if (activityStartLine == -1) {
      throw new AdbError('dumpsys activity top', 0, `Task ${pkg} found, but no activities exist`);
    }
    // find the activity end line
    let activityEndLine = out.length;
    const activityLinePrefix = '    ';
    for (let i = activityStartLine + 1; i < out.length; i ++) {
      if (!out[i].startsWith(activityLinePrefix)) {
        activityEndLine = i;
        break;
      }
    }
    // return the activity entry
    const info = [];
    for (let i = activityStartLine; i < activityEndLine; i ++) {
      info.push(out[i].substring(2));
    }
    return new DumpSysActivityInfo(pkg, info);
  }
}

if (import.meta.main) {
  const adb = new DxAdb({});
  const act = await adb.topActivity('com.microsoft.office.word', true, await adb.fetchInfo());
  console.log(act.app);
  console.log(act.name);
  for (const v of act.decorView!.findViewsByXY(980, 200)) { // eslint-disable-line
    console.log(`cls=${v.cls} resId=${v.resId} text="${v.text}" desc="${v.desc}"`);
  }
}