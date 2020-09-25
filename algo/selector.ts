import type DxView from '../ui/dxview.ts';
import type DxCompatUi from '../ui/dxui.ts';
import type { ViewMap } from '../dxdroid.ts';

export type OnNotFoundCallback = (
  selector: DxSelector,
  view: DxView,
  visibleOnly: boolean
) => Promise<ViewMap | null>;

/** A selector select a view map from the device that matches the view */
export default abstract class DxSelector {
  protected onNotFoundCallback: OnNotFoundCallback | null = null;

  abstract topUi(): Promise<DxCompatUi>;

  async select(view: DxView, visibleOnly: boolean): Promise<ViewMap | null> {
    let found = await this.doSelect(view, visibleOnly);
    if (!found && this.onNotFoundCallback) {
      found = await this.onNotFoundCallback(this, view, visibleOnly);
    }
    return found;
  }

  setOnNotFoundCallback(callback: OnNotFoundCallback) {
    this.onNotFoundCallback = callback;
  }

  protected abstract doSelect(
    view: DxView,
    visibleOnly: boolean
  ): Promise<ViewMap | null>;
}
