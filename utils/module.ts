/** Module and ModuleGlobal is a mark to modules, to use module,
 * create your own CustomModule implements Module, and CustomModuleGlobal
 * implements ModuleGlobal, load the module using loadModule, and then
 * invoke the function */
export interface Module {}
export interface ModuleGlobal {}

/** Meta data of the module, these are used by the module user */
export interface ModuleMeta {
  name?: string; // the module variable name of the module
  globalName?: string; // the global variable name of the module
  fileName?: string; // the file path variable name of the module
  replaceWindowGlobal?: boolean; // whether to replace the window and global variable
  useRequire?: boolean; // whether the require can be used
}

async function loadScript(path: string) {
  return new TextDecoder().decode(await Deno.readFile(path));
}

type ModuleScriptFn = (
  module: Module,
  moduleGlobal: ModuleGlobal,
  moduleFilePath: string
) => void;

function wrapScript(script: string, meta: Required<ModuleMeta>) {
  return `(function (${meta.name}, ${meta.globalName}, ${meta.fileName}) {
    ${
      // create a sandbox module
      meta.replaceWindowGlobal
        ? `const window = global = ${meta.globalName};`
        : ''
    }

    ${
      // create require if required
      meta.useRequire
        ? 'import { createRequire } from "https://deno.land/std/node/module.ts"; const require = createRequire(import.meta.url);'
        : 'const require = function (...args) { throw new Error("require() is not allow in directorx plugin"); };'
    }
    
    ${
      // the script of the plugin
      script
    }
  })`;
}

function compileScript(script: string) {
  return window.eval(script) as ModuleScriptFn;
}

export default async function loadModule(
  path: string,
  meta: ModuleMeta
): Promise<ModuleScriptFn> {
  const name = meta.name ?? 'module';
  return compileScript(
    wrapScript(await loadScript(path), {
      name,
      globalName: meta.globalName ?? `${name}Global`,
      fileName: meta.fileName ?? `__${name}FileName`,
      replaceWindowGlobal: meta.replaceWindowGlobal ?? true,
      useRequire: meta.useRequire ?? false,
    })
  );
}
