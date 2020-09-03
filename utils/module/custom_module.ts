import { ensureDir } from 'https://deno.land/std@0.67.0/fs/mod.ts';
import { createRequire } from 'https://deno.land/std@0.67.0/node/module.ts';

type N<T> = T | null;

/** Module and ModuleGlobal is a mark to modules, to use module,
 * create your own CustomModule implements Module, and CustomModuleGlobal
 * implements ModuleGlobal, load the module using loadModule, and then
 * invoke the function. See NodeModule for a node-alike module */
export interface Module {}
export interface ModuleGlobal {}

/** Meta data of the module, these are used by the module user */
export interface ModuleMeta {
  name?: string; // the module variable name of the module
  globalName?: string; // the `global` variable name of the module
  workingDirName?: string; // the working directory path variable name of the module
  replaceWindowGlobal?: boolean; // whether to replace the window and global variable
  useRequire?: boolean; // whether require() can be used
}

async function loadScript(path: string) {
  return new TextDecoder().decode(await Deno.readFile(path));
}

type RequireFn = ReturnType<typeof createRequire>;

type ModuleScriptFn = (
  module: Module,
  moduleGlobal: ModuleGlobal,
  workingDir: string,
  require: N<RequireFn>
) => Promise<void>;

function wrapScript(script: string, meta: Required<ModuleMeta>) {
  return `(async function (${meta.name}, ${meta.globalName}, ${
    meta.workingDirName
  }, require) {
    ${
      // create a sandbox module
      meta.replaceWindowGlobal ? `const window = ${meta.globalName};` : ''
    }
    const global = window;

    ${
      // ensure require is null if not meta.useRequire
      !meta.useRequire ? 'require = null' : ';'
    }

    ${
      // the script of the plugin
      script
    }
  })`;
}

function compileScript(script: string): ModuleScriptFn {
  return window.eval(script) as ModuleScriptFn;
}

export type ModuleArgs<T extends Module> = {
  meta: ModuleMeta;
  proto: T;
  global: ModuleGlobal;
  workingDir: string;
};

/** importModule() loads a custom module */
export default async function importModule<T extends Module>(
  path: string,
  moduleArgs: ModuleArgs<T>
): Promise<T> {
  const {
    meta,
    proto: moduleProto,
    global: moduleGlobal,
    workingDir: moduleWorkingDir,
  } = moduleArgs;
  const name = meta.name ?? 'module';
  const scripFn = compileScript(
    wrapScript(await loadScript(path), {
      name,
      globalName: meta.globalName ?? `${name}Global`,
      workingDirName: meta.workingDirName ?? `__${name}WorkingDir`,
      replaceWindowGlobal: meta.replaceWindowGlobal ?? true,
      useRequire: meta.useRequire ?? false,
    })
  );
  let requireFn: N<RequireFn> = null;
  await ensureDir(moduleWorkingDir);
  if (meta.useRequire) {
    const platformSlash = Deno.build.os == 'windows' ? '\\' : '/';
    const endsWithSlash = moduleWorkingDir.endsWith(platformSlash);
    requireFn = createRequire(
      endsWithSlash ? moduleWorkingDir : moduleWorkingDir + platformSlash
    );
  }
  const module = Object.create(moduleProto) as T;
  await scripFn.call(
    module, // bind this to module itself
    module,
    moduleGlobal,
    moduleWorkingDir,
    requireFn
  );
  return module;
}
