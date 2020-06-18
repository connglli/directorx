import DxPacker from './dxpack.ts';
import DxLog from './dxlog.ts';

export type DxPlayOptions = {
  dxpk: string; // path to dxpk
}

export default async function dxPlay(opt: DxPlayOptions): Promise<void> {
  const {
    dxpk
  } = opt;

  try {
    const packer = await DxPacker.load(dxpk);
    DxLog.debug(packer.dev);
    DxLog.debug(packer.app);
    for (const ep of packer.eventSeq) {
      const e = packer.unpack(ep);
      DxLog.debug(`${e.ty}, ${e.a.app}, ${e.a.name}`);
    }
  } catch(t) {
    DxLog.critical(t);
  }

  throw 'Not implemented by far';
}