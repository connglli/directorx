import { signal } from './deps.ts';
import { DxAdb, DevInfo, ProcessError } from './dxadb.ts';
import DxPacker from './dxpack.ts';
import DxEvent, {
  DxTapEvent,
  DxLongTapEvent,
  DxDoubleTapEvent,
  DxKeyEvent,
  DxSwipeEvent,
} from './dxevent.ts';
import DxView, { 
  DxViewFlags, 
  DxViewVisibility, 
  DxActivity,
  DxViewPager,
  DxTabHost,
  DxViewType
} from './dxview.ts';
import DxLog from './dxlog.ts';
import { decode as base64Decode } from './utils/base64.ts';
import { IllegalStateError } from './utils/error.ts';

class DxRecParser {
  private static readonly PAT_DROID = /--------- beginning of (?<type>\w+)/;
  // FIX: some apps/devices often output non-standard attributes 
  // for example aid=1073741824 following resource-id
  private static readonly PAT_AV_VIEW = /(?<dep>\s*)(?<cls>[\w$.]+)\{(?<hash>[a-fA-F0-9]+)\s(?<flags>[\w.]{9})\s(?<pflags>[\w.]{8})\s(?<left>[+-]?\d+),(?<top>[+-]?\d+)-(?<right>[+-]?\d+),(?<bottom>[+-]?\d+)\s(?:#(?<id>[a-fA-F0-9]+)\s(?<rpkg>[\w.]+):(?<rtype>\w+)\/(?<rentry>\w+)\s.*?)?dx-tx=(?<tx>[+-]?[\d.]+)\sdx-ty=(?<ty>[+-]?[\d.]+)\sdx-tz=(?<tz>[+-]?[\d.]+)\sdx-sx=(?<sx>[+-]?[\d.]+)\sdx-sy=(?<sy>[+-]?[\d.]+)\sdx-desc="(?<desc>.*?)"\sdx-text="(?<text>.*?)"(:?\sdx-pgr-curr=(?<pcurr>[+-]?\d+))?(:?\sdx-tab-curr=(?<tcurr>[+-]?\d+))?\}/;

  private static readonly STATE_NEV = 0; // next is event
  private static readonly STATE_NAV = 1; // next is activity
  private static readonly STATE_IAV = 2; // next is activity entry

  private curr: {
    a: DxActivity | null;
    v: DxView | null;
    d: number;
  } = {
    a: null,
    v: null,
    d: -1,
  };
  private state = DxRecParser.STATE_NAV;

  constructor(
    private readonly app: string,
    private readonly dev: DevInfo,
    private readonly decode: boolean,
    private readonly packer: DxPacker
  ) {}

  parse(line: string): void {
    // android system output
    if (this.parseDroid(line)) {
      return;
    }

    // dxrec output
    switch (this.state) {
    case DxRecParser.STATE_NEV: {
      if (!this.curr.a) {
        throw new IllegalStateError('Expect this.curr.a to be non-null');
      }
      const e = this.parseEvent(line);
      this.packer.append(e); // pack it
      this.state = DxRecParser.STATE_NAV;
      // reset curr
      this.curr = { 
        a: null, v: null, d: -1
      };
      break;
    }

    case DxRecParser.STATE_NAV: {
      if (this.curr.a) {
        throw new IllegalStateError('Expect this.curr.a to be null');
      }
      const a = this.parseAvStart(line);
      this.state = DxRecParser.STATE_IAV;
      // update curr
      this.curr = {
        a, v: null, d: -1,
      };
      break;
    }

    case DxRecParser.STATE_IAV: {
      if (!this.curr.a) {
        throw new IllegalStateError('Expect this.curr.a to be non-null');
      }
      // no longer activity entry
      if (this.parseAvEnd(line)) {
        this.state = DxRecParser.STATE_NEV;
        break;
      }
      // parse an activity entry
      const [view, dep] = this.parseAvEntry(line);
      // update curr
      this.curr = {
        ...this.curr, v: view, d: dep,
      };
      break;
    }

    default:
      throw new IllegalStateError(`Unexpected state ${this.state}`);
    }
  }

  private parseDroid(line: string): boolean {
    const res = DxRecParser.PAT_DROID.exec(line);
    if (!res) {
      return false;
    }
    const type = res.groups!.type; // eslint-disable-line
    if (type == 'crash') {
      // TODO collecting crash information
      throw new IllegalStateError('App crashed');
    }
    return true;
  }

  private parseEvent(line: string): DxEvent {
    const [pkg, type, ...args] = line.split(/\s+/);
    if (pkg != this.app) {
      throw new IllegalStateError(`Expected ${this.app}, got ${pkg}`);
    }

    switch (type) {
    case 'TAP':
      // TAP act t x y
      return new DxTapEvent(
        this.curr.a!, // eslint-disable-line
        Number(args[2]),
        Number(args[3]),
        Number(args[1]),
      );
      break;

    case 'LONG_TAP':
      // LONG_TAP act t x y
      return new DxLongTapEvent(
        this.curr.a!, // eslint-disable-line
        Number(args[2]),
        Number(args[3]),
        Number(args[1])
      );
      break;

    case 'DOUBLE_TAP':
      // LONG_TAP act t x y
      return new DxDoubleTapEvent(
        this.curr.a!, // eslint-disable-line
        Number(args[2]),
        Number(args[3]),
        Number(args[1])
      );
      break;

    case 'SWIPE':
      // SWIPE act t0 x y dx dy t1
      return new DxSwipeEvent(
        this.curr.a!, // eslint-disable-line
        Number(args[2]),
        Number(args[3]),
        Number(args[4]),
        Number(args[5]),
        Number(args[1]),
        Number(args[6])
      );
      break;

    case 'KEY':
      // KEY act t c k
      return new DxKeyEvent(
        this.curr.a!, // eslint-disable-line
        Number(args[2]),
        args[3],
        Number(args[1])
      );
      break;

    default:
      throw new IllegalStateError(`Unexpected event type ${type}`);
    }
  }

  private parseAvStart(line: string): DxActivity {
    // pkg ACTIVITY_BEGIN act
    const [pkg, verb, act] = line.split(/\s+/);
    if (pkg != this.app) {
      throw new IllegalStateError(`Expected ${this.app}, got ${pkg}`);
    }
    if (verb != 'ACTIVITY_BEGIN') {
      throw new IllegalStateError(`Expected ACTIVITY_BEGIN, got ${verb}`);
    }
    return new DxActivity(pkg, act);
  }

  private parseAvEnd(line: string): boolean {
    // pkg ACTIVITY_END act
    const [pkg, verb, act] = line.split(/\s+/);
    if (verb == 'ACTIVITY_END') {
      const currName = this.curr.a!.name; // eslint-disable-line
      if (pkg != this.app || act != currName) {
        throw new IllegalStateError(`Expect ${this.app}/${currName}, got ${pkg}/${act}`);
      }
      return true;
    }
    return false;
  }

  private parseAvEntry(line: string): [DxView, number] {
    // check and install decor if necessary
    if (!this.curr.v) {
      if (!line.startsWith('DecorView')) {
        throw new IllegalStateError('Expect DecorView');
      }
      /* eslint-disable */
      this.curr.a!.installDecor(this.dev.width, this.dev.height);
      return [this.curr.a!.decorView!, 0];
    }

    // parse view line by line
    const res = DxRecParser.PAT_AV_VIEW.exec(line);
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
      pcurr: sPcurr, tcurr: sTcurr
    } = res.groups;

    // find parent of current view
    const dep = sDep.length;
    let parent: DxView;
    let diff = dep - this.curr.d;
    if (diff == 0) { // sibling of curr
      parent = this.curr.v.parent as DxView;
    } else if (diff > 0) { // child of curr
      if (diff != 1) {
        throw new IllegalStateError(`Expect a direct child, but got an indirect (+${diff}) child`);
      }
      parent = this.curr.v;
    } else { // sibling of an ancestor
      let ptr = this.curr.v;
      while (diff != 0) {
        ptr = ptr.parent!; // eslint-disable-line
        diff += 1;
      }
      parent = ptr.parent!; // eslint-disable-line
    }

    // parse and construct the view
    const flags: DxViewFlags = {
      V: sFlags[0] == 'V' 
        ? DxViewVisibility.VISIBLE
        : sFlags[0] == 'I' 
          ? DxViewVisibility.INVISIBLE
          : DxViewVisibility.GONE,
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
    if (parent.flags.V == DxViewVisibility.INVISIBLE) {
      if (flags.V == DxViewVisibility.VISIBLE) {
        flags.V = DxViewVisibility.INVISIBLE;
      }
    } else if (parent.flags.V == DxViewVisibility.GONE) {
      flags.V = DxViewVisibility.GONE;
    }

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
    let text: string;
    let desc: string;
    if (this.decode) {
      text = base64Decode(sText);
      desc = base64Decode(sDesc);
    } else {
      text = sText;
      desc = sDesc;
    }

    // create the view
    let view: DxView;
    if (sPcurr) {
      view = this.packer.newView(DxViewType.VIEW_PAGER);
    } else if (sTcurr) {
      view = this.packer.newView(DxViewType.TAB_HOST);
    } else {
      view = this.packer.newView(DxViewType.OTHERS);
    }

    // reset common properties
    view.reset(
      parent.pkg, cls, flags,
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
}

// HERE WE GOES

export type DxRecordOptions = {
  serial?: string;  // phone serial no
  tag:     string;  // logcat tag
  app:     string;  // app package
  dxpk:    string;  // output dxpk path
  decode:  boolean; // flag: decode string or not
}

export default async function dxRec(opt: DxRecordOptions): Promise<void> {
  const {
    serial, tag, app, dxpk, decode
  } = opt;
  const adb = new DxAdb({ serial });

  // fetch basic information
  const dev = await adb.fetchInfo();

  // prepare packer
  const packer = new DxPacker(dev, app);
  const parser = new DxRecParser(app, dev, decode, packer);

  // register SIGINT handler signal
  DxLog.info("Type ^C to exit\n");
  const handle = signal.onSignal(Deno.Signal.SIGINT, async () => {
    await packer.save(dxpk);
    DxLog.info(`\n\nEvent seq saved to ${dxpk}`);
    handle.dispose();
  });

  // prepare logger
  // clear all previous log
  await adb.clearLogcat();
  const output = adb.raw.pl.logcat(tag, {
    prio: "D",
    silent: true,
    // disable formatted output
    formats: ["raw"],
  });

  try {
    for await (const line of output) {
      const ln = line.trimEnd();
      if (ln.length != 0) {
        // DxLog.debug(ln);
        parser.parse(ln);
      }
    }
  } catch (e) {
    if (e instanceof ProcessError) {
      // https://unix.stackexchange.com/questions/223189/what-does-exit-code-130-mean-for-postgres-command
      // many shell follows the convention that using 128+signal_number
      // as an exit number, use `kill -l exit_code` to see which signal
      // exit_code stands for
      if (e.code == undefined || e.code == 2 || e.code == 130) { return; }
    }
    throw e;
  }
}