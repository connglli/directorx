import DxView from '../ui/dxview.ts';
import { isXYEvent, DxEvSeq } from '../dxevent.ts';
import { DroidInput } from '../dxdroid.ts';
import adaptSel from './ada_sel.ts';
import { IllegalStateError } from '../utils/error.ts';

/** Lookahead, and return index of the event in next K events
 * found on current view, or -1 if not found.  */
export default async function tryLookahead(
  seq: DxEvSeq,
  kVal: number,
  view: DxView,
  input: DroidInput
): Promise<number> {
  // try to look ahead next K events, and skip several events.
  // these events (including current) can be skipped if and only
  // if their next event can be fired directly on current ui
  // TODO: add more rules to check whether v can be skipped
  if (view.text.length == 0 && seq.size() > 0) {
    const nextK = seq.topN(kVal);
    for (let i = 0; i < nextK.length; i++) {
      const ne = nextK[i];
      // we come across an non-xy event, fail
      if (!isXYEvent(ne)) {
        return -1;
      }

      // find the view in recordee
      const nv = ne.ui.findViewByXY(ne.x, ne.y);
      if (nv == null) {
        throw new IllegalStateError(
          `No visible view found on recordee tree at (${ne.x}, ${ne.y})`
        );
      }

      // find its target view map in playee
      const nvm = await adaptSel(input, nv);
      if (nvm != null && nvm.visible) {
        return i;
      }
    }
  }
  return -1;
}
