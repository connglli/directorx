import DxDroid, { DroidInput, DevInfo } from '../dxdroid.ts';
import DxLog from '../dxlog.ts';
import DxEvent, { DxEvSeq, isXYEvent } from '../dxevent.ts';
import DxView, { Views, ViewFinder } from '../ui/dxview.ts';
import DxCompatUi from '../ui/dxui.ts';
import { Segments, SegmentFinder, SegmentBottomUpFinder } from '../ui/dxseg.ts';
import * as DxAlgo from '../algo/mod.ts';
import * as Vectors from '../utils/vecutil.ts';
import * as Strings from '../utils/strutil.ts';
import * as Errors from '../utils/error.ts';

type N<T> = T | null;

interface PluginContext {
  event: DxEvent;
  seq: DxEvSeq;
  view: DxView;
  recordee: {
    ui: DxCompatUi;
    dev: DevInfo;
  };
  playee: {
    ui: DxCompatUi;
    dev: DevInfo;
  };
  droid: DxDroid;
  algo: typeof DxAlgo;
  input: DroidInput;
  logger: typeof DxLog;
  utils: {
    Events: {
      isXYEvent: typeof isXYEvent;
    };
    Views: typeof Views;
    ViewFinder: typeof ViewFinder;
    Segments: typeof Segments;
    SegmentFinder: typeof SegmentFinder;
    SegmentBottomUpFinder: typeof SegmentBottomUpFinder;
    Vectors: typeof Vectors;
    Strings: typeof Strings;
    Errors: typeof Errors;
  };
}

interface PluginArgs {
  [key: string]: string;
}

/** Each plugin has a unique name, and an apply() function, the
 * apply() function is maybe applied multiple times, and thereby
 * it is the plugin developer's responsibility to maintain its
 * state if any */
export default interface DxPlugin {
  name(): string;
  /** Invoked when the plugin is created */
  create(args: PluginArgs): void;
  /** Apply the plugin, and return whether the plugin succeeds, by
   * succeeds, we mean the following process (synthesis) will not
   * be executed, or will */
  apply(ctx: PluginContext): Promise<boolean>;
}

function requirePluginHasTypedKey(obj: any, key: string, type: string) {
  if (obj[key] === undefined) {
    throw new Errors.IllegalStateError(
      `Invalid plugin, ${key} is not provided`
    );
  }
  if (typeof obj[key] != type) {
    throw new Errors.IllegalStateError(
      `Invalid plugin, type of ${key} is expected to be ${type})`
    );
  }
}

function checkPlugin(maybePlugin: any): DxPlugin {
  requirePluginHasTypedKey(maybePlugin, 'name', 'function');
  requirePluginHasTypedKey(maybePlugin, 'create', 'function');
  requirePluginHasTypedKey(maybePlugin, 'apply', 'function');
  return maybePlugin as DxPlugin;
}

/** Parse and create the plugin */
export async function createPlugin(line?: string): Promise<N<DxPlugin>> {
  if (!line) {
    return null;
  }
  // path:k1=v1,k2=v2,...
  const [path, argsStr = ''] = line.split(':');
  const plugin = checkPlugin(
    window.eval(new TextDecoder().decode(await Deno.readFile(path)))
  );
  const args: PluginArgs = {};
  if (argsStr.length > 0) {
    const kvList = argsStr.split(',').filter((s) => s.length > 0);
    for (const keyValue of kvList) {
      const [key, value] = keyValue.split('=');
      args[key] = value;
    }
  }
  plugin.create(args);
  return plugin;
}

/** Apply the plugin */
export async function applyPlugin(
  plugin: DxPlugin,
  ctx: Pick<
    PluginContext,
    'event' | 'seq' | 'view' | 'droid' | 'recordee' | 'playee'
  >
): Promise<boolean> {
  return await plugin.apply({
    ...ctx,
    algo: DxAlgo,
    input: ctx.droid.input,
    logger: DxLog,
    utils: {
      Events: {
        isXYEvent,
      },
      Views,
      ViewFinder,
      Segments,
      SegmentFinder,
      SegmentBottomUpFinder,
      Vectors,
      Strings,
      Errors,
    },
  });
}
