/** syncomp.node is a series node alike javascript modules that
 * are used to customize the synthesizer components, they are
 * loaded dynamically. Different from common node modules, it
 * by default
 * (1) disables the `require` functionality, and
 * (2) provides a custom global/window object that is specific
 *     to directorx */
import createModuleGlobal from './global.ts';
import {
  DxUiNormalizer,
  DxSegmentNormalizer,
  DxSegmentMatcher,
  DxRecognizer,
} from '../algo/mod.ts';
import DxDroid from '../dxdroid.ts';
import createRequire from '../utils/module/custom_node_module.ts';

/** A component create exports a create function to
 * create the required component dynamically */
type CompCreator<T> = {
  create(): Promise<T>;
};

async function createComponent<T>(path: string, app: string, droid: DxDroid) {
  const require = await createRequire(path.slice(0, path.lastIndexOf('/')));
  const creator = await require<CompCreator<T>>(path, createModuleGlobal(
    app,
    droid
  ), false);
  return await creator.create();
}

export async function createUiNormalizer(
  path: string,
  app: string,
  droid: DxDroid
): Promise<DxUiNormalizer> {
  return createComponent<DxUiNormalizer>(path, app, droid);
}

export async function createSegNormalizer(
  path: string,
  app: string,
  droid: DxDroid
): Promise<DxSegmentNormalizer> {
  return createComponent<DxSegmentNormalizer>(path, app, droid);
}

export async function createSegMatcher(
  path: string,
  app: string,
  droid: DxDroid
): Promise<DxSegmentMatcher> {
  return createComponent<DxSegmentMatcher>(path, app, droid);
}

export async function createRecognizer(
  path: string,
  app: string,
  droid: DxDroid
): Promise<DxRecognizer> {
  return createComponent<DxRecognizer>(path, app, droid);
}
