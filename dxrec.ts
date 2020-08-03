import { signal } from './deps.ts';
import DxAdb, {
  DevInfo,
  ProcessError,
  DumpSysActivityInfo,
  buildActivityFromDumpSysInfo,
} from './dxadb.ts';
import DxPacker from './dxpack.ts';
import DxEvent, {
  DxTapEvent,
  DxLongTapEvent,
  DxDoubleTapEvent,
  DxKeyEvent,
  DxSwipeEvent,
} from './dxevent.ts';
import DxActivity from './ui/dxact.ts';
import DxLog from './dxlog.ts';
import * as base64 from './utils/base64.ts';
import * as gzip from './utils/gzip.ts';
import { IllegalStateError } from './utils/error.ts';

class DxRecParser {
  private static readonly PAT_DROID = /--------- beginning of (?<type>\w+)/;
  // FIX: some apps/devices often output non-standard attributes
  // for example aid=1073741824 following resource-id
  private static readonly PAT_AV_DECOR = /DecorView@[a-fA-F0-9]+\[\w+\]\{dx-bg-class=(?<bgclass>[\w.]+)\sdx-bg-color=(?<bgcolor>[+-]?[\d.]+)\}/;
  private static readonly PAT_AV_VIEW = /(?<dep>\s*)(?<cls>[\w$.]+)\{(?<hash>[a-fA-F0-9]+)\s(?<flags>[\w.]{9})\s(?<pflags>[\w.]{8})\s(?<left>[+-]?\d+),(?<top>[+-]?\d+)-(?<right>[+-]?\d+),(?<bottom>[+-]?\d+)(?:\s#(?<id>[a-fA-F0-9]+))?(?:\s(?<rpkg>[\w.]+):(?<rtype>\w+)\/(?<rentry>\w+).*?)?\sdx-tx=(?<tx>[+-]?[\d.]+)\sdx-ty=(?<ty>[+-]?[\d.]+)\sdx-tz=(?<tz>[+-]?[\d.]+)\sdx-sx=(?<sx>[+-]?[\d.]+)\sdx-sy=(?<sy>[+-]?[\d.]+)\sdx-desc="(?<desc>.*?)"\sdx-text="(?<text>.*?)"\sdx-bg-class=(?<bgclass>[\w.]+)\sdx-bg-color=(?<bgcolor>[+-]?[\d.]+)(:?\sdx-pgr-curr=(?<pcurr>[+-]?\d+))?(:?\sdx-tab-curr=(?<tcurr>[+-]?\d+))?\}/;
  private static readonly PAT_AV_ENCODED_LINE = /[a-zA-Z0-9+/=]{1,76}/;

  private static readonly STATE_NEV = 0; // next is event
  private static readonly STATE_NAV = 1; // next is activity
  private static readonly STATE_IAV = 2; // next is activity entry

  private curr: {
    name: string;
    entries: string;
    act: DxActivity | null;
  } = { name: '', entries: '', act: null };
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
        if (
          this.curr.act == null ||
          this.curr.name.length == 0 ||
          this.curr.entries.length == 0
        ) {
          throw new IllegalStateError('Expect this.curr.name to be non-empty');
        }
        const e = this.parseEvent(line);
        this.packer.append(e); // pack it
        this.state = DxRecParser.STATE_NAV;
        // reset curr activity info
        this.curr = { name: '', entries: '', act: null };
        break;
      }

      case DxRecParser.STATE_NAV: {
        if (
          this.curr.act ||
          this.curr.name.length != 0 ||
          this.curr.entries.length != 0
        ) {
          throw new IllegalStateError('Expect this.curr.a to be null');
        }
        const name = this.parseAvStart(line);
        this.state = DxRecParser.STATE_IAV;
        // update activity name, reset entries and act
        this.curr = { name, entries: '', act: null };
        break;
      }

      case DxRecParser.STATE_IAV: {
        if (this.curr.name.length == 0) {
          throw new IllegalStateError('Expect this.curr.a to be non-null');
        }
        // no longer activity entry
        const act = this.parseAvEnd(line);
        if (act != null) {
          this.state = DxRecParser.STATE_NEV;
          // update curr activity
          this.curr.act = act;
        }
        // parse encoded activity entries
        else {
          const nextEntry = this.parseAvEncoded(line);
          // update curr activity entries
          this.curr.entries += nextEntry;
        }
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
      // TODO: collecting crash information
      throw new IllegalStateError('App crashed');
    }
    return true;
  }

  private parseEvent(line: string): DxEvent {
    // TYPE args...
    const [type, ...args] = line.split(/\s+/);

    switch (type) {
      case 'TAP':
        // TAP act t x y
        return new DxTapEvent(
          this.curr.act!, // eslint-disable-line
          Number(args[2]),
          Number(args[3]),
          Number(args[1])
        );

      case 'LONG_TAP':
        // LONG_TAP act t x y
        return new DxLongTapEvent(
          this.curr.act!, // eslint-disable-line
          Number(args[2]),
          Number(args[3]),
          Number(args[1])
        );

      case 'DOUBLE_TAP':
        // LONG_TAP act t x y
        return new DxDoubleTapEvent(
          this.curr.act!, // eslint-disable-line
          Number(args[2]),
          Number(args[3]),
          Number(args[1])
        );

      case 'SWIPE':
        // SWIPE act t0 x y dx dy t1
        return new DxSwipeEvent(
          this.curr.act!, // eslint-disable-line
          Number(args[2]),
          Number(args[3]),
          Number(args[4]),
          Number(args[5]),
          Number(args[1]),
          Number(args[6])
        );

      case 'KEY':
        // KEY act t c k
        return new DxKeyEvent(
          this.curr.act!, // eslint-disable-line
          Number(args[2]),
          args[3],
          Number(args[1])
        );

      default:
        throw new IllegalStateError(`Unexpected event type ${type}`);
    }
  }

  private parseAvStart(line: string): string {
    // ACTIVITY_BEGIN act
    const [verb, act] = line.split(/\s+/);
    if (verb != 'ACTIVITY_BEGIN') {
      throw new IllegalStateError(`Expected ACTIVITY_BEGIN, got ${verb}`);
    }
    return act;
  }

  private parseAvEnd(line: string): DxActivity | null {
    // ACTIVITY_END act
    const [verb, act] = line.split(/\s+/);
    if (verb != 'ACTIVITY_END') {
      return null;
    }

    // build the view tree
    const currName = this.curr.name;
    if (act != currName) {
      throw new IllegalStateError(`Expect ${currName}, got ${act}`);
    }

    // decode the encoded entries and parse line by line
    const decoded = base64.decodeToArrayBuffer(this.curr.entries);
    // ungzip the decoded entries
    const entries = gzip.unzip(new Uint8Array(decoded)).split('\n');

    // entries are dumpsys activity information, build the
    // activity from this dumpsys information
    return buildActivityFromDumpSysInfo(
      new DumpSysActivityInfo(
        this.app,
        entries.map((e) => e.slice(2))
      ),
      this.dev,
      this.decode
    );
  }

  private parseAvEncoded(line: string): string {
    // a base64 encoded entry
    if (DxRecParser.PAT_AV_ENCODED_LINE.test(line)) {
      return line;
    } else {
      throw new IllegalStateError('Expect an encoded base64 line');
    }
  }
}

// HERE WE GOES

export type DxRecordOptions = {
  serial?: string; // phone serial no
  tag: string; // logcat tag
  app: string; // app package
  dxpk: string; // output dxpk path
  decode: boolean; // flag: decode string or not
  verbose?: boolean; // verbose mode
};

export default async function dxRec(opt: DxRecordOptions): Promise<void> {
  const { serial, tag, app, dxpk, decode, verbose = false } = opt;

  if (verbose) {
    DxLog.setLevel('DEBUG');
  }

  const adb = new DxAdb({ serial });

  // fetch basic information
  const dev = await adb.fetchInfo();

  // prepare packer
  const packer = new DxPacker(dev, app);
  const parser = new DxRecParser(app, dev, decode, packer);

  // register SIGINT handler signal
  DxLog.info('Type ^C to exit\n');
  const handle = signal.onSignal(Deno.Signal.SIGINT, async () => {
    await packer.save(dxpk);
    DxLog.info(`\n\nEvent seq saved to ${dxpk}`);
    handle.dispose();
  });

  // prepare logger
  // clear all previous log
  await adb.clearLogcat(['main', 'crash']);
  // reset logcat size to 16M
  await adb.setLogcatSize({ size: 16, unit: 'M' }, ['main']);
  const output = adb.raw.pl.logcat(tag, {
    prio: 'I',
    silent: true,
    // disable formatted output
    formats: ['raw'],
    // log only the main and crash buffer
    buffers: ['main', 'crash'],
  });

  try {
    for await (const line of output) {
      const ln = line.trim();
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
      if (e.code == undefined || e.code == 2 || e.code == 130) {
        return;
      }
    }
    throw e;
  }
}
