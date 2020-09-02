import createModuleGlobal, { DxModuleGlobal } from './global.ts';
import DxDroid, { DevInfo } from '../dxdroid.ts';
import DxEvent, { DxEvSeq } from '../dxevent.ts';
import DxView from '../ui/dxview.ts';
import DxCompatUi from '../ui/dxui.ts';
import DxSynthesizer from '../algo/mod.ts';
import { NotImplementedError } from '../utils/error.ts';
import loadModule, { Module, ModuleMeta } from '../utils/module.ts';

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

type PluginArgs = Record<string, string>;

const PluginModuleMeta: ModuleMeta = {
  name: 'plugin',
  globalName: 'pluginGlobal',
  fileName: '__pluginFileName',
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
  const pluginFn = await loadModule(path, PluginModuleMeta);
  const plugin = Object.create(new DxPlugin()) as DxPlugin;
  pluginFn.call(plugin, plugin, pluginGlobal, path); // bind this to plugin
  return plugin;
}

/** Parse and create the plugin */
export async function createPlugin(
  line: string,
  droid: DxDroid
): Promise<DxPlugin> {
  // path:k1=v1,k2=v2,...
  const [path, argsStr = ''] = line.split(':');
  const pluginGlobal: PluginGlobal = {
    ...createModuleGlobal(droid),
  } as PluginGlobal;
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
