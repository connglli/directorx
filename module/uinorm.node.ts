/** uinorm.node is a node alike javascript module that
 * can be loaded dynamically, however, it by default
 * (1) disables the `require` functionality, and
 * (2) provides a custom global/window object
 * that is specific to directorx */
import createModuleGlobal from './global.ts';
import { DxUiNormalizer } from '../algo/mod.ts';
import DxDroid from '../dxdroid.ts';
import createRequire from '../utils/module/custom_node_module.ts';

/** An UiNormalizerCreator needs a create function to return a
 * DxUiNormalizer */
type UiNormalizerCreator = {
  create(): Promise<DxUiNormalizer>;
};

export default async function createUiNormalizer(
  path: string,
  droid: DxDroid
): Promise<DxUiNormalizer> {
  const require = await createRequire(path.slice(0, path.lastIndexOf('/')));
  const creator = await require<UiNormalizerCreator>(path, createModuleGlobal(
    droid
  ), false);
  return await creator.create();
}
