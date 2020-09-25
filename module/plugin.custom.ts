/** plugin.custom is a custom javascript module that
 * can be loaded dynamically, it differs from cjs
 * module that it does not have a module object, but
 * and it by default
 * (1) disables the `require` functionality,
 * (2) provides a custom global/window object, and
 * (3) provides a `plugin` as cjs module
 * that is specific to directorx */
import createModuleGlobal, { DxModuleGlobal } from './global.ts';
import parseModuleArgs, { DxModuleArgs } from './args.ts';
import type DxDroid from '../dxdroid.ts';
import type { DevInfo } from '../dxdroid.ts';
import type DxEvent from '../dxevent.ts';
import type { DxEvSeq } from '../dxevent.ts';
import type DxView from '../ui/dxview.ts';
import type DxCompatUi from '../ui/dxui.ts';
import type DxSynthesizer from '../algo/mod.ts';
import { NotImplementedError } from '../utils/error.ts';
import importModule, {
  Module,
  ModuleMeta,
} from '../utils/module/custom_module.ts';

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

interface PluginGlobal extends DxModuleGlobal {}

type PluginArgs = DxModuleArgs;

const PluginModuleMeta: ModuleMeta = {
  name: 'plugin',
  globalName: 'pluginGlobal',
  workingDirName: '__pluginWorkingDir',
  replaceWindowGlobal: true,
  useRequire: false,
};

/** Each plugin has a unique name, and an apply() function, the
 * apply() function is maybe applied multiple times, and thereby
 * it is the plugin developer's responsibility to maintain its
 * state if any */
export default class DxPlugin implements Module {
  name(): string {
    throw new NotImplementedError('name()');
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
    throw new NotImplementedError('apply()');
  }
}

async function loadPlugin(path: string, pluginGlobal: PluginGlobal) {
  // working directory of the plugin is the directory of the plugin
  const pluginWorkingDir = path.slice(0, path.lastIndexOf('/'));
  return await importModule(path, {
    meta: PluginModuleMeta,
    proto: new DxPlugin(),
    global: pluginGlobal,
    workingDir: pluginWorkingDir,
  });
}

/** Parse and create the plugin */
export async function createPlugin(
  pathArgs: string,
  app: string,
  droid: DxDroid
): Promise<DxPlugin> {
  const pluginGlobal: PluginGlobal = {
    ...createModuleGlobal(app, droid),
  } as PluginGlobal;
  const [path, args] = parseModuleArgs(pathArgs);
  const plugin = await loadPlugin(path, pluginGlobal);
  plugin.create(args as PluginArgs);
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
