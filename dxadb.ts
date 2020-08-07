import {
  AdbBindShape,
  bindAdb,
  AdbGlobalOptions,
  LogcatBuffer,
  LogcatBufferSize,
} from './base/adb.ts';
import DxView, { ViewFlags, ViewType, ViewFactory } from './ui/dxview.ts';
import DxCompatUi, { FragmentOwner, FragmentProps } from './ui/dxui.ts';
import * as base64 from './utils/base64.ts';
import { IllegalStateError } from './utils/error.ts';

export * from './base/adb.ts';

export class AdbError extends Error {
  constructor(public cmd: string, public code: number, public msg: string) {
    super(`AdbError[\`${cmd}\`=>${code}] ${msg}`);
  }
}

const PAT_DEVICE_SIZE = /Physical\ssize:\s(?<pw>\d+)x(?<ph>\d+)(\nOverride\ssize:\s(?<ow>\d+)x(?<oh>\d+))?/;
const PAT_DEVICE_DENS = /Physical\sdensity:\s(?<pd>\d+)(\nOverride\sdensity:\s(?<od>\d+))?/;

export class DevInfo {
  constructor(
    public readonly board: string, // device base board, e.g., sdm845
    public readonly brand: string, // device brand, e.g., OnePlus
    public readonly model: string, // device brand mode, e.g, OnePlus6T
    public readonly abi: string, // device cpu abi
    public readonly width: number, // device width, in pixel
    public readonly height: number, // device height, in pixel
    public readonly dpi: number, // device dpi (dots per inch) = density * 160
    public readonly sdk: number, // Android sdk version
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

export class DumpSysActivityInfo {
  private header_ = -1;
  // [start, end), local activity headers not included
  private localActivity_: [number, number] = [-1, -1];
  // [active start, active end), [added started, added end), fragments headers not included
  private fragments_: [number, number, number, number] = [-1, -1, -1, -1];
  // [start, end), view hierarchy headers not included
  private viewHierarchy_: [number, number] = [-1, -1];
  // [start, end), local fragment activity headers not included
  private localFragmentActivity_: [number, number] = [-1, -1];
  // [active start, active end), [added started, added end), fragments headers not included
  private supportFragments_: [number, number, number, number] = [
    -1,
    -1,
    -1,
    -1,
  ];
  private name_ = '';

  constructor(private readonly pkg_: string, private readonly info: string[]) {
    this.parse();
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

  get localActivity() {
    return this.localActivity_;
  }

  get fragments() {
    return this.fragments_;
  }

  get viewHierarchy(): [number, number] {
    return this.viewHierarchy_;
  }

  get localFragmentActivity() {
    return this.localFragmentActivity_;
  }

  get supportFragments() {
    return this.supportFragments_;
  }

  // Parse and initialize fields, don't change the parsing orders
  private parse() {
    // parse head to pkg and name
    this.parseHeader();
    // parse to find the fragments
    this.parseLocalActivity();
    // parse to find view hierarchy
    this.parseViewHierarchy(true);
    // parse to find the support fragments
    this.parseLocalFragmentActivity();
  }

  private parseHeader() {
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
    this.header_ = 0;
    this.name_ = name;
  }

  private parseLocalActivity() {
    let localActivityStartLine = -1;
    let localActivityEndLine = this.info.length;
    const localActivityStartLinePrefix = '  Local Activity ';
    for (let i = this.header_ + 1; i < this.info.length; i++) {
      if (this.info[i].startsWith(localActivityStartLinePrefix)) {
        localActivityStartLine = i + 1;
        break;
      }
    }
    if (localActivityStartLine == -1) {
      // no LocalFragment Activity found
      this.localActivity_ = [this.header_, this.header_];
      this.fragments_ = [
        this.localActivity_[0],
        this.localActivity_[0],
        this.localActivity_[0],
        this.localActivity_[0],
      ];
      return;
    }
    let localActivityLinePrefix = '    ';
    let activeFragmentsStartLine = -1;
    const activeFragmentsStartLinePrefix = '    Active Fragments in ';
    let addedFragmentsStartLine = -1;
    const addedFragmentsStartLinePrefix = '    Added Fragments:';
    for (let i = localActivityStartLine; i < this.info.length; i++) {
      if (this.info[i].startsWith(activeFragmentsStartLinePrefix)) {
        activeFragmentsStartLine = i + 1;
      } else if (this.info[i].startsWith(addedFragmentsStartLinePrefix)) {
        addedFragmentsStartLine = i + 1;
      } else if (!this.info[i].startsWith(localActivityLinePrefix)) {
        localActivityEndLine = i;
        break;
      }
    }
    let localActivityCompLinePrefix = '      ';
    let activeFragmentsEndLine = localActivityEndLine;
    if (activeFragmentsStartLine == -1) {
      // no active fragments found
      activeFragmentsStartLine = activeFragmentsEndLine = localActivityStartLine;
    } else {
      for (let i = activeFragmentsStartLine; i < localActivityEndLine; i++) {
        if (!this.info[i].startsWith(localActivityCompLinePrefix)) {
          activeFragmentsEndLine = i;
          break;
        }
      }
    }
    let addedFragmentsEndLine = localActivityEndLine;
    if (addedFragmentsStartLine == -1) {
      // no added fragments found
      addedFragmentsStartLine = addedFragmentsEndLine = localActivityStartLine;
    } else {
      for (let i = addedFragmentsStartLine; i < localActivityEndLine; i++) {
        if (!this.info[i].startsWith(localActivityCompLinePrefix)) {
          addedFragmentsEndLine = i;
          break;
        }
      }
    }
    this.localActivity_ = [localActivityStartLine, localActivityEndLine];
    this.fragments_ = [
      activeFragmentsStartLine,
      activeFragmentsEndLine,
      addedFragmentsStartLine,
      addedFragmentsEndLine,
    ];
  }

  private parseViewHierarchy(rmNavSta = false) {
    // find the view hierarchy start line
    let viewHierarchyStartLine = -1;
    const viewHierarchyStartLinePrefix = '  View Hierarchy:';
    for (let i = this.localActivity_[1]; i < this.info.length; i++) {
      if (this.info[i].startsWith(viewHierarchyStartLinePrefix)) {
        viewHierarchyStartLine = i + 1;
        break;
      }
    }
    if (viewHierarchyStartLine == -1) {
      throw new IllegalStateError('No View Hierarchies found');
    }
    // find the view hierarchy end line
    let viewHierarchyEndLine = this.info.length;
    const viewHierarchyLinePrefix = '    ';
    for (let i = viewHierarchyStartLine; i < this.info.length; i++) {
      if (!this.info[i].startsWith(viewHierarchyLinePrefix)) {
        viewHierarchyEndLine = i;
        break;
      }
    }
    if (rmNavSta) {
      // find and drop navigation and status bar
      let statusBarStartLine = -1;
      let navBarStartLine = -1;
      for (let i = viewHierarchyStartLine; i < viewHierarchyEndLine; i++) {
        if (this.info[i].indexOf('android:id/navigationBarBackground') != -1) {
          navBarStartLine = i;
        } else if (
          this.info[i].indexOf('android:id/statusBarBackground') != -1
        ) {
          statusBarStartLine = i;
        }
        if (navBarStartLine != -1 && statusBarStartLine != -1) {
          break;
        }
      }
      // in case there are children
      if (statusBarStartLine != -1) {
        let statusBarEndLine = statusBarStartLine + 1;
        const statusBarPrefix =
          this.info[statusBarStartLine].substring(
            0,
            this.info[statusBarStartLine].indexOf('android.view.View')
          ) + '  ';
        for (let i = statusBarEndLine; i < viewHierarchyEndLine; i++) {
          if (!this.info[i].startsWith(statusBarPrefix)) {
            statusBarEndLine = i;
            break;
          }
        }
        const deleted = statusBarEndLine - statusBarStartLine;
        this.info.splice(statusBarStartLine, deleted);
        viewHierarchyEndLine -= deleted;
        if (navBarStartLine > statusBarStartLine) {
          navBarStartLine -= deleted;
        }
      }
      if (navBarStartLine != -1) {
        let navBarEndLine = navBarStartLine + 1;
        const navBarPrefix =
          this.info[navBarStartLine].substring(
            0,
            this.info[navBarStartLine].indexOf('android.view.View')
          ) + '  ';
        for (let i = navBarEndLine; i < viewHierarchyEndLine; i++) {
          if (!this.info[i].startsWith(navBarPrefix)) {
            navBarEndLine = i;
            break;
          }
        }
        const deleted = navBarEndLine - navBarStartLine;
        this.info.splice(navBarStartLine, deleted);
        viewHierarchyEndLine -= deleted;
      }
      this.viewHierarchy_ = [viewHierarchyStartLine, viewHierarchyEndLine];
    }
  }

  private parseLocalFragmentActivity() {
    // this is a bug of androidx.fragment.app.FragmentManager (the output
    // is in an incorrect format, we make it correct here)
    this.fixIncorrectLine();
    let localFragmentActivityStartLine = -1;
    let localFragmentActivityEndLine = this.info.length;
    const localFragmentActivityStartLinePrefix = '  Local FragmentActivity ';
    for (let i = this.viewHierarchy[1]; i < this.info.length; i++) {
      if (this.info[i].startsWith(localFragmentActivityStartLinePrefix)) {
        localFragmentActivityStartLine = i + 1;
        break;
      }
    }
    if (localFragmentActivityStartLine == -1) {
      // no LocalFragment Activity found
      this.localFragmentActivity_ = [
        this.viewHierarchy[1] - 1,
        this.viewHierarchy[1] - 1,
      ];
      this.fragments_ = [
        this.localFragmentActivity_[0],
        this.localFragmentActivity_[0],
        this.localFragmentActivity_[0],
        this.localFragmentActivity_[0],
      ];
      return;
    }
    let localFragmentActivityLinePrefix = '    ';
    let activeFragmentsStartLine = -1;
    const activeFragmentsStartLinePrefix = '    Active Fragments:';
    let addedFragmentsStartLine = -1;
    const addedFragmentsStartLinePrefix = '    Added Fragments:';
    for (let i = localFragmentActivityStartLine; i < this.info.length; i++) {
      if (this.info[i].startsWith(activeFragmentsStartLinePrefix)) {
        activeFragmentsStartLine = i + 1;
      } else if (this.info[i].startsWith(addedFragmentsStartLinePrefix)) {
        addedFragmentsStartLine = i + 1;
      } else if (!this.info[i].startsWith(localFragmentActivityLinePrefix)) {
        localFragmentActivityEndLine = i;
        break;
      }
    }
    let localFragmentActivityCompLinePrefix = '      ';
    let activeFragmentsEndLine = localFragmentActivityEndLine;
    if (activeFragmentsStartLine == -1) {
      // no active fragments found
      activeFragmentsStartLine = activeFragmentsEndLine = localFragmentActivityStartLine;
    } else {
      for (
        let i = activeFragmentsStartLine;
        i < localFragmentActivityEndLine;
        i++
      ) {
        if (!this.info[i].startsWith(localFragmentActivityCompLinePrefix)) {
          activeFragmentsEndLine = i;
          break;
        }
      }
    }
    let addedFragmentsEndLine = localFragmentActivityEndLine;
    if (addedFragmentsStartLine == -1) {
      addedFragmentsStartLine = addedFragmentsEndLine = localFragmentActivityStartLine;
    } else {
      for (
        let i = addedFragmentsStartLine;
        i < localFragmentActivityEndLine;
        i++
      ) {
        if (!this.info[i].startsWith(localFragmentActivityCompLinePrefix)) {
          addedFragmentsEndLine = i;
          break;
        }
      }
    }
    this.localFragmentActivity_ = [
      localFragmentActivityStartLine,
      localFragmentActivityEndLine,
    ];
    this.supportFragments_ = [
      activeFragmentsStartLine,
      activeFragmentsEndLine,
      addedFragmentsStartLine,
      addedFragmentsEndLine,
    ];
  }

  private fixIncorrectLine() {
    let localFragmentActivityStartLine = -1;
    let localFragmentActivityEndLine = this.info.length;
    let localFragmentActivityStartLinePrefix = '  Local FragmentActivity ';
    for (let i = this.viewHierarchy[1]; i < this.info.length; i++) {
      if (this.info[i].startsWith(localFragmentActivityStartLinePrefix)) {
        localFragmentActivityStartLine = i + 1;
        break;
      }
    }
    if (localFragmentActivityStartLine == -1) {
      return;
    }
    const activeFragmentsStartLineInfix = '    Active Fragments:';
    const incorrectLine = localFragmentActivityStartLine;
    const incorrectString = this.info[incorrectLine];
    if (!incorrectString.includes(activeFragmentsStartLineInfix)) {
      return;
    }
    // let's fix it by pre-pending spaces
    const ind = incorrectString.indexOf(activeFragmentsStartLineInfix);
    const stateString = incorrectString.slice(0, ind);
    const activeString = activeFragmentsStartLineInfix.slice();
    const nextString = incorrectString.slice(ind + activeString.length);
    this.info.splice(incorrectLine, 1, stateString, activeString, nextString);
    for (let i = incorrectLine + 2; i < localFragmentActivityEndLine; i++) {
      if (this.info[i].includes('Added Fragments:')) {
        this.info[i] = '  ' + this.info[i];
      } else if (this.info[i].includes('Fragments Created Menus:')) {
        this.info[i] = '  ' + this.info[i];
      } else if (this.info[i].includes('Back Stack:')) {
        this.info[i] = '  ' + this.info[i];
      } else if (this.info[i].includes('Back Stack Index:')) {
        this.info[i] = '  ' + this.info[i];
      } else if (this.info[i].includes('Back Stack Indices:')) {
        this.info[i] = '  ' + this.info[i];
      } else if (this.info[i].includes('Pending Actions:')) {
        this.info[i] = '  ' + this.info[i];
      } else if (this.info[i].includes('FragmentManager misc state:')) {
        this.info[i] = '  ' + this.info[i];
      } else if (this.info[i].startsWith('    ')) {
        this.info[i] = '  ' + this.info[i];
      } else if (this.info[i].startsWith('  ')) {
        this.info[i] = '    ' + this.info[i];
      }
    }
  }
}

// FIX: some apps/devices often output non-standard attributes
// for example aid=1073741824 following resource-id
/** See DecorView#toString() */
const PAT_AV_DECOR = /DecorView@(?<hash>[a-fA-F0-9]+)\[.*?\]\{dx-bg-class=(?<bgclass>[\w.]+)\sdx-bg-color=(?<bgcolor>[+-]?[\d.]+)\}/;
/** See View#toString() */
const PAT_AV_VIEW = /(?<dep>\s*)(?<cls>[\w$.]+)\{(?<hash>[a-fA-F0-9]+)\s(?<flags>[\w.]{9})\s(?<pflags>[\w.]{8})\s(?<left>[+-]?\d+),(?<top>[+-]?\d+)-(?<right>[+-]?\d+),(?<bottom>[+-]?\d+)(?:\s#(?<id>[a-fA-F0-9]+))?(?:\s(?<rpkg>[\w.]+):(?<rtype>\w+)\/(?<rentry>\w+).*?)?\sdx-type=(?<type>[\w.]+)\sdx-scroll=(?<scroll>[\w.]{4})\sdx-e=(?<e>[+-]?[\d.]+)\sdx-tx=(?<tx>[+-]?[\d.]+)\sdx-ty=(?<ty>[+-]?[\d.]+)\sdx-tz=(?<tz>[+-]?[\d.]+)\sdx-sx=(?<sx>[+-]?[\d.]+)\sdx-sy=(?<sy>[+-]?[\d.]+)\sdx-shown=(?<shown>true|false)\sdx-desc="(?<desc>.*?)"\sdx-text="(?<text>.*?)"\sdx-tag="(?<tag>.*?)"\sdx-tip="(?<tip>.*?)"\sdx-hint="(?<hint>.*?)"\sdx-bg-class=(?<bgclass>[\w.]+)\sdx-bg-color=(?<bgcolor>[+-]?[\d.]+)\sdx-fg=(?<fg>[#\w.]+)\sdx-im-acc=(?<acc>true|false)(:?\sdx-pgr-curr=(?<pcurr>[+-]?\d+))?(:?\sdx-tab-curr=(?<tcurr>[+-]?\d+)\sdx-tab-widget=(?<ttabs>[a-fA-F0-9]+)\sdx-tab-content=(?<tcont>[a-fA-F0-9]+))?\}/;
/** See Fragment#toString() */
const PAT_AV_FRAG_LINE = {
  HEAD: /(#\d+:\s)?(?<cls>\w+)\{(?<hash>[a-fA-F0-9]+).*?\}/,
  XID: /\s+mFragmentId=#(?<fid>[0-9a-fA-F]+)\smContainerId=#(?<cid>[0-9a-fA-F]+).*/,
  VIS: /\s+mHidden=(?<hidden>true|false)\smDetached=(?<detached>true|false).*/,
};

export class ActivityDumpSysBuilder {
  private step = 1;
  private decode = true;
  private viewHierarchy: string[] = [];
  private activeFragments: string[] = [];
  private addedFragments: string[] = [];
  private activeSupportFragments: string[] = [];
  private addedSupportFragments: string[] = [];
  private width = -1;
  private height = -1;

  constructor(private readonly app: string, private readonly name: string) {}

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

  withStep(step: number): ActivityDumpSysBuilder {
    this.step = step;
    return this;
  }

  withViewHierarchy(viewHierarchy: string[]): ActivityDumpSysBuilder {
    this.viewHierarchy = viewHierarchy;
    return this;
  }

  withActiveFragments(activeFragments: string[]): ActivityDumpSysBuilder {
    this.activeFragments = activeFragments;
    return this;
  }

  withAddedFragments(addedFragments: string[]): ActivityDumpSysBuilder {
    this.addedFragments = addedFragments;
    return this;
  }

  withActiveSupportFragments(
    activeSupportFragments: string[]
  ): ActivityDumpSysBuilder {
    this.activeSupportFragments = activeSupportFragments;
    return this;
  }

  withAddedSupportFragments(
    addedSupportFragments: string[]
  ): ActivityDumpSysBuilder {
    this.addedSupportFragments = addedSupportFragments;
    return this;
  }

  build(): DxCompatUi {
    this.checkRequiredOrThrow();
    const ui = new DxCompatUi(this.app, this.name);
    this.buildView(ui);
    this.buildFragments(ui, ui);
    return ui;
  }

  private buildView(ui: DxCompatUi) {
    let cview: DxView | null = null; // current view
    let cdep = -1; // current depth
    // build views one by one
    for (let vhl of this.viewHierarchy) {
      vhl = vhl.trimEnd();
      if (vhl.length == 0) {
        continue;
      }
      // build and update current view/depth
      [cview, cdep] = this.doBuildView(vhl, ui, cview, cdep);
    }
  }

  private buildFragments(ui: DxCompatUi, owner: FragmentOwner) {
    // build added fragments
    const added = [...this.addedFragments, ...this.addedSupportFragments];
    // each added takes up a single line
    for (const fl of added) {
      const res = PAT_AV_FRAG_LINE.HEAD.exec(fl);
      if (!res || !res.groups) {
        throw new IllegalStateError('Expect an Added Fragment');
      }
      const { cls, hash } = res.groups;
      owner.fragmentManager.addFragment({
        class: cls,
        hash,
      });
    }
    // build active fragments
    const active = [...this.activeFragments, ...this.activeSupportFragments];
    // first traverse to extract the header's indices
    const headers = [];
    for (let i = 0; i < active.length; i++) {
      if (!active[i].startsWith(' ')) {
        headers.push(i);
      }
    }
    headers.push(active.length);
    // second traverse to build the fragment
    if (headers.length == 1) {
      // no active fragments
      return;
    }
    for (let i = 0; i < headers.length - 1; i++) {
      const fragStartLine = headers[i];
      const fragEndLine = headers[i + 1];
      const fragString = active[fragStartLine];
      const res = PAT_AV_FRAG_LINE.HEAD.exec(fragString);
      if (!res || !res.groups) {
        throw new IllegalStateError('Expect an Active Fragment');
      }
      const { cls, hash } = res.groups;
      const props: FragmentProps = {
        class: cls,
        hash,
      };
      for (let j = fragStartLine + 1; j < fragEndLine; j++) {
        const line = active[j];
        let res = PAT_AV_FRAG_LINE.XID.exec(line);
        if (res && res.groups) {
          const { fid: fragmentId, cid: containerId } = res.groups;
          props.containerId = containerId;
          props.fragmentId = fragmentId;
          continue;
        }
        res = PAT_AV_FRAG_LINE.VIS.exec(line);
        if (res && res.groups) {
          const { hidden: sHidden, detached: sDetached } = res.groups;
          props.hidden = sHidden == 'true';
          props.detached = sDetached == 'true';
          break;
        }
        // TODO: build child fragments
        // else if (PAT_AV_FRAG_CFRAG.test(line)) {
        //   // child fragment manager
        //   this.buildFragments(act, frag);
        // }
      }
      owner.fragmentManager.activateFragment(props);
    }
  }

  private doBuildView(
    line: string,
    ui: DxCompatUi,
    cview: DxView | null,
    cdep: number
  ): [DxView, number] {
    // check and install decor if necessary
    if (!ui.decorView || !cview) {
      const res = PAT_AV_DECOR.exec(line);
      if (!res || !res.groups) {
        throw new IllegalStateError('Expect DecorView');
      }

      const { hash, bgclass: bgClass, bgcolor: sBgColor } = res.groups;
      if (bgClass == '.') {
        throw new IllegalStateError(
          'Expect DecorView to have at least a background'
        );
      }

      ui.installDecor(
        hash,
        this.width,
        this.height,
        bgClass,
        sBgColor == '.' ? null : Number(sBgColor)
      );

      return [ui.decorView!, 0]; // eslint-disable-line
    }

    // parse view line by line
    const res = PAT_AV_VIEW.exec(line);
    if (!res || !res.groups) {
      throw new IllegalStateError(`No activity entries match: ${line}`);
    }

    const {
      dep: sDep,
      type,
      hash,
      id,
      cls,
      flags: sFlags,
      pflags: sPflags,
      left: sOffL,
      top: sOffT,
      right: sOffR,
      bottom: sOffB,
      rpkg: resPkg = '',
      rtype: resType = '',
      rentry: resEntry = '',
      scroll: sScrollFlags,
      e: sOffE,
      tx: sTx,
      ty: sTy,
      tz: sTz,
      sx: sSx,
      sy: sSy,
      shown: sShown,
      desc: sDesc = '',
      text: sText = '',
      tag: sTag = '',
      tip: sTip = '',
      hint: sHint = '',
      bgclass: sBgClass,
      bgcolor: sBgColor,
      fg: sFg,
      acc: sAcc,
      pcurr: sPcurr,
      tcurr: sTcurr,
      ttabs: tTabsHash,
      tcont: tContentHash,
    } = res.groups;

    // find parent of current view
    const dep = sDep.length / this.step;
    let parent: DxView;
    let diff = dep - cdep;
    if (diff == 0) {
      // sibling of curr
      parent = cview.parent as DxView;
    } else if (diff > 0) {
      // child of curr
      if (diff != 1) {
        throw new IllegalStateError(
          `Expect a direct child, but got an indirect (+${diff}) child`
        );
      }
      parent = cview;
    } else {
      // sibling of an ancestor
      let ptr = cview;
      while (diff != 0) {
        ptr = ptr.parent!; // eslint-disable-line
        diff += 1;
      }
      parent = ptr.parent!; // eslint-disable-line
    }

    // parse and construct the view
    const flags: ViewFlags = {
      V: sFlags[0] == 'V' ? 'V' : sFlags[0] == 'I' ? 'I' : 'G',
      f: sFlags[1] == 'F',
      F: sPflags[1] == 'F',
      E: sFlags[2] == 'E',
      S: sPflags[2] == 'S',
      d: sFlags[3] == 'D',
      s: {
        l: sScrollFlags[2] == 'R',
        t: sScrollFlags[3] == 'B',
        r: sScrollFlags[0] == 'L',
        b: sScrollFlags[1] == 'T',
      },
      c: sFlags[6] == 'C',
      lc: sFlags[7] == 'L',
      cc: sFlags[8] == 'X',
      a: sAcc == 'true',
    };

    // tune visibility according its parent's visibility
    if (parent.flags.V == 'I') {
      if (flags.V == 'V') {
        flags.V = 'I';
      }
    } else if (parent.flags.V == 'G') {
      flags.V = 'G';
    }

    // parse background and foreground
    const bgClass =
      sBgClass == '.'
        ? parent.bgClass // inherits from its parent
        : sBgClass;
    const bgColor =
      sBgClass == '.'
        ? parent.bgColor // inherits from its parent
        : sBgColor == '.'
        ? null // not color, maybe ripple, images
        : Number(sBgColor); // color int value
    // '.' means no foreground
    const foreground = sFg == '.' ? null : sFg;

    // calculate absolute bounds, translation, and scroll
    const left = parent.left + Number(sOffL);
    const top = parent.top + Number(sOffT);
    const right = parent.left + Number(sOffR);
    const bottom = parent.top + Number(sOffB);
    const elevation = parent.elevation + Number(sOffE);
    const translationX = parent.translationX + Number(sTx);
    const translationY = parent.translationY + Number(sTy);
    const translationZ = parent.translationZ + Number(sTz);
    const scrollX = parent.scrollX + Number(sSx);
    const scrollY = parent.scrollY + Number(sSy);

    // parse shown
    const shown = sShown == 'true';

    // decode if necessary
    const text: string = this.decode ? base64.decode(sText) : sText;
    const desc: string = this.decode ? base64.decode(sDesc) : sDesc;
    const tag: string = this.decode ? base64.decode(sTag) : sTag;
    const tip: string = this.decode ? base64.decode(sTip) : sTip;
    const hint: string = this.decode ? base64.decode(sHint) : sTip;

    // create view props
    const currPage = Number(sPcurr);
    const currTab = Number(sTcurr);
    const tabsHash = tTabsHash;
    const contentHash = tContentHash;

    // create the view
    const view = ViewFactory.create(this.typeOf(type), {
      package: parent.pkg,
      class: cls,
      id,
      hash,
      flags,
      shown,
      bgClass,
      bgColor,
      foreground,
      left,
      top,
      right,
      bottom,
      elevation,
      translationX,
      translationY,
      translationZ,
      scrollX,
      scrollY,
      resPkg,
      resType,
      resEntry,
      desc,
      text,
      tag,
      tip,
      hint,
      currPage,
      currTab,
      tabsHash,
      contentHash,
    });

    // add to parent
    parent.addView(view);

    return [view, dep];
  }

  private typeOf(type: string): ViewType {
    switch (type) {
      case 'TH':
        return ViewType.TAB_HOST;
      case 'VP':
        return ViewType.VIEW_PAGER;
      case 'WV':
        return ViewType.WEB_VIEW;
      case 'RV':
        return ViewType.RECYCLER_VIEW;
      case 'LV':
        return ViewType.LIST_VIEW;
      case 'GV':
        return ViewType.GRID_VIEW;
      case 'VSV':
        return ViewType.SCROLL_VIEW;
      case 'HSV':
        return ViewType.HORIZONTAL_SCROLL_VIEW;
      case 'NSV':
        return ViewType.NESTED_SCROLL_VIEW;
      case 'TB':
        return ViewType.TOOLBAR;
      default:
        return ViewType.VIEW;
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

export function buildActivityFromDumpSysInfo(
  info: DumpSysActivityInfo,
  dev: DevInfo,
  decoding: boolean = true
): DxCompatUi {
  const vhIndex = info.viewHierarchy;
  const frIndex = info.fragments;
  const sfrIndex = info.supportFragments;
  const activeFragments = info
    .get()
    .slice(frIndex[0], frIndex[1])
    .map((s) => s.substring(6));
  const addedFragments = info
    .get()
    .slice(frIndex[2], frIndex[3])
    .map((s) => s.substring(6));
  const viewHierarchy = info
    .get()
    .slice(vhIndex[0], vhIndex[1])
    .map((s) => s.substring(4));
  const activeSupportFragments = info
    .get()
    .slice(sfrIndex[0], sfrIndex[1])
    .map((s) => s.substring(6));
  const addedSupportFragments = info
    .get()
    .slice(sfrIndex[2], sfrIndex[3])
    .map((s) => s.substring(6));
  const ui = new ActivityDumpSysBuilder(info.pkg, info.name)
    .withHeight(dev.height)
    .withWidth(dev.width)
    .withDecoding(decoding)
    .withStep(2) // hard code here
    .withActiveFragments(activeFragments)
    .withAddedFragments(addedFragments)
    .withViewHierarchy(viewHierarchy)
    .withActiveSupportFragments(activeSupportFragments)
    .withAddedSupportFragments(addedSupportFragments)
    .build();
  ui.buildDrawingLevelLists();
  return ui;
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
      buffers,
    });
  }

  async setLogcatSize(
    size: LogcatBufferSize,
    buffers: LogcatBuffer[] = ['all']
  ): Promise<void> {
    await this.raw.logcat(undefined, {
      buffers,
      bufSize: size,
    });
  }

  async getprop(prop: string): Promise<string> {
    return (await this.unsafeExecOut(`getprop ${prop}`)).trim();
  }

  async cmd(args: string): Promise<string> {
    return await this.unsafeExecOut(`cmd ${args}`);
  }

  async topActivity(
    pkg: string,
    decoding: boolean,
    dev: DevInfo
  ): Promise<DxCompatUi> {
    const info = await this.dumpTopActivity(pkg);
    return buildActivityFromDumpSysInfo(info, dev, decoding);
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
      width,
      height,
      dpi,
      Number.parseInt(await this.getprop('ro.system.build.version.sdk')),
      Number.parseFloat(await this.getprop('ro.system.build.version.release'))
    );
  }

  private async dumpTopActivity(pkg: string): Promise<DumpSysActivityInfo> {
    // TODO: what if there are multiple activities, is the
    // first one the top activity
    const out = (await this.unsafeExecOut(`dumpsys activity ${pkg}`)).split(
      '\n'
    );
    // find the task start line
    let taskStartLine = -1;
    const taskStartLinePrefix = `TASK `;
    for (let i = 0; i < out.length; i++) {
      if (out[i].startsWith(taskStartLinePrefix)) {
        taskStartLine = i;
        break;
      }
    }
    if (taskStartLine == -1) {
      throw new AdbError(
        'dumpsys activity top',
        0,
        `Cannot find any task for ${pkg}`
      );
    }
    // find the activity start line, there is only one
    // ACTIVITY entry and its mResumed=true 'cause we're
    // using the `top` command
    let activityStartLine = -1;
    const activityStartPrefix = '  ACTIVITY ';
    for (let i = taskStartLine + 1; i < out.length; i++) {
      if (out[i].startsWith(taskStartLinePrefix)) {
        break;
      }
      if (out[i].startsWith(activityStartPrefix)) {
        activityStartLine = i;
        break;
      }
    }
    if (activityStartLine == -1) {
      throw new AdbError(
        'dumpsys activity top',
        0,
        `Task ${pkg} found, but no activities exist`
      );
    }
    // find the activity end line
    let activityEndLine = out.length;
    const activityLinePrefix = '    ';
    for (let i = activityStartLine + 1; i < out.length; i++) {
      if (!out[i].startsWith(activityLinePrefix)) {
        activityEndLine = i;
        break;
      }
    }
    // return the activity entry
    const info = [];
    for (let i = activityStartLine; i < activityEndLine; i++) {
      info.push(out[i].substring(2));
    }
    return new DumpSysActivityInfo(pkg, info);
  }
}

if (import.meta.main) {
  const adb = new DxAdb({
    serial: 'emulator-5554',
  });
  const dev = await adb.fetchInfo();
  const act = await adb.topActivity('com.microsoft.todos', true, dev);
  console.log(act);
}
