import DxView, {
  DxTabHost,
  DxViewPager,
  DxActivity,
  Views,
  ViewFinder,
} from '../dxview.ts';
import DxSegment, { SegmentFinder, SegmentBottomUpFinder } from '../dxseg.ts';
import DxDroid, { DevInfo } from '../dxdroid.ts';
import { NotImplementedError, IllegalStateError } from '../utils/error.ts';

type N<T> = T | null;

export interface PatRecArgs {}

export abstract class DxPat {
  constructor(protected readonly args: PatRecArgs) {}
  abstract get name(): string;
  abstract match(): boolean;
  abstract async apply(droid: DxDroid): Promise<void>;
}

export interface InvisiblePatRecArgs extends PatRecArgs {
  // view on playee
  v: DxView;
  // playee activity
  a: DxActivity;
  // playee device
  d: DevInfo;
}

/** Invisible pattern is used for those views which are
 * invisible but still presented on the view tree. Invisible
 * pattern assumes that the invisible button can be manifested
 * by actions on its visible parent, currently the actions
 * includes only the tap action. */
export class Invisible extends DxPat {
  // parent that are visible to user
  private vParent: N<DxView> = null;
  constructor(protected args: InvisiblePatRecArgs) {
    super(args);
  }

  get name(): string {
    return 'invisible';
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

  async apply(droid: DxDroid): Promise<void> {
    // TODO: what if the view is not triggered by
    // tapping its visible parent?
    if (this.vParent == null) {
      throw new IllegalStateError("Pattern is not satisfied, don't apply");
    }
    return await droid.input.tap(
      Views.x0(this.vParent) + 1,
      Views.y0(this.vParent) + 1
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
    d: DevInfo;
  };
  // the playee
  p: {
    s: DxSegment;
    a: DxActivity;
    d: DevInfo;
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

  abstract get level(): string;
}

abstract class Expand extends DxBpPat {
  get level() {
    return 'expand';
  }
}

type ScrollDir = 'R2L' | 'L2R' | 'T2B' | 'B2T' | 'N';

/** Scroll is the pattern that handles scrollable parent.
 * Scroll assumes that the view to be triggered resides in
 * a scrollable parent. And thus this pattern finds the view
 * by scrolling the parent until the view shows. */
class Scroll extends Expand {
  private vHSParent: N<DxView> = null;
  private vVSParent: N<DxView> = null;

  get name(): string {
    return 'scroll';
  }

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

  async apply(droid: DxDroid): Promise<void> {
    if (this.vHSParent == null && this.vVSParent == null) {
      throw new IllegalStateError("Pattern is not satisfied, don't apply");
    } else if (this.vHSParent != null && this.vVSParent != null) {
      if (this.vVSParent == this.vHSParent) {
        throw new IllegalStateError(
          'Both horizontally and vertically scrollable (same parent)'
        );
      } else {
        throw new IllegalStateError(
          'Both horizontally and vertically scrollable (different parents)'
        );
      }
    } else if (this.vHSParent != null) {
      let iteration = 1;
      let lastDir: ScrollDir = 'N';
      // scroll to find the target view
      do {
        const canL2R = Views.canL2RScroll(this.vHSParent);
        const canR2L = Views.canR2LScroll(this.vHSParent);
        let currDir: ScrollDir = canR2L ? 'R2L' : canL2R ? 'L2R' : 'N';
        if (lastDir == 'L2R' && canL2R) {
          currDir = 'L2R';
        } else if (lastDir == 'R2L' && canR2L) {
          currDir = 'R2L';
        }
        switch (currDir) {
          case 'L2R':
            await droid.input.swipe(
              Views.xCenter(this.vHSParent),
              Views.yCenter(this.vHSParent),
              Views.xCenter(this.vHSParent),
              0,
              300
            );
            break;
          case 'R2L':
            await droid.input.swipe(
              Views.xCenter(this.vHSParent),
              Views.yCenter(this.vHSParent),
              -Views.xCenter(this.vHSParent),
              0,
              300
            );
            break;
          default:
            throw new IllegalStateError(
              "Pattern is not satisfied, don't apply"
            );
        }
        if (lastDir != 'N' && lastDir != currDir) {
          iteration += 1;
        }
        lastDir = currDir;
      } while (
        iteration < 3 &&
        (await droid.input.select(this.args.v)).length == 0
      );
      if (iteration == 3) {
        throw new NotImplementedError('No views found in the list');
      }
    } else if (this.vVSParent != null) {
      let iteration = 1;
      let lastDir: ScrollDir = 'N';
      // scroll to find the target view
      do {
        const canT2B = Views.canT2BScroll(this.vVSParent);
        const canB2T = Views.canB2TScroll(this.vVSParent);
        let currDir: ScrollDir = canB2T ? 'B2T' : canT2B ? 'T2B' : 'N';
        // prefer to scroll at the same direction
        if (lastDir == 'T2B' && canT2B) {
          currDir = 'T2B';
        } else if (lastDir == 'B2T' && canB2T) {
          currDir = 'B2T';
        }
        switch (currDir) {
          case 'T2B':
            await droid.input.swipe(
              Views.xCenter(this.vVSParent),
              Views.yCenter(this.vVSParent),
              0,
              Views.yCenter(this.vVSParent),
              300
            );
            break;
          case 'B2T':
            await droid.input.swipe(
              Views.xCenter(this.vVSParent),
              Views.yCenter(this.vVSParent),
              0,
              -Views.yCenter(this.vVSParent),
              300
            );
            break;
          default:
            throw new IllegalStateError(
              "Pattern is not satisfied, don't apply"
            );
        }
        if (lastDir != 'N' && lastDir != currDir) {
          iteration += 1;
        }
        lastDir = currDir;
      } while (
        iteration < 3 &&
        (await droid.input.select(this.args.v)).length == 0
      );
      if (iteration == 3) {
        throw new NotImplementedError('No views found in the list');
      }
    }
  }

  /** Try to find the scrollable target bottom-up in playee */
  private findTarget(v: DxView): N<DxView> {
    let found: N<DxView> = null;
    const playee = this.args.p;
    const fns = [
      // TODO: change to only find parents, no siblings
      [v.text.length > 0, SegmentBottomUpFinder.findViewByText, v.text],
      [
        v.resId.length > 0,
        SegmentBottomUpFinder.findViewByResource,
        v.resType,
        v.resEntry,
      ],
      [v.desc.length > 0, SegmentBottomUpFinder.findViewByDesc, v.desc],
    ];
    for (const [test, fn, ...args] of fns) {
      if (!found && test) {
        found = (fn as Function)(playee.s, ...args);
      }
    }
    return found;
  }
}

abstract class Reveal extends DxBpPat {
  get level() {
    return 'reveal';
  }
}

/** RevealButton is the pattern for some special reveal buttons.
 * This pattern assumes that these special buttons locates at the
 * matched playee pattern. And these special buttons are responsible
 * for showing/hiding some advanced buttons. Thus, this pattern finds
 * the triggered view by tap these buttons. These buttons are collected
 * from the official Android Documents, especially from many specific
 * official widgets. */
abstract class RevealButton extends Reveal {
  // the specific button that triggers a specific functionality
  protected vButton: N<DxView> = null;

  match(): boolean {
    // check if there are special button
    // buttons in the playee segment
    const playee = this.args.p;
    for (const r of playee.s.roots) {
      const btn = this.findButton(r);
      if (btn != null) {
        this.vButton = btn;
        return true;
      }
    }
    return false;
  }

  async apply(droid: DxDroid): Promise<void> {
    if (this.vButton == null) {
      throw new IllegalStateError("Pattern is not satisfied, don't apply");
    }
    // synthesize a tap event on the
    // more options button
    return await droid.input.tap(
      Views.x0(this.vButton) + 1,
      Views.y0(this.vButton) + 1
    );
  }

  /** Find the special buttons in the given view of playee */
  abstract findButton(v: DxView): N<DxView>;
}

/** MoreOption is the pattern for more options button (often
 * located at the top-right, or end of a container, and responsible
 * for hiding/showing some advanced operations). */
class MoreOptions extends RevealButton {
  static DESC = 'More options';

  get name(): string {
    return 'more-options';
  }

  findButton(v: DxView): N<DxView> {
    return ViewFinder.findViewByDesc(v, MoreOptions.DESC);
  }
}

/** DrawerMenu is the pattern for drawer button (often located
 * at the top-left corner, and responsible for showing/hiding
 * the drawer). */
class DrawerMenu extends RevealButton {
  static DESC = 'Open navigation drawer';

  get name(): string {
    return 'drawer-menu';
  }

  findButton(v: DxView): N<DxView> {
    return ViewFinder.findViewByDesc(v, DrawerMenu.DESC);
  }
}

/** TabHostTab is the pattern for tabs of a TabHost. TabHost
 * assumes that all tabs of a TabHost are placed either together
 * or hided by some tabs, and one can find the target tab by
 * finding the tab on the view, or firstly find its sibling
 * tab then check if there are siblings show. */
class TabHostTab extends Reveal {
  // tabs are direct children of the a view
  // whose resource-id is android:id/tabs
  static isTabHostTabs(v: DxView): boolean {
    return v.resId == 'android:id/tabs';
  }

  // the path from the view to the tab's parent
  protected vPath: DxView[] = [];

  get name() {
    return 'tab-host-tab';
  }

  match(): boolean {
    this.vPath.unshift(this.args.v);
    // find the TabHost tabs parent
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

  async apply(droid: DxDroid): Promise<void> {
    const playee = this.args.p;
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
      // we assume each tab has a text indicator
      if (tab && tab.text.length > 0) {
        sibTabs.push(tab);
      }
    }
    // find the available tabs in the playee segment
    // firstly try the text, and collect ones having
    // valid content descriptions
    const found: N<DxView> = TabHostTab.findTab(sibTabs, playee.s);
    if (!found) {
      throw new NotImplementedError('View not found');
    }
    // tap found to reveal maybe the tab list
    await droid.input.tap(Views.x0(found) + 1, Views.y0(found) + 1);
  }

  /** Try to find an available one in the playee segment (if not found,
   * bottom-up find an available one in its siblings and parents) */
  public static findTab(tabs: DxView[], seg: DxSegment): N<DxView> {
    let found: N<DxView> = null;
    for (const v of tabs) {
      found = SegmentBottomUpFinder.findViewByText(seg, v.text);
      if (found) {
        break;
      }
    }
    return found;
  }
}

/** TabHostContent is the pattern for contents of a TabHost. Like
 * TabHost, TabHostContent will find the corresponding tab of the view
 * to be triggered. The assumes and applies like what TabHostTab does. */
class TabHostContent extends Reveal {
  // tab contents are direct children of the a view
  // whose resource-id is android:id/tabcontent
  static isTabHostContent(v: DxView): boolean {
    return (
      v.resId == 'android:id/tabcontent' ||
      v.resEntry.toLocaleLowerCase().includes('tabcontent')
    );
  }

  private vTabContent: N<DxView> = null;

  get name() {
    return 'tab-host-content';
  }

  match(): boolean {
    // check whether v is in a TabHostContent
    this.vTabContent = ViewFinder.findParent(
      this.args.v,
      TabHostContent.isTabHostContent
    );
    return !!this.vTabContent;
  }

  async apply(droid: DxDroid): Promise<void> {
    if (!this.vTabContent) {
      throw new IllegalStateError("Pattern is not satisfied, don't apply");
    }
    const recordee = this.args.r;
    const playee = this.args.p;
    // find all available tab hosts on recordee
    let tabHosts = recordee.a.findViews(
      (v) => TabHostTab.isTabHostTabs(v) && Views.isVisibleToUser(v, recordee.d)
    );
    if (tabHosts.length == 0) {
      tabHosts = recordee.a.findViews(
        (v) => TabHost.isTabHost(v) && Views.isVisibleToUser(v, recordee.d)
      );
      // remove all other views and return the
      // direct parent of all tabs
      tabHosts = tabHosts.map((tab) => {
        let child = tab;
        let goodChildren: DxView[] = [];
        do {
          goodChildren = TabHost.goodChildren(child);
          if (goodChildren.length != 1) {
            return child;
          }
          child = goodChildren[0];
        } while (true);
      });
    }
    // filter out those has no visible children
    tabHosts = tabHosts.filter(
      (t) =>
        Views.hasValidChild(t) &&
        t.children.filter((c) => !c.shown).length != t.children.length
    );
    if (tabHosts.length == 0) {
      throw new NotImplementedError('No TabHosts found');
    } else if (tabHosts.length != 1) {
      throw new NotImplementedError('Multiple TabHosts found');
    }
    const parent = tabHosts[0];
    // find the selected tab on recordee
    let currTabContainer = parent.children.find((c) => c.flags.S);
    if (!currTabContainer) {
      throw new NotImplementedError('No selected tab');
    }
    // try to find the selected firstly
    let tabContainers = [currTabContainer, ...currTabContainer.siblings];
    let tabs: DxView[] = [];
    tabContainers.forEach((t) => {
      // TODO: what if the tab has no text?
      let found = ViewFinder.findView(t, (v) => Views.isText(v));
      if (found) {
        tabs.push(found);
      }
    });
    if (tabs.length == 0) {
      throw new NotImplementedError('No tabs (having TextView) found');
    }
    const selectedTab = tabs[0];
    // check whether there are tabs on playee
    let found: N<DxView> = TabHostTab.findTab(tabs, playee.s);
    if (!found) {
      throw new NotImplementedError('No tabs are found');
    }
    // jump to the tab
    await droid.input.tap(Views.x0(found) + 1, Views.y0(found) + 1);
    // in case tapped tab is not the selected
    if (found.text != selectedTab.text) {
      const vms = await droid.input.select({
        textContains: selectedTab.text,
      });
      if (vms.length == 0) {
        throw new NotImplementedError('Selected tab not found');
      }
      await droid.input.tap(vms[0].bounds.left + 1, vms[0].bounds.top + 1);
    }
  }
}

/** Custom TabHost may override the default tabs and tabcontent.
 * TabHost is a much robust heuristic  for handling such cases */
class TabHost extends TabHostTab {
  // tabs are all children of TabHost
  static isTabHost(v: DxView): v is DxTabHost {
    return v instanceof DxTabHost;
  }

  get name() {
    return 'tab-host';
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

  async apply(droid: DxDroid): Promise<void> {
    // find all tabs in recordee
    if (this.vPath.length == 0) {
      throw new IllegalStateError("Pattern is not satisfied, don't apply");
    }
    // find the tab's direct parent, 'cause
    // sometimes the TabHost does not directly
    // host the tabs, but its children
    while (
      this.vPath.length > 0 &&
      TabHost.goodChildren(this.vPath[0]).length == 1
    ) {
      this.vPath.shift();
    }
    return await super.apply(droid);
  }

  static goodChildren(v: DxView): DxView[] {
    return v.children.filter(
      (c) => Views.isValid(c) && Views.isViewHierarchyImportantForA11y(c)
    );
  }
}

/** DoubleSideViewPager is the pattern for handling ViewPager
 * that both exists in recordee and playee. This pattern assumes
 * that the view to be triggered is hided by its ViewPager parent,
 * and can be manifested by this parent. */
class DoubleSideViewPager extends Reveal {
  // pages are all children of ViewPager
  static isViewPager(v: DxView): v is DxViewPager {
    return v instanceof DxViewPager;
  }

  static findPagerParent(v: DxView): N<DxViewPager> {
    return ViewFinder.findParent(v, (p) =>
      DoubleSideViewPager.isViewPager(p)
    ) as N<DxViewPager>;
  }

  // the page's parent pager in recordee
  private vRPager: N<DxViewPager> = null;
  // the page's parent pager in playee
  private vPPager: N<DxViewPager> = null;

  get name() {
    return 'double-side-view-pager';
  }

  match(): boolean {
    this.vRPager = DoubleSideViewPager.findPagerParent(this.args.v);
    if (!this.vRPager) {
      return false;
    }

    const playee = this.args.p;
    // look for all pagers in the playee segment
    const pagers: DxViewPager[] = [];
    if (this.vRPager.resId.length > 0) {
      pagers.push(
        ...(SegmentFinder.findViews(
          playee.s,
          (v) => v instanceof DxViewPager
        ) as DxViewPager[])
      );
    }
    if (pagers.length == 0) {
      // the pager is maybe segmented to multiple
      // segments, and the pager itself does not belong
      // to any leaf segment, so find the parent of
      // each root, maybe there are pagers
      for (const r of playee.s.roots) {
        const parent = DoubleSideViewPager.findPagerParent(r);
        if (parent) {
          pagers.push(parent);
        }
      }
    }
    if (pagers.length == 0) {
      return false;
    }
    // look for the specific pager that matched
    let pager: DxViewPager | undefined = undefined;
    if (this.vRPager.text.length > 0) {
      pager = pagers.find((p) => p.text == this.vRPager?.text);
    }
    if (!pager && this.vRPager.resId.length > 0) {
      pager = pagers.find((p) => p.resId == this.vRPager?.resId);
    }
    if (!pager && this.vRPager.desc.length > 0) {
      pager = pagers.find((p) => p.desc == this.vRPager?.desc);
    }
    if (!pager) {
      return false;
    }
    this.vPPager = pager;
    return true;
  }

  async apply(droid: DxDroid): Promise<void> {
    const v = this.args.v;
    if (!this.vRPager || !this.vPPager) {
      throw new IllegalStateError("Pattern is not satisfied, don't apply");
    }
    // TODO: instead of jump direct from this.vPPager.currItem
    // to this.vRPager.curr, we find the page that containing
    // v, and then jump to that
    let targetPage: N<DxView> = null;
    const fns = [
      [v.text.length > 0, ViewFinder.findViewByText, v.text],
      [
        v.resId.length > 0,
        ViewFinder.findViewByResource,
        v.resType,
        v.resEntry,
      ],
      [v.desc.length > 0, ViewFinder.findViewByDesc, v.desc],
    ];
    for (const [test, fn, ...args] of fns) {
      if (!targetPage && test) {
        for (const page of this.vPPager.children) {
          targetPage = targetPage || (fn as Function)(page, ...args);
        }
      }
    }
    if (!targetPage) {
      throw new NotImplementedError('Page containing v does not found');
    }
    return await droid.input.tap(
      Views.x0(targetPage) + 1,
      Views.y0(targetPage) + 1
    );
  }
}

/** Different from DoubleSideViewPager, SingleSideViewPager is the
 * pattern for handling ViewPager that only shows in playee side.
 * Same as DoubleSideViewPager, this pattern also manifests the views
 * by operating its parents. */
class SingleSideViewPager extends Reveal {
  // the pager in playee side
  private vPager: N<DxViewPager> = null;

  get name() {
    return 'single-side-view-pager';
  }

  match(): boolean {
    const playee = this.args.p;
    this.vPager = SegmentBottomUpFinder.findView(
      playee.s,
      DoubleSideViewPager.isViewPager
    ) as N<DxViewPager>;
    return !!this.vPager;
  }

  async apply(droid: DxDroid): Promise<void> {
    if (!this.vPager) {
      throw new IllegalStateError("Pattern is not satisfied, don't apply");
    }
    // test from the first page, to the last page,
    // until the target view shown
    for (const page of this.vPager.children) {
      await droid.input.tap(Views.x0(page) + 1, Views.y0(page) + 1);
      if ((await droid.input.select(this.args.v)).length != 0) {
        return;
      }
    }
    throw new NotImplementedError('No page contains the target view');
  }
}

abstract class Merge extends DxBpPat {
  get level() {
    return 'merge';
  }
}

/** MergeButton is those buttons that can show a merge page. MergeButton
 * differs from RevealButton in that, it does not assume the special button
 * resides in the matched playee segment, but assumes that the special button
 * locates at the neighborhood of the playee segment. And thereby, MergeButton
 * finds the special button bottom-up from the matched playee segment to its
 * sibling, then its parent, then its parent's sibling, ...
 */
abstract class MergeButton extends Merge {
  private vButton: N<DxView> = null;

  match(): boolean {
    const playee = this.args.p;
    this.vButton = SegmentBottomUpFinder.findView(playee.s, this.isMergeButton);
    return !!this.vButton;
  }

  async apply(droid: DxDroid) {
    if (this.vButton == null) {
      throw new IllegalStateError("Pattern is not satisfied, don't apply");
    }
    // synthesize a tap event on the
    // more options button
    return await droid.input.tap(
      Views.x0(this.vButton) + 1,
      Views.y0(this.vButton) + 1
    );
  }

  protected abstract isMergeButton(v: DxView): boolean;
}

/** NewButton is those buttons that can are typically used to
 * create/add something new, e.g., create a new thing */
class NewButton extends MergeButton {
  private static WORDS = ['New', 'Create', 'Add'];

  get name() {
    return 'new-button';
  }

  protected isMergeButton(v: DxView) {
    for (const w of NewButton.WORDS) {
      if (v.text.startsWith(w)) {
        return true;
      }
    }
    for (const w of NewButton.WORDS) {
      if (v.desc.startsWith(w)) {
        return true;
      }
    }
    return false;
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
  DoubleSideViewPager,
  SingleSideViewPager,
  // Merge
  NewButton,
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
