import { signal } from './deps.ts';
import {
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
  DxTextEvent,
  DxHideSoftKeyboardEvent,
} from './dxevent.ts';
import DxCompatUi from './ui/dxui.ts';
import DxLog from './dxlog.ts';
import DxDroid from './dxdroid.ts';
import createLifecycleHook, {
  DxLifecycleHook,
} from './module/lifecycle.node.ts';
import * as base64 from './utils/base64.ts';
import * as gzip from './utils/gzip.ts';
import { IllegalStateError } from './utils/error.ts';

class DxRecParser {
  private static readonly PAT_DROID = /--------- beginning of (?<type>\w+)/;
  private static readonly PAT_AV_ENCODED_LINE = /[a-zA-Z0-9+/=]{1,76}/;

  private static readonly STATE_NEV = 0; // next is event
  private static readonly STATE_NUI = 1; // next is ui
  private static readonly STATE_IUI = 2; // next is ui entry

  private curr: {
    name: string;
    entries: string;
    ui: DxCompatUi | null;
  } = { name: '', entries: '', ui: null };
  private state = DxRecParser.STATE_NUI;

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
          this.curr.ui == null ||
          this.curr.name.length == 0 ||
          this.curr.entries.length == 0
        ) {
          throw new IllegalStateError('Expect this.curr.name to be non-empty');
        }
        const e = this.parseEvent(line);
        this.packer.append(e); // pack it
        this.state = DxRecParser.STATE_NUI;
        // reset curr ui info
        this.curr = { name: '', entries: '', ui: null };
        break;
      }

      case DxRecParser.STATE_NUI: {
        if (
          this.curr.ui ||
          this.curr.name.length != 0 ||
          this.curr.entries.length != 0
        ) {
          throw new IllegalStateError('Expect this.curr.a to be null');
        }
        const name = this.parseUiStart(line);
        this.state = DxRecParser.STATE_IUI;
        // update ui name, reset entries and ui
        this.curr = { name, entries: '', ui: null };
        break;
      }

      case DxRecParser.STATE_IUI: {
        if (this.curr.name.length == 0) {
          throw new IllegalStateError('Expect this.curr.a to be non-null');
        }
        // no longer ui entry
        const ui = this.parseUiEnd(line);
        if (ui != null) {
          this.state = DxRecParser.STATE_NEV;
          // update curr ui
          this.curr.ui = ui;
        }
        // parse encoded ui entries
        else {
          const nextEntry = this.parseUiEncoded(line);
          // update curr ui entries
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
    const [type, ...args] = line.split(' ');

    switch (type) {
      case 'TAP':
        // TAP ui t x y
        return new DxTapEvent(
          this.curr.ui!, // eslint-disable-line
          Number(args[2]),
          Number(args[3]),
          Number(args[1])
        );

      case 'LONG_TAP':
        // LONG_TAP ui t x y
        return new DxLongTapEvent(
          this.curr.ui!, // eslint-disable-line
          Number(args[2]),
          Number(args[3]),
          Number(args[1])
        );

      case 'DOUBLE_TAP':
        // LONG_TAP ui t x y
        return new DxDoubleTapEvent(
          this.curr.ui!, // eslint-disable-line
          Number(args[2]),
          Number(args[3]),
          Number(args[1])
        );

      case 'SWIPE':
        // SWIPE ui t0 x y dx dy t1
        return new DxSwipeEvent(
          this.curr.ui!, // eslint-disable-line
          Number(args[2]),
          Number(args[3]),
          Number(args[4]),
          Number(args[5]),
          Number(args[1]),
          Number(args[6])
        );

      case 'KEY':
        // KEY ui t c k
        return new DxKeyEvent(
          this.curr.ui!, // eslint-disable-line
          Number(args[2]),
          args[3],
          Number(args[1])
        );

      case 'TEXT':
        // TEXT ui t x
        return new DxTextEvent(
          this.curr.ui!,
          base64.decode(args[2]),
          Number(args[1])
        );

      case 'HIDE_SIME':
        // HIDE_SIME ui t
        return new DxHideSoftKeyboardEvent(this.curr.ui!, Number(args[1]));

      default:
        throw new IllegalStateError(`Unexpected event type ${type}`);
    }
  }

  private parseUiStart(line: string): string {
    // GUI_BEGIN ui
    const [verb, ui] = line.split(/\s+/);
    if (verb != 'GUI_BEGIN') {
      throw new IllegalStateError(`Expected GUI_BEGIN, got ${verb}`);
    }
    return ui;
  }

  private parseUiEnd(line: string): DxCompatUi | null {
    // GUI_END ui
    const [verb, ui] = line.split(/\s+/);
    if (verb != 'GUI_END') {
      return null;
    }

    // build the view tree
    const currName = this.curr.name;
    if (ui != currName) {
      throw new IllegalStateError(`Expect ${currName}, got ${ui}`);
    }

    // decode the encoded entries and parse line by line
    const decoded = base64.decodeToArrayBuffer(this.curr.entries);
    // ungzip the decoded entries
    const entries = gzip.unzip(new Uint8Array(decoded)).split('\n');

    // entries are dumpsys ui information, build the
    // ui from this dumpsys information, let's reuse
    // activity builder to build the compat ui that
    // are not activity (maybe dialog, popupwindow)
    let isActivity = true;
    if (
      entries[0].startsWith('  PHONE_WINDOW') ||
      entries[0].startsWith('  POPUP_WINDOW')
    ) {
      entries[0] = '  ACTIVITY' + entries[0].slice('  POPUP_WINDOW'.length);
      isActivity = false;
    }
    const compatUi = buildActivityFromDumpSysInfo(
      new DumpSysActivityInfo(
        this.app,
        entries.map((e) => e.slice(2))
      ),
      this.dev,
      this.decode
    );
    compatUi.isActivity = isActivity;
    return compatUi;
  }

  private parseUiEncoded(line: string): string {
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
  lifecycleHookPath?: string; // lifecycle hook path
};

export default async function dxRec(opt: DxRecordOptions): Promise<void> {
  const {
    serial,
    tag,
    app,
    dxpk,
    decode,
    verbose = false,
    lifecycleHookPath,
  } = opt;

  if (verbose) {
    DxLog.setLevel('DEBUG');
  }

  // fetch basic information
  await DxDroid.connect(serial);
  const droid = DxDroid.get();
  const adb = droid.adb;
  const dev = droid.dev;
  let lifecycleHook: DxLifecycleHook | null = null;
  if (lifecycleHookPath) {
    lifecycleHook = await createLifecycleHook(lifecycleHookPath, app, droid);
  }

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
    await lifecycleHook?.onStart();
    await Promise.all([
      lifecycleHook?.onResume(),
      (async () => {
        for await (const line of output) {
          const ln = line.trim();
          if (ln.length != 0) {
            // DxLog.debug(ln);
            parser.parse(ln);
          }
        }
      })(),
    ]);
  } catch (e) {
    if (e instanceof ProcessError) {
      // https://unix.stackexchange.com/questions/223189/what-does-exit-code-130-mean-for-postgres-command
      // many shell follows the convention that using 128+signal_number
      // as an exit number, use `kill -l exit_code` to see which signal
      // exit_code stands for
      if (e.code == undefined || e.code == 2 || e.code == 130) {
        await lifecycleHook?.onStop();
        return;
      }
    }
    await lifecycleHook?.onUnhandledException(e);
    throw e;
  }
}
