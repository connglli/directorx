export type DxModuleArgs = Record<string, string>;

/** Parse and return the [path, args], formats
 * path:k1=v1,k2=v2,... */
export default function parseModuleArgs(
  pathArgs: string
): [string, DxModuleArgs] {
  const [path, argsStr = ''] = pathArgs.split(':');
  const args: DxModuleArgs = {};
  if (argsStr.length > 0) {
    const kvList = argsStr.split(',').filter((s) => s.length > 0);
    for (const keyValue of kvList) {
      const [key, value] = keyValue.split('=');
      args[key] = value;
    }
  }
  return [path, args];
}
