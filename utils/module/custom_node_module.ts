import { ensureDir } from 'https://deno.land/std@0.67.0/fs/ensure_dir.ts';
import importModule, {
  Module,
  ModuleGlobal,
  ModuleMeta,
} from './custom_module.ts';

/** A node-alike module writes a module in a node way, i.e.,
 * using module.exports to export something, however, different
 * from node, this module cannot use exports directly, and no
 * require/__dirname support */
class NodeAlikeModule<T extends {}> implements Module {
  public exports: T | null = null;
}

interface NodeAlikeModuleGlobal extends ModuleGlobal {}

const NodeAlikeModuleMeta: ModuleMeta = {
  name: 'module',
  workingDirName: '__filename',
  replaceWindowGlobal: true,
  useRequire: true,
};

/** createRequire() create a require() function whose working directory is
 * workDir. This function works similar like the standard deno node module */
export default async function createRequire(workingDir: string) {
  await ensureDir(workingDir);
  return async function require<T extends {}>(
    path: string,
    global: NodeAlikeModuleGlobal = {},
    enableRequire = true
  ): Promise<T> {
    const module = await importModule(path, {
      meta: {
        ...NodeAlikeModuleMeta,
        useRequire: enableRequire,
      },
      proto: new NodeAlikeModule<T>(),
      global,
      workingDir,
    });
    if (!module.exports) {
      throw new Error('Module does not export anything');
    }
    return module.exports as T;
  };
}
