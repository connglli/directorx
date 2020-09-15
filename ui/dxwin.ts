import DxView, { DxDecorView, ViewFinder, Views } from './dxview.ts';
import { XYInterval } from '../utils/interval.ts';
import { IllegalStateError } from '../utils/error.ts';

type N<T> = T | null;

/** Each window has only one view hierarchy, which is
 * rooted by a special view named decor */
export default class DxWindow {
  decor: N<DxDecorView> = null;
}

/** A WindowOwner owns and manages an window */
export class WindowOwner {
  protected window = new DxWindow();
  constructor(public readonly app: string) {}

  get decorView(): N<DxDecorView> {
    return this.window.decor;
  }

  installDecor(
    hash: string,
    width: number,
    height: number,
    bgClass: string,
    bgColor: number | null
  ): void {
    if (this.decorView) {
      throw new IllegalStateError('Decor already installed');
    }
    this.window.decor = new DxDecorView(
      this.app,
      hash,
      width,
      height,
      bgClass,
      bgColor
    );
  }

  replaceDecor(decor: DxDecorView): void {
    if (this.decorView && this.decorView.pkg != decor.pkg) {
      throw new IllegalStateError('Cannot set the decor from a different app');
    }
    this.window.decor = decor;
  }

  findViewByHash(hash: string): N<DxView> {
    return this.decorView
      ? ViewFinder.findViewByHash(this.decorView, hash)
      : null;
  }

  findViewById(id: string): N<DxView> {
    return this.decorView ? ViewFinder.findViewById(this.decorView, id) : null;
  }

  findViewByXY(x: number, y: number, visible = true): N<DxView> {
    return this.decorView
      ? ViewFinder.findViewByXY(this.decorView, x, y, visible)
      : null;
  }

  findViewByText(text: string, caseInsensitive = false): N<DxView> {
    return this.decorView
      ? ViewFinder.findViewByText(this.decorView, text, caseInsensitive)
      : null;
  }

  findViewByDesc(desc: string): N<DxView> {
    return this.decorView
      ? ViewFinder.findViewByDesc(this.decorView, desc)
      : null;
  }

  findViewByResource(type: string, entry: string): N<DxView> {
    return this.decorView
      ? ViewFinder.findViewByResource(this.decorView, type, entry)
      : null;
  }

  findViews(pred: (v: DxView) => boolean): DxView[] {
    return this.decorView ? ViewFinder.findViews(this.decorView, pred) : [];
  }

  /** Build the drawing level top-down. Views at each level are
   * not overlapped, but views at adjacent levels are overlapped
   * at least at one view. See more in source code of
   * Android Studio Dynamic Layout Inspector:
   * https://android.googlesource.com/platform/tools/adt/idea/+/refs/heads/studio-master-dev/layout-inspector/src/com/android/tools/idea/layoutinspector/ui/DeviceViewPanelModel.kt#175 */
  buildDrawingLevelLists(): DxView[][] {
    if (!this.decorView) {
      return [];
    }

    const levelLists: DxView[][] = [];

    function doBuildForView(view: DxView, level: number) {
      let viewLevel = level;
      const viewBounds = Views.bounds(view);
      if (view.shown) {
        // Find how many levels we can step up from our base level
        // (level), the levels we can step up are those where there
        // are views inside overlapping with us. And the level where
        // no views inside are overlapped with us is our level
        const levelUp = levelLists
          .slice(level, levelLists.length)
          .findIndex(
            (l) =>
              l.filter((node) =>
                XYInterval.overlap(Views.bounds(node), viewBounds)
              ).length == 0
          );
        if (levelUp == -1) {
          // as long as we are overlapped with all preceding
          // levels, let's create a new level
          viewLevel = levelLists.length;
          levelLists.push([] as DxView[]);
        } else {
          // we've found our level up, add it
          viewLevel += levelUp;
        }
        // set our level, and add us to the out level list
        view.drawingLevel = viewLevel;
        levelLists[viewLevel].push(view);
      }
      view.children.forEach((v) => doBuildForView(v, viewLevel));
    }

    this.decorView.children.forEach((v) =>
      doBuildForView(v, levelLists.length)
    );

    return levelLists;
  }
}
