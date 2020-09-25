import createModuleGlobal from './global.ts';
import parseModuleArgs, { DxModuleArgs } from './args.ts';
import type DxDroid from '../dxdroid.ts';
import createRequire from '../utils/module/custom_node_module.ts';

type LifecycleHookArgs = DxModuleArgs;

/** DxLifecycleHook hooks into directorx, each method is expected
 * to run in limited time, or the program will hang */
export class DxLifecycleHook {
  /** Invoked immediately after the hook is created */
  async onCreate(args: LifecycleHookArgs) {}
  /** Invoked before directorx start */
  async onStart() {}
  /** Invoked simultaneously with directorx */
  async onResume() {}
  /** Invoked when directorx normally stops */
  async onStop() {}
  /** Invoked when directorx stopped by an unhandled exception */
  async onUnhandledException(exp: any) {}
}

export default async function createLifecycleHook(
  pathArgs: string,
  app: string,
  droid: DxDroid
) {
  const [path, args] = parseModuleArgs(pathArgs);
  const require = await createRequire(path.slice(0, path.lastIndexOf('/')));
  const impl = await require<Partial<DxLifecycleHook>>(path, createModuleGlobal(
    app,
    droid
  ), false);
  const hook = Object.assign(new DxLifecycleHook(), impl) as DxLifecycleHook;
  await hook.onCreate(args);
  return hook;
}
