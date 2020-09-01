import DxView from '../ui/dxview.ts';
import { ViewMap, DroidInput } from '../dxdroid.ts';

/** A selector select a view map from
 * the device that matches the view */
export default interface DxSelector {
  select(
    input: DroidInput,
    view: DxView,
    compressed: boolean
  ): Promise<ViewMap | null>;
}
