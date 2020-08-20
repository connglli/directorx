import DxEvent, { DxSwipeEvent } from '../dxevent.ts';
import DxView, {
  DxTabHost,
  DxViewPager,
  Views,
  ViewFinder,
  DxRecyclerView,
  DxListView,
} from '../ui/dxview.ts';
import DxCompatUi, { DxFragment, Fragments } from '../ui/dxui.ts';
import DxSegment, {
  SegmentFinder,
  SegmentBottomUpFinder,
} from '../ui/dxseg.ts';
import { DevInfo, DroidInput } from '../dxdroid.ts';
import adaptSel from './ada_sel.ts';
import {
  NotImplementedError,
  IllegalStateError,
  CannotReachHereError,
} from '../utils/error.ts';
import { splitAsWords, wordsInclude } from '../utils/strutil.ts';
import { BoWModel, closest, similarity } from '../utils/vecutil.ts';

type N<T> = T | null;

export interface PatRecArgs {
  // the original fired event
  e: DxEvent;
}

export abstract class DxPat {
  // when set to true, it means that this pattern has
  // produced some side effects to the app, and one is
  // expected to try to dismiss such side effects before
  // any following work, or stop executing directly
  private dirty_ = false;
  constructor(protected readonly args: PatRecArgs) {}
  /** Pattern name */
  abstract get name(): string;
  /** Whether current circumstance match this pattern */
  abstract match(): boolean;
  /** Apply the pattern and return whether the original event is consumed */
  abstract async apply(input: DroidInput): Promise<boolean>;
  /** Return whether this pattern has produced some side effects */
  get dirty() {
    return this.dirty_;
  }
  /** Dismiss the side effects, returning whether the side
   * effects is dismissed or not, currently not supported */
  dismiss() {
    return false;
  }
  protected setDirty() {
    this.dirty_ = true;
  }
  protected clearDirty() {
    this.dirty_ = false;
  }
}

export interface InvisiblePatRecArgs extends PatRecArgs {
  // view on playee
  v: DxView;
  // playee ui
  u: DxCompatUi;
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
    const { v: view, u: act, d: dev } = this.args;
    this.vParent = ViewFinder.findParent(
      view,
      (p) => Views.isViewImportantForA11y(p) && Views.isVisibleToUser(p, dev)
    );
    return !!this.vParent;
  }

  async apply(input: DroidInput): Promise<boolean> {
    // TODO: what if the view is not triggered by
    // tapping its visible parent?
    if (this.vParent == null) {
      throw new IllegalStateError("Pattern is not satisfied, don't apply");
    }
    await input.tap(Views.x0(this.vParent) + 1, Views.y0(this.vParent) + 1);
    this.setDirty();
    return false;
  }
}

export interface BpPatRecArgs extends PatRecArgs {
  // view on recordee
  v: DxView;
  // the recordee
  r: {
    s: DxSegment;
    u: DxCompatUi;
    d: DevInfo;
  };
  // the playee
  p: {
    s: DxSegment;
    u: DxCompatUi;
    d: DevInfo;
  };
}

/** Bottom-up patterns that our pattern recognition
 * algorithm used. The level denotes the level the
 * pattern resides. */
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

/** When a view is resized, it's text is maybe expanded
 * to become longer, or shrink to be shorter. VagueText
 * takes care of such pattern by finding a most probable
 * view that are text-similar */
class VagueText extends Expand {
  // founded views that are text-similar to target view
  protected vFound: DxView[] = [];

  get name() {
    return 'vague-text';
  }

  match(): boolean {
    const v = this.args.v;
    if (v.text.length == 0) {
      return false;
    }
    const player = this.args.p;
    const expand = this.isDevExpanded;
    // currently, we only tackle prefix
    // TODO: add more vague patterns
    this.vFound = SegmentFinder.findViews(
      player.s,
      (w) =>
        Views.isVisibleToUser(w, player.d) &&
        w.text.length > 0 &&
        ((expand && w.text.startsWith(v.text)) ||
          (!expand && v.text.startsWith(w.text)))
    );
    return this.vFound.length > 0;
  }

  async apply(input: DroidInput): Promise<boolean> {
    if (this.vFound.length <= 0) {
      throw new IllegalStateError("Pattern is not satisfied, don't apply");
    }
    const expand = this.isDevExpanded;
    // let's sort the founded view by their distance
    this.vFound.sort((a, b) => Math.abs(a.text.length - b.text.length));
    const matched = expand
      ? this.vFound[0]
      : this.vFound[this.vFound.length - 1];
    if (!matched) {
      throw new IllegalStateError('vFound is empty');
    }
    switch (this.args.e.ty) {
      case 'tap':
        await input.tap(Views.x0(matched) + 1, Views.y0(matched) + 1);
        break;
      case 'double-tap':
        await input.doubleTap(Views.x0(matched) + 1, Views.y0(matched) + 1);
        break;
      case 'long-tap':
        await input.longTap(Views.x0(matched) + 1, Views.y0(matched) + 1);
        break;
      case 'swipe': {
        const { dx, dy, t0, t1 } = this.args.e as DxSwipeEvent;
        const duration = t1 - t0;
        const rDev = this.args.r.d;
        const pDev = this.args.p.d;
        const fromX = dx >= 0 ? Views.x0(matched) + 1 : Views.x1(matched) - 1;
        const fromY = dy >= 0 ? Views.y0(matched) + 1 : Views.y1(matched) - 1;
        const realDx = (dx / rDev.width) * pDev.width;
        const realDy = (dy / rDev.height) * pDev.height;
        await input.swipe(fromX, fromY, realDx, realDy, duration);
        break;
      }
      default:
        throw new CannotReachHereError();
    }
    this.setDirty();
    return true;
  }

  protected get isDevExpanded() {
    return this.args.r.d.width <= this.args.p.d.width;
  }
}

/** VagueTextExt differs from VagueText that it finds the
 * view bottom-up along the segment tree */
class VagueTextExt extends VagueText {
  get name() {
    return 'vague-text-ext';
  }

  match(): boolean {
    const v = this.args.v;
    if (v.text.length == 0) {
      return false;
    }
    const player = this.args.p;
    const expand = this.isDevExpanded;
    // currently, we only tackle prefix
    // TODO: add more vague patterns
    let found = SegmentBottomUpFinder.findView(
      player.s,
      (w) =>
        Views.isVisibleToUser(w, player.d) &&
        w.text.length > 0 &&
        ((expand && w.text.startsWith(v.text)) ||
          (!expand && v.text.startsWith(w.text)))
    );
    if (found) {
      this.vFound.push(found);
    }
    return this.vFound.length > 0;
  }
}

/** VagueTextDesc handles those views that hide their text
 * on some devices behind content-desc, but show their text
 * on other devices */
class VagueTextDesc extends VagueText {
  get name() {
    return 'vague-text-desc';
  }

  match() {
    const v = this.args.v;
    const playee = this.args.p;
    let text: string;
    let prop: 'text' | 'desc';
    if (v.text.length <= 0 && v.desc.length <= 0) {
      return false;
    }
    if (v.text.length > 0) {
      text = v.text;
      prop = 'desc';
    } else {
      text = v.desc;
      prop = 'text';
    }
    this.vFound = playee.u.findViews(
      (w) =>
        Views.isVisibleToUser(w, playee.d) &&
        w[prop].length > 0 &&
        (wordsInclude(w[prop], text) || wordsInclude(text, w[prop]))
    );
    // text has only 1 word, then take care
    if (splitAsWords(text).length == 1) {
      this.vFound = this.vFound.filter((w) =>
        splitAsWords(w[prop]).includes(text)
      );
    }
    if (this.vFound.length == 0) {
      return false;
    }
    // let's choose the BoW most similar
    const corpus = [
      [text, v.resId].join(' '),
      ...this.vFound.map((w) => [w[prop], w.resEntry].join(' ')),
    ];
    const model = new BoWModel(corpus);
    const vectors = model.vectors.map((v) => v.vector);
    const index = closest(vectors[0], vectors.slice(1), similarity.cosine);
    this.vFound = [this.vFound[index]];
    return true;
  }
}

type ScrollDir = 'R2L' | 'L2R' | 'T2B' | 'B2T' | 'N';

/** Scroll is the pattern that handles scrollable parent.
 * Scroll assumes that the view to be triggered resides in
 * a scrollable parent. And thus this pattern finds the view
 * by scrolling the parent until the view shows. */
class Scroll extends Expand {
  private static DEFAULT_SCROLL_TIME = 500;

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

  async apply(input: DroidInput): Promise<boolean> {
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
            await input.swipe(
              Views.xCenter(this.vHSParent),
              Views.yCenter(this.vHSParent),
              Views.xCenter(this.vHSParent),
              0,
              Scroll.DEFAULT_SCROLL_TIME
            );
            break;
          case 'R2L':
            await input.swipe(
              Views.xCenter(this.vHSParent),
              Views.yCenter(this.vHSParent),
              -Views.xCenter(this.vHSParent),
              0,
              Scroll.DEFAULT_SCROLL_TIME
            );
            break;
          default:
            throw new IllegalStateError(
              "Pattern is not satisfied, don't apply"
            );
        }
        this.setDirty();
        if (lastDir != 'N' && lastDir != currDir) {
          iteration += 1;
        }
        lastDir = currDir;
      } while (iteration < 3 && (await adaptSel(input, this.args.v)) == null);
      if (iteration == 3) {
        throw new NotImplementedError('No views found in the list');
      }
      return false;
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
            await input.swipe(
              Views.xCenter(this.vVSParent),
              Views.yCenter(this.vVSParent),
              0,
              Views.yCenter(this.vVSParent),
              Scroll.DEFAULT_SCROLL_TIME
            );
            break;
          case 'B2T':
            await input.swipe(
              Views.xCenter(this.vVSParent),
              Views.yCenter(this.vVSParent),
              0,
              -Views.yCenter(this.vVSParent),
              Scroll.DEFAULT_SCROLL_TIME
            );
            break;
          default:
            throw new IllegalStateError(
              "Pattern is not satisfied, don't apply"
            );
        }
        this.setDirty();
        if (lastDir != 'N' && lastDir != currDir) {
          iteration += 1;
        }
        lastDir = currDir;
      } while (iteration < 3 && (await adaptSel(input, this.args.v)) == null);
      if (iteration == 3) {
        throw new NotImplementedError('No views found in the list');
      }
      return false;
    } else {
      throw new CannotReachHereError();
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

  async apply(input: DroidInput): Promise<boolean> {
    if (this.vButton == null) {
      throw new IllegalStateError("Pattern is not satisfied, don't apply");
    }
    // synthesize a tap event on the
    // more options button
    await input.tap(Views.x0(this.vButton) + 1, Views.y0(this.vButton) + 1);
    this.setDirty();
    return false;
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
    const moreOptions = ViewFinder.findViewByDesc(v, MoreOptions.DESC);
    return moreOptions &&
      Views.isVisibleToUser(moreOptions, this.args.p.d) &&
      moreOptions.flags.c
      ? moreOptions
      : null;
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
    const drawerMenu = ViewFinder.findViewByDesc(v, DrawerMenu.DESC);
    return drawerMenu &&
      Views.isVisibleToUser(drawerMenu, this.args.p.d) &&
      drawerMenu.flags.c
      ? drawerMenu
      : null;
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

  async apply(input: DroidInput): Promise<boolean> {
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
    await input.tap(Views.x0(found) + 1, Views.y0(found) + 1);
    this.setDirty();
    return false;
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

  async apply(input: DroidInput): Promise<boolean> {
    if (!this.vTabContent) {
      throw new IllegalStateError("Pattern is not satisfied, don't apply");
    }
    const recordee = this.args.r;
    const playee = this.args.p;
    // find all available tab hosts on recordee
    let tabHosts = recordee.u.findViews(
      (v) => TabHostTab.isTabHostTabs(v) && Views.isVisibleToUser(v, recordee.d)
    );
    if (tabHosts.length == 0) {
      tabHosts = recordee.u.findViews(
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
    await input.tap(Views.x0(found) + 1, Views.y0(found) + 1);
    this.setDirty();
    // in case tapped tab is not the selected
    if (found.text != selectedTab.text) {
      const vms = await input.select({
        textContains: selectedTab.text,
      });
      if (vms.length == 0) {
        throw new NotImplementedError('Selected tab not found');
      }
      await input.tap(vms[0].bounds.left + 1, vms[0].bounds.top + 1);
    }
    return false;
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

  async apply(input: DroidInput): Promise<boolean> {
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
    return await super.apply(input);
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

  async apply(input: DroidInput): Promise<boolean> {
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
    await input.tap(Views.x0(targetPage) + 1, Views.y0(targetPage) + 1);
    this.setDirty();
    return false;
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
    const pager = SegmentBottomUpFinder.findView(
      playee.s,
      DoubleSideViewPager.isViewPager
    ) as N<DxViewPager>;
    let found = false;
    if (pager) {
      const v = this.args.v;
      if (v.text.length > 0) {
        found = !!playee.u.findViewByText(v.text);
      } else if (v.resId.length > 0) {
        found = !!playee.u.findViewByResource(v.resType, v.resEntry);
      } else if (v.desc.length > 0) {
        found = !!playee.u.findViewByDesc(v.desc);
      }
    }
    if (found) {
      this.vPager = pager;
    }
    return found;
  }

  async apply(input: DroidInput): Promise<boolean> {
    if (!this.vPager) {
      throw new IllegalStateError("Pattern is not satisfied, don't apply");
    }
    // test from the first page, to the last page,
    // until the target view shown
    for (const page of this.vPager.children) {
      await input.tap(Views.x0(page) + 1, Views.y0(page) + 1);
      this.setDirty();
      if ((await adaptSel(input, this.args.v)) != null) {
        return false;
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
    this.vButton = SegmentBottomUpFinder.findView(
      playee.s,
      (v) =>
        Views.isVisibleToUser(v, playee.d) && v.flags.c && this.isMergeButton(v)
    );
    return !!this.vButton;
  }

  async apply(input: DroidInput): Promise<boolean> {
    if (this.vButton == null) {
      throw new IllegalStateError("Pattern is not satisfied, don't apply");
    }
    // synthesize a tap event on the more options button
    await input.tap(Views.x0(this.vButton) + 1, Views.y0(this.vButton) + 1);
    this.setDirty();
    return false;
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

/** DualFragment is a merge pattern that handles the merge
 * which has two fragments, one for descriptive preview, and
 * another for detailed view. DualFragment assumes that
 * there exists a *selected* descriptive preview, and it is
 * this view that makes the detailed preview shown. */
abstract class DualFragment extends Merge {
  /** Check whether a fragment is maybe a descriptive preview. A
   * descriptive preview has a visible list children, where one
   * of its visible children is in selected state */
  static isDescriptivePreview(f: DxFragment, a: DxCompatUi, d: DevInfo) {
    if (!f.viewId) {
      return false;
    }
    const v = a.findViewById(f.viewId);
    if (!v || !Views.isValid(v) || !Views.isVisibleToUser(v, d)) {
      return false;
    }
    const l = ViewFinder.findView(
      v,
      (w) =>
        (w instanceof DxListView || w instanceof DxRecyclerView) &&
        Views.isVisibleToUser(w, d)
    );
    if (!l) {
      return false;
    }
    return !!l.children.find((w) => w.flags.S && Views.isVisibleToUser(w, d));
  }

  /** Find the fragment that view resides in */
  static findFragmentByView(v: DxView, u: DxCompatUi) {
    return u.fragmentManager.findFragment((f) => {
      if (!f.viewId) {
        return false;
      }
      const fragView = u.findViewById(f.viewId);
      if (fragView && (fragView == v || Views.isChild(v, fragView))) {
        return true;
      }
      return false;
    });
  }
}

/** DualFragmentGotoDescriptive handles dual fragment that an action
 * is triggered at the descriptive preview, and we are currently at
 * the detailed view, what we need to do is directly press back to
 * pop the current fragment */
class DualFragmentGotoDescriptive extends DualFragment {
  get name() {
    return 'dual-fragment-goto-descriptive-preview';
  }

  match(): boolean {
    const v = this.args.v;
    const recordee = this.args.r;
    const fr = DualFragment.findFragmentByView(v, recordee.u);
    return (
      !!fr && DualFragment.isDescriptivePreview(fr, recordee.u, recordee.d)
    );
  }

  async apply(input: DroidInput): Promise<boolean> {
    await input.pressBack();
    this.setDirty();
    return false;
  }
}

/** DualFragmentGotoDetailed handles dual fragment that an action
 * is triggered at the detailed view, and we are currently at the
 * descriptive preview, we need to firstly parse and get the selected
 * item in the descriptive preview, and the goto the detailed view
 * by tappingthe selected item */
class DualFragmentGotoDetailed extends DualFragment {
  // the detailed view fragment in playee
  private vDetFrag: N<DxFragment> = null;

  get name() {
    return 'dual-fragment-goto-detailed-view';
  }

  match(): boolean {
    const recordee = this.args.r;
    const v = this.args.v;
    this.vDetFrag = recordee.u.fragmentManager.findFragment((f) => {
      if (!f.active || !f.viewId || !Fragments.isValid(f, recordee.u)) {
        return false;
      }
      const fragView = recordee.u.findViewById(f.viewId);
      if (fragView && (fragView == v || Views.isChild(v, fragView))) {
        return true;
      }
      return false;
    });
    if (
      !this.vDetFrag ||
      DualFragment.isDescriptivePreview(this.vDetFrag, recordee.u, recordee.d)
    ) {
      this.vDetFrag = null;
    }
    return !!this.vDetFrag;
  }

  async apply(input: DroidInput): Promise<boolean> {
    // let's firstly find the descriptive preview fragment
    // and view in recordee; the desFrag must be added, active,
    // not hidden, not detached and has valid view
    const recordee = this.args.r;
    const siblings = recordee.u.fragmentManager.active.filter(
      (f) =>
        f != this.vDetFrag &&
        f.active &&
        !f.hidden &&
        !f.detached &&
        !!f.viewId &&
        Fragments.isValid(f, recordee.u)
    );
    // the descriptive preview are often embed an recycler
    // or list view as a content to index the detailed view
    let desFrag: N<DxFragment> = null;
    let desView: N<DxView> = null;
    let content: N<DxView> = null;
    for (const frag of siblings) {
      desView = recordee.u.findViewById(frag.viewId!);
      if (desView) {
        content = ViewFinder.findView(
          desView,
          (v) => v instanceof DxListView || v instanceof DxRecyclerView
        );
        if (content) {
          desFrag = frag;
          break;
        }
      }
    }
    if (!desFrag || !desView || !content) {
      throw new NotImplementedError('Descriptive preview fragment not found');
    }
    // the let's find the selected one
    let selected = content.children.find((v) => v.flags.S) ?? null;
    if (!selected) {
      throw new NotImplementedError('No selected item in the descriptive view');
    }
    const texts = ViewFinder.findViews(selected, (v) => Views.isText(v));
    if (texts.length == 0) {
      throw new NotImplementedError('The selected item has not valid text');
    }
    // let select a unique view as the selected one
    let uniqueText: N<DxView> = null;
    for (const text of texts) {
      for (const sib of content.children) {
        if (sib == selected) {
          continue;
        }
        if (!ViewFinder.findViews(sib, (w) => w.text.includes(text.text))) {
          uniqueText = text;
          break;
        }
      }
    }
    if (!uniqueText) {
      // let use a random one, by far let's use a longer one
      uniqueText = texts[0];
      for (const text of texts) {
        if (text.text.length > uniqueText.text.length) {
          uniqueText = text;
        }
      }
    }
    selected = uniqueText;
    // for the same-versioned apk, the recordee and playee
    // often uses the same fragment id ('cause the same view).
    // so let's try to find the descriptive preview in playee
    // by the descriptive view id of the recordee
    const playee = this.args.p;
    let pContent = playee.u.findViewById(content.id);
    if (!pContent) {
      // there are no content with same id in playee, then
      // find the descriptive preview fragment in playee;
      // try also firstly the fragment id
      let pDesFrag = playee.u.fragmentManager.findFragmentById(
        desFrag.fragmentId!
      );
      if (!pDesFrag) {
        // no such fragment with the same id, try the same class
        pDesFrag = playee.u.fragmentManager.findFragment(
          (f) =>
            f.active &&
            !f.hidden &&
            !f.detached &&
            f.cls == desFrag?.cls &&
            !!pDesFrag?.viewId &&
            Fragments.isValid(f, playee.u)
        );
      }
      if (!pDesFrag) {
        throw new NotImplementedError(
          'Descriptive preview of playee does not found'
        );
      }
      let pDesView = playee.u.findViewById(pDesFrag.viewId!);
      if (!pDesView) {
        throw new NotImplementedError(
          'No view found on the descriptive preview fragment'
        );
      }
      pContent = ViewFinder.findView(
        pDesView,
        (v) => v instanceof DxListView || v instanceof DxRecyclerView
      );
    }
    if (!pContent) {
      throw new NotImplementedError(
        'No ListView or RecyclerView content on the descriptive view'
      );
    }
    // then let's find the selected item on the content
    let pSelected = ViewFinder.findViewByText(pContent, selected.text);
    if (!pSelected) {
      throw new NotImplementedError('Selected item does not found on playee');
    }
    // let's fire the selected item on playee
    await input.tap(Views.x0(pSelected) + 1, Views.y0(pSelected) + 1);
    this.setDirty();
    return false;
  }
}

export abstract class Transform extends DxBpPat {
  get level() {
    return 'transform';
  }
}

/** NavigationUp handles those views who simulates an navigation
 * up action. This is the most frequently used Transform pattern */
class NavigationUp extends Transform {
  private static DESC = ['Back', 'Navigation Up', 'Close', 'Dismiss'];

  get name() {
    return 'navigation-up';
  }

  match() {
    const desc = this.args.v.desc;
    for (const d of NavigationUp.DESC) {
      if (desc == d) {
        return true;
      }
    }
    return false;
  }

  async apply(input: DroidInput): Promise<boolean> {
    await input.pressBack();
    this.setDirty();
    return true;
  }
}

// The Pattern is sorted bottom-up, in order of
// [None, Reflow, Transform, Expand, Merge, Reveal]
// put Transform before Expand because the Transform
// is fully controlled by app developers, and it is
// sometimes simply, but sometimes complicated
const patterns = [
  // Transform
  NavigationUp,
  // Expand
  VagueText,
  VagueTextExt,
  // VagueTextDesc,
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
  DualFragmentGotoDescriptive,
  DualFragmentGotoDetailed,
  NewButton,
];

/** Recognize the pattern bottom-up from None to
 * Transform. This is an assume and check process, i.e.,
 * assume a pattern, and test the pattern condition.
 * Confirm the pattern and return if and only if the
 * condition passes, or test next pattern. The returned
 * are all patterns that matched, they are expected to
 * fired one by one in order */
export default function recBpPat(
  args: BpPatRecArgs,
  vagueOnly = false
): DxBpPat[] {
  return patterns
    .map((P) => new P(args))
    .filter((p) => !vagueOnly || p instanceof VagueText)
    .filter((p) => p.match());
}
