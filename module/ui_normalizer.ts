import createModuleGlobal, { DxModuleGlobal } from './global.ts';
import { DxUiNormalizer } from '../algo/mod.ts';
import loadModule, { Module, ModuleMeta } from '../utils/module.ts';
import { NotImplementedError } from '../utils/error.ts';
import DxDroid from '../dxdroid.ts';

/** An UiNormalizerCreator needs a create function to return a
 * DxUiNormalizer */
class UiNormalizerCreator implements Module {
  create(): Promise<DxUiNormalizer> {
    throw new NotImplementedError('create()');
  }
}

interface UiNormalizerCreatorGlobal extends DxModuleGlobal {}

const UiNormalizerCreatorMeta: ModuleMeta = {
  name: 'uiNorm',
  replaceWindowGlobal: true,
  useRequire: false,
};

export default async function createUiNormalizer(
  path: string,
  droid: DxDroid
): Promise<DxUiNormalizer> {
  const fn = await loadModule(path, UiNormalizerCreatorMeta);
  const creator = Object.create(
    new UiNormalizerCreator()
  ) as UiNormalizerCreator;
  const creatorGlobal = {
    ...createModuleGlobal(droid),
  } as UiNormalizerCreatorGlobal;
  fn.call(creator, creator, creatorGlobal, path);
  return await creator.create();
}
