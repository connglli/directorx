import DxView, {
  DxTabHost,
  DxViewPager,
  DxActivity,
  Views,
  ViewFinder,
} from '../dxview.ts';
import { DxSegment } from './ui_seg.ts';
import DxEvent, { DxTapEvent } from '../dxevent.ts';
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

class Expand extends DxBpPat {
  level() {
    return 'expand';
  }

  match(): boolean {
    return (
      !!ViewFinder.findVScrollableParent(this.args.v) ||
      !!ViewFinder.findHScrollableParent(this.args.v)
    );
  }

  apply(): SyntEvent {
    throw new NotImplementedError();
  }
}

abstract class Reveal extends DxBpPat {
  level() {
    return 'reveal';
  }
}

/** MoreOption is the pattern for more options */
class MoreOptions extends Reveal {
  // All more options has a view whose desc is More options
  static DESC = 'More options';
  // the MoreOptions button
  private vMoreOptions: N<DxView> = null;

  match(): boolean {
    // check if there are MoreOptions button
    // buttons in the playee segment
    for (const r of this.args.p.s.roots) {
      const mo = ViewFinder.findViewByDesc(r, MoreOptions.DESC);
      if (mo != null) {
        this.vMoreOptions = mo;
        return true;
      }
    }
    return false;
  }

  apply(): SyntEvent {
    if (this.vMoreOptions == null) {
      throw new IllegalStateError("Pattern is not satisfied, don't apply");
    }
    // synthesize a tap event on the
    // more options button
    return new SyntEvent(
      new DxTapEvent(
        this.args.p.a,
        Views.x0(this.vMoreOptions) + 1,
        Views.y0(this.vMoreOptions) + 1,
        -1
      )
    );
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
          found = ViewFinder.findViewByText(r, v.text);
          if (found) {
            break;
          }
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
          found = ViewFinder.findViewByDesc(r, v.desc);
          if (found) {
            break;
          }
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
    const p = this.args.v.parent;
    while (p) {
      if (TabHostContent.isTabHostContent(p)) {
        return true;
      }
    }
    return false;
  }

  apply(): SyntEvent {
    throw new NotImplementedError();
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
  Expand,
  // Reveal
  MoreOptions,
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
