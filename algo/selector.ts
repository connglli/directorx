import DxView from '../ui/dxview.ts';
import DxCompatUi from '../ui/dxui.ts';
import { ViewMap } from '../dxdroid.ts';

/** A selector select a view map from the device that matches the view */
export default interface DxSelector {
  select(view: DxView, visibleOnly: boolean): Promise<ViewMap | null>;
  top(): Promise<DxCompatUi>;
}
