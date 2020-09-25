import parseModuleArgs, { DxModuleArgs } from './args.ts';
import type { CustomLogger } from '../dxlog.ts';
import createRequire from '../utils/module/custom_node_module.ts';

type CustomLoggerArgs = DxModuleArgs;

interface CustomLoggerCreator {
  create(args: CustomLoggerArgs): Promise<CustomLogger>;
}

export default async function createCustomLogger(
  pathArgs: string,
  app: string
) {
  const [path, args] = parseModuleArgs(pathArgs);
  const require = await createRequire(path.slice(0, path.lastIndexOf('/')));
  const creator = await require<CustomLoggerCreator>(path, {
    app,
  }, false);
  return creator.create(args);
}
