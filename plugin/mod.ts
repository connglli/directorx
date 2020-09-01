import DxDroid, { DroidInput, DevInfo } from '../dxdroid.ts';
import DxLog from '../dxlog.ts';
import DxEvent, { DxEvSeq, isXYEvent } from '../dxevent.ts';
import DxView, { Views, ViewFinder } from '../ui/dxview.ts';
import DxCompatUi from '../ui/dxui.ts';
import { Segments, SegmentFinder, SegmentBottomUpFinder } from '../ui/dxseg.ts';
import DxSynthesizer, * as DxAlgo from '../algo/mod.ts';
import * as DxAlgoDefaults from '../algo/defaults/mod.ts';
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
  synthesizer: DxSynthesizer;
}

interface PluginGlobal {
  droid: DxDroid;
  input: DroidInput;
  algo: {
    base: typeof DxAlgo;
    defaults: typeof DxAlgoDefaults;
  };
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

type PluginScriptFn = (
  plugin: DxPlugin,
  pluginGlobal: PluginGlobal,
  pluginFilePath: string
) => void;

/** Each plugin has a unique name, and an apply() function, the
 * apply() function is maybe applied multiple times, and thereby
 * it is the plugin developer's responsibility to maintain its
 * state if any */
export default class DxPlugin {
  name(): string {
    throw new Errors.NotImplementedError('name() is not implemented');
  }

  /** Invoke to create the plugin */
  create(args: PluginArgs): void {
    return this.onCreate(args);
  }

  /** Invoked when the plugin is created */
  protected onCreate(args: PluginArgs): void {}

  /** Apply the plugin, and return whether the plugin succeeds, by
   * succeeds, we mean the following process (synthesis) will not
   * be executed, or will */
  async apply(ctx: PluginContext): Promise<boolean> {
    throw new Errors.NotImplementedError('apply() is not implemented');
  }
}

async function loadScript(path: string) {
  return new TextDecoder().decode(await Deno.readFile(path));
}

function wrapScript(script: string) {
  return `(function (plugin, pluginGlobal, __plugin_filename) {
    // create a plugin sandbox
    const window = global = pluginGlobal;
    const require = function (...args) {
      throw new Error('require() is not allow in directorx plugin');
    };
    // the script of the plugin
    ${script}
  })`;
}

function compileScript(script: string) {
  return window.eval(script) as PluginScriptFn;
}

async function loadPlugin(path: string, pluginGlobal: PluginGlobal) {
  const pluginFn = compileScript(wrapScript(await loadScript(path)));
  const plugin = Object.create(new DxPlugin());
  pluginFn.call(plugin, plugin, pluginGlobal, path); // bind this to plugin
  return plugin;
}

/** Parse and create the plugin */
export async function createPlugin(
  line: string | undefined,
  droid: DxDroid
): Promise<N<DxPlugin>> {
  if (!line) {
    return null;
  }
  // path:k1=v1,k2=v2,...
  const [path, argsStr = ''] = line.split(':');
  const pluginGlobal: PluginGlobal = {
    droid,
    input: droid.input,
    algo: {
      base: DxAlgo,
      defaults: DxAlgoDefaults,
    },
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
  };
  const args: PluginArgs = {};
  if (argsStr.length > 0) {
    const kvList = argsStr.split(',').filter((s) => s.length > 0);
    for (const keyValue of kvList) {
      const [key, value] = keyValue.split('=');
      args[key] = value;
    }
  }
  const plugin = await loadPlugin(path, pluginGlobal);
  plugin.create(args);
  return plugin;
}

/** Apply the plugin */
export async function applyPlugin(
  plugin: DxPlugin,
  ctx: Pick<
    PluginContext,
    'event' | 'seq' | 'view' | 'recordee' | 'playee' | 'synthesizer'
  >
): Promise<boolean> {
  return await plugin.apply(ctx);
}
