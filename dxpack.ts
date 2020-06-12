import DxEvent from './dxevent.ts';
import DxLog from './dxlog.ts';

export class DxPacker {
  constructor(
    private pkgName: string,
  ) {}

  append(e: DxEvent): void {
    DxLog.debug(`${e}`);
  }
}
