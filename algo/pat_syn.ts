import DxView, {
  DxTabHost,
  DxViewPager,
  DxActivity,
  Views,
  ViewFinder,
} from '../dxview.ts';
import { DxSegment } from './ui_seg.ts';
import DxEvent, { DxTapEvent, DxSwipeEvent } from '../dxevent.ts';
import { DevInfo } from '../dxdroid.ts';
import { NotImplementedError, IllegalStateError } from '../utils/error.ts';

type N<T> = T | null;

/** Synthetic event returned by applying each pattern */
export class SyntEvent {
  constructor(public readonly e: DxEvent) {}
}

export interface PatRecArgs {}

export abstract class DxPat {
  constructor(protected readonly args: PatRecArgs) {}
  abstract match(): boolean;
  abstract apply(): SyntEvent;
}

export interface InvisiblePatRecArgs extends PatRecArgs {
  v: DxView;
  // playee activity
  a: DxActivity;
  // playee device
  d: DevInfo;
}

/** Invisible pattern is used for those views which are
 * invisible but still presented on the view tree
 */
export class Invisible extends DxPat {
  // parent that are visible to user
  private vParent: N<DxView> = null;
  constructor(protected args: InvisiblePatRecArgs) {
    super(args);
  }

  match(): boolean {
    // find its visible parent
    const { v: view, a: act, d: dev } = this.args;
    this.vParent = ViewFinder.findParent(
      view,
      (p) => Views.isViewImportantForA11y(p) && Views.isVisibleToUser(p, dev)
    );
    return !!this.vParent;
  }

  apply(): SyntEvent {
    // TODO: what if the view is not triggered by
    // tapping its visible parent?
    if (this.vParent == null) {
      throw new IllegalStateError("Pattern is not satisfied, don't apply");
    }
    return new SyntEvent(
      new DxTapEvent(
        this.args.a,
        this.vParent.drawingX + 1,
        this.vParent.drawingY + 1,
        -1
      )
    );
  }
}

export interface BpPatRecArgs extends PatRecArgs {
  // view on recordee
  v: DxView;
  // the recordee
  r: {
    s: DxSegment;
    a: DxActivity;
  };
  // the playee
  p: {
    s: DxSegment;
    a: DxActivity;
  };
}

/** Bottom-up patterns that our pattern recognition
 * algorithm used. The level denotes the level the
 * pattern resides. To implements
 */
export abstract class DxBpPat extends DxPat {
  constructor(protected args: BpPatRecArgs) {
    super(args);
  }

  abstract level(): string;
}

abstract class Expand extends DxBpPat {
  level() {
    return 'expand';
  }
}

/** Scroll is the pattern that handles scrollable parent */
class Scroll extends Expand {
  private vHSParent: N<DxView> = null;
  private vVSParent: N<DxView> = null;

  // TODO: what if the parent is segmented to several segments,
  // and the parent itself does not belong to any leaf segments?
  // Possibly not happen, because our ui segmentation parent tends
  // not to segment a list (i.e., having many similar children)
  // BUG: what if the scroll never stops (i.e., the list is not
  // the corresponding matched list)
  // BUG: if swipe to the bottom, and then swipe top, next will
  // swipe bottom, this will make it never swipe to the top
  match(): boolean {
    // test whether v is children of a scrollable parent
    this.vHSParent = ViewFinder.findHScrollableParent(this.args.v);
    this.vVSParent = ViewFinder.findVScrollableParent(this.args.v);
    if (!this.vHSParent && !this.vVSParent) {
      return false;
    }
    // find the corresponding scrollable parent in the playee segment
    if (this.vHSParent) {
      this.vHSParent = this.findTarget(this.vHSParent);
    }
    if (this.vVSParent) {
      this.vVSParent = this.findTarget(this.vVSParent);
    }
    return !!this.vHSParent || !!this.vVSParent;
  }

  apply(): SyntEvent {
    if (this.vHSParent == null && this.vVSParent == null) {
      throw new IllegalStateError("Pattern is not satisfied, don't apply");
    } else if (this.vHSParent != null && this.vVSParent != null) {
      if (this.vVSParent == this.vHSParent) {
        throw new IllegalStateError(
          'Both horizontally and vertically scrollable (same parent)'
        );
      } else {
        throw new IllegalStateError(
          'Both horizontally and vertically scrollable (different parent)'
        );
      }
    } else if (this.vHSParent != null) {
      return this.applyHs();
    } else {
      return this.applyVs();
    }
  }

  private findTarget(v: DxView): N<DxView> {
    let found: N<DxView> = null;
    let fns = [
      [v.text.length > 0, ViewFinder.findViewByText, v, v.text],
      [
        v.resId.length > 0,
        ViewFinder.findViewByResource,
        v,
        v.resType,
        v.resEntry,
      ],
      [v.desc.length > 0, ViewFinder.findViewByDesc, v, v.desc],
    ];
    for (const r of this.args.p.s.roots) {
      for (const [test, fn, ...args] of fns) {
        found = found || (test && (fn as Function)(...args));
      }
      if (found) {
        break;
      }
    }
    return found;
  }

  private applyHs(): SyntEvent {
    if (this.vHSParent == null) {
      throw new IllegalStateError("Pattern is not satisfied, don't apply");
    }
    if (Views.canScrollRight(this.vHSParent)) {
      return new SyntEvent(
        new DxSwipeEvent(
          this.args.p.a,
          Views.xCenter(this.vHSParent),
          Views.yCenter(this.vHSParent),
          Views.xCenter(this.vHSParent),
          0,
          0,
          300
        )
      );
    } else if (Views.canScrollLeft(this.vHSParent)) {
      return new SyntEvent(
        new DxSwipeEvent(
          this.args.p.a,
          Views.xCenter(this.vHSParent),
          Views.yCenter(this.vHSParent),
          -Views.xCenter(this.vHSParent),
          0,
          0,
          300
        )
      );
    } else {
      throw new IllegalStateError("Pattern is not satisfied, don't apply");
    }
  }

  private applyVs(): SyntEvent {
    if (this.vVSParent == null) {
      throw new IllegalStateError("Pattern is not satisfied, don't apply");
    }
    if (Views.canScrollBottom(this.vVSParent)) {
      return new SyntEvent(
        new DxSwipeEvent(
          this.args.p.a,
          Views.xCenter(this.vVSParent),
          Views.yCenter(this.vVSParent),
          0,
          Views.yCenter(this.vVSParent),
          0,
          300
        )
      );
    } else if (Views.canScrollTop(this.vVSParent)) {
      return new SyntEvent(
        new DxSwipeEvent(
          this.args.p.a,
          Views.xCenter(this.vVSParent),
          Views.yCenter(this.vVSParent),
          0,
          -Views.yCenter(this.vVSParent),
          0,
          300
        )
      );
    } else {
      throw new IllegalStateError("Pattern is not satisfied, don't apply");
    }
  }
}

abstract class Reveal extends DxBpPat {
  level() {
    return 'reveal';
  }
}

/** SpecialButton is the pattern for some special buttons */
abstract class SpecialButton extends Reveal {
  // the specific button that triggers a specific functionality
  protected vButton: N<DxView> = null;

  match(): boolean {
    // check if there are MoreOptions button
    // buttons in the playee segment
    for (const r of this.args.p.s.roots) {
      const btn = this.findView(r);
      if (btn != null) {
        this.vButton = btn;
        return true;
      }
    }
    return false;
  }

  apply(): SyntEvent {
    if (this.vButton == null) {
      throw new IllegalStateError("Pattern is not satisfied, don't apply");
    }
    // synthesize a tap event on the
    // more options button
    return new SyntEvent(
      new DxTapEvent(
        this.args.p.a,
        Views.x0(this.vButton) + 1,
        Views.y0(this.vButton) + 1,
        -1
      )
    );
  }

  abstract findView(v: DxView): N<DxView>;
}

/** MoreOption is the pattern for more options */
class MoreOptions extends SpecialButton {
  static DESC = 'More options';

  findView(v: DxView): N<DxView> {
    return ViewFinder.findViewByDesc(v, MoreOptions.DESC);
  }
}

/** DrawerMenu is the pattern for drawer */
class DrawerMenu extends SpecialButton {
  static DESC = 'Open navigation drawer';

  findView(v: DxView): N<DxView> {
    return ViewFinder.findViewByDesc(v, DrawerMenu.DESC);
  }
}

/** TabHostTab is the pattern for tabs of a TabHost */
class TabHostTab extends Reveal {
  // tabs are direct children of the a view
  // whose resource-id is android:id/tabs
  static isTabHostTabs(v: DxView): boolean {
    return v.resId == 'android:id/tabs';
  }

  // the path from the view to the tab's parent
  protected vPath: DxView[] = [];

  match(): boolean {
    // check whether v is in a TabHost
    this.vPath.unshift(this.args.v);
    const found = ViewFinder.findParent(this.args.v, (p) => {
      this.vPath.unshift(p);
      return TabHostTab.isTabHostTabs(p);
    });
    if (!found) {
      // clear the path
      this.vPath.splice(0, this.vPath.length);
    }
    return !!found;
  }

  apply(): SyntEvent {
    const pSeg = this.args.p.s;
    // vPath[0] is the direct parent of all tabs;
    const parent = this.vPath.shift();
    if (!parent) {
      throw new IllegalStateError(
        'Pattern apply failed, cannot find the direct parent of the tab'
      );
    }
    // extract their indices first, and change the
    // indices to make the path points to next tab
    const indices = this.vPath.map((v) => Views.indexOf(v));
    const currTab = indices[0];
    const sibTabs: DxView[] = [];
    for (let i = 0; i < parent.children.length; i++) {
      if (i == currTab) {
        continue;
      }
      const tab = ViewFinder.findViewByIndices(parent, [
        i,
        ...indices.slice(1),
      ]);
      if (tab) {
        sibTabs.push(tab);
      }
    }
    // find the available tabs in the playee segment
    // firstly try the text, and collect ones having
    // valid content descriptions
    let found: N<DxView> = null;
    const descViews: DxView[] = [];
    for (const v of sibTabs) {
      if (v.text.length > 0) {
        for (const r of pSeg.roots) {
          found = found || ViewFinder.findViewByText(r, v.text);
        }
      } else if (v.desc.length > 0) {
        descViews.push(v);
      }
      if (found) {
        break;
      }
    }
    // if no text are available, then try the desc
    if (!found) {
      for (const v of descViews) {
        for (const r of pSeg.roots) {
          found = found || ViewFinder.findViewByDesc(r, v.desc);
        }
        if (found) {
          break;
        }
      }
    }
    if (!found) {
      throw new NotImplementedError('View not found');
    }
    return new SyntEvent(
      new DxTapEvent(
        this.args.p.a,
        Views.x0(found) + 1,
        Views.y0(found) + 1,
        -1
      )
    );
  }
}

/** TabHostContent is the pattern for contents of a TabHost */
class TabHostContent extends Reveal {
  // tab contents are direct children of the a view
  // whose resource-id is android:id/tabcontent
  static isTabHostContent(v: DxView): boolean {
    return v.resId == 'android:id/tabcontent';
  }

  match(): boolean {
    // check whether v is in a TabHost
    const found = ViewFinder.findParent(
      this.args.v,
      TabHostContent.isTabHostContent
    );
    return !!found;
  }

  apply(): SyntEvent {
    throw new NotImplementedError('TabHostContent');
  }
}

/** A much robust heuristic for TabHost, for handling
 * cases where android:id/tabs does not exist
 */
class TabHost extends TabHostTab {
  // tabs are all children of TabHost
  static isTabHost(v: DxView): v is DxTabHost {
    return v instanceof DxTabHost;
  }

  match(): boolean {
    // TODO: what if v is a tab content, then how to
    // resolve the tab name where v resides? Maybe we
    // can do something when recording?

    // check whether v is in a TabHost
    this.vPath.unshift(this.args.v);
    const found = ViewFinder.findParent(this.args.v, (p) => {
      this.vPath.unshift(p);
      return TabHost.isTabHost(p);
    });
    if (!found) {
      // clear the path
      this.vPath.splice(0, this.vPath.length);
    }
    return !!found;
  }

  apply(): SyntEvent {
    // find all tabs in recordee
    if (this.vPath.length == 0) {
      throw new IllegalStateError("Pattern is not satisfied, don't apply");
    }
    // find the tab's direct parent, 'cause
    // sometimes the TabHost does not directly
    // host the tabs, but its children
    while (
      this.vPath.length > 0 &&
      this.goodChildren(this.vPath[0]).length == 1
    ) {
      this.vPath.shift();
    }
    return super.apply();
  }

  private goodChildren(v: DxView): DxView[] {
    return v.children.filter(
      (c) => Views.isValid(c) && Views.isViewHierarchyImportantForA11y(c)
    );
  }
}

/** ViewPager is the pattern for handling ViewPager */
class ViewPager extends Reveal {
  // pages are all children of ViewPager
  static isViewPager(v: DxView): v is DxViewPager {
    return v instanceof DxViewPager;
  }

  static findPagerParent(v: DxView): N<DxViewPager> {
    return ViewFinder.findParent(v, (p) => ViewPager.isViewPager(p)) as N<
      DxViewPager
    >;
  }

  // the page's parent pager in recordee
  private vRPager: N<DxViewPager> = null;
  // the page's parent pager in playee
  private vPPager: N<DxViewPager> = null;

  match(): boolean {
    this.vRPager = ViewPager.findPagerParent(this.args.v);
    if (!this.vRPager) {
      return false;
    }

    const pSeg = this.args.p.s;
    // look for all pagers in the playee segment
    const pagers: DxViewPager[] = [];
    for (const r of pSeg.roots) {
      if (this.vRPager.resId.length > 0) {
        pagers.push(
          ...(ViewFinder.find(
            r,
            (w) => w instanceof DxViewPager
          ) as DxViewPager[])
        );
        // the pager is maybe segmented to multiple
        // segments, and the pager itself does not belong
        // to any leaf segment, so find the parent of
        // each root, maybe there are pagers
        const parent = ViewPager.findPagerParent(r);
        if (parent) {
          pagers.push(parent);
        }
      }
    }
    if (pagers.length == 0) {
      return false;
    }
    // look for the specific pager that matched
    let index = -1;
    if (this.vRPager.resId.length > 0) {
      index = pagers.findIndex((p) => p.resId == this.vRPager?.resId);
    }
    if (index == -1 && this.vRPager.text.length > 0) {
      index = pagers.findIndex((p) => p.text == this.vRPager?.text);
    }
    if (index == -1 && this.vRPager.desc.length > 0) {
      index = pagers.findIndex((p) => p.desc == this.vRPager?.desc);
    }
    if (index == -1) {
      return false;
    }
    this.vPPager = pagers[index];
    return true;
  }

  apply(): SyntEvent {
    const v = this.args.v;
    if (!this.vRPager || !this.vPPager) {
      throw new IllegalStateError("Pattern is not satisfied, don't apply");
    }
    // TODO: instead of jump direct from this.vPPager.currItem
    // to this.vRPager.curr, we find the page that containing
    // v, and then jump to that
    let targetPage: N<DxView> = null;
    if (v.text.length > 0) {
      for (const page of this.vPPager.children) {
        if (ViewFinder.findViewByText(page, v.text)) {
          targetPage = page;
          break;
        }
      }
    }
    if (!targetPage && v.resId.length > 0) {
      for (const page of this.vPPager.children) {
        if (ViewFinder.findViewByResource(page, v.resType, v.resEntry)) {
          targetPage = page;
          break;
        }
      }
    }
    if (!targetPage && v.resId.length > 0) {
      for (const page of this.vPPager.children) {
        if (ViewFinder.findViewByDesc(page, v.desc)) {
          targetPage = page;
          break;
        }
      }
    }
    if (!targetPage) {
      throw new NotImplementedError('Page containing v does not found');
    }
    return new SyntEvent(
      new DxTapEvent(
        this.args.p.a,
        Views.x0(targetPage) + 1,
        Views.y0(targetPage) + 1,
        -1
      )
    );
  }
}

// The Pattern is sorted bottom-up, in order of
// [None, Reflow, Expand, Merge, Reveal, Transform]
const patterns = [
  // Expand
  Scroll,
  // Reveal
  MoreOptions,
  DrawerMenu,
  TabHostTab,
  TabHostContent,
  TabHost,
  ViewPager,
];

/** Recognize the pattern bottom-up from None to
 * Transform. This is an assume and check process, i.e.,
 * assume a pattern, and test the pattern condition.
 * Confirm the pattern and return if and only if the
 * condition passes, or test next pattern
 */
export default function recBpPat(args: BpPatRecArgs): N<DxBpPat> {
  for (const Pat of patterns) {
    const pat = new Pat(args);
    if (pat.match()) {
      return pat;
    }
  }
  return null;
}
