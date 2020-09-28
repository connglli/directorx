import type { DevInfo } from '../dxdroid.ts';
import { XYInterval } from '../utils/interval.ts';
import ArrayTreeOp, { ArrayTreeNode } from '../utils/array_tree_op.ts';
import { extract } from '../utils/types.ts';

type N<T> = T | null;

/** View flags */
export type ViewFlags = {
  V: 'V' | 'G' | 'I'; // visibility
  f: boolean; // focusable
  F: boolean; // focused
  S: boolean; // selected
  E: boolean; // enabled
  d: boolean; // will draw?
  s: {
    l: boolean; // horizontal (right to left) scrollable
    t: boolean; // vertical (bottom to top) scrollable
    r: boolean; // horizontal (left to right) scrollable
    b: boolean; // vertical (top to bottom) scrollable
  };
  c: boolean; // clickable
  lc: boolean; // long clickable
  cc: boolean; // context clickable
  a: boolean; // important for accessibility
};

const DefaultFlags: ViewFlags = {
  V: 'V',
  f: false,
  F: false,
  S: false,
  E: true,
  d: true,
  s: {
    l: false,
    t: false,
    r: false,
    b: false,
  },
  c: false,
  lc: false,
  cc: false,
  a: true,
};

/** View properties that all views have */
interface BaseProps {
  readonly package: string;
  readonly class: string;
  readonly id: string;
  readonly hash: string;
  readonly flags: ViewFlags;
  readonly shown: boolean;
  readonly bgClass: string;
  readonly bgColor: number | null;
  readonly foreground: string | null;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly elevation: number;
  readonly translationX?: number;
  readonly translationY?: number;
  readonly translationZ?: number;
  readonly scrollX?: number;
  readonly scrollY?: number;
  readonly resPkg?: string;
  readonly resType?: string;
  readonly resEntry?: string;
  readonly desc?: string;
  readonly text?: string;
  readonly tag?: string;
  readonly tip?: string;
  readonly hint?: string;
}

const DefaultProps = {
  package: '',
  class: '',
  id: '',
  hash: '',
  flags: DefaultFlags,
  shown: true,
  bgClass: '',
  bgColor: null,
  foreground: null,
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
  elevation: 0,
  translationX: 0,
  translationY: 0,
  translationZ: 0,
  scrollX: 0,
  scrollY: 0,
  resPkg: '',
  resType: '',
  resEntry: '',
  desc: '',
  text: '',
  tag: '',
  tip: '',
  hint: '',
};

/** Specific view properties that belong sto
 * specific custom views
 */
interface ExtraProps {}

/** DxView represents a View or a ViewGroup on Android.
 *
 * The drawing of an view is sequencialized to three steps:
 * 1. layout: which calculate the left/top/right/bottom of
 *    the view
 * 2. translation: translate the view on the canvas (children
 *    is at the same time translated)
 * 3. scroll: scroll the view to its children on the canvas
 *    (the children does not move)
 * So, the actual drawing coordinate of a view is actually
 * calculated by `left + translationX - scrollX`, so as the
 * y axis
 *
 * The DxView#{left,right,top,bottom,elevation}() returns the
 * absolute boundary coordinate after layout in pixel of the
 * view. The DxView#my{left,right,top,bottom,elevation}()
 * returns the relative ones
 *
 * The DxView#translation{X, Y ,Z}() returns the absolute
 * translation (recursively including its parent's translation)
 * in pixel of the view. The DxView#myTranslation{X,Y,Z}()
 * returns the relative ones
 *
 * The DxView#scroll{X, Y}() returns the the scroll x and y
 * of the view itself to its children (recursively including
 * its ancestor's scroll). DxView#myScroll{X, Y, Z}() returns
 * the relative ones
 *
 * The DxView#{x, y, z}() returns the absolute coordinate
 * of the view after translation
 *
 * The DxView#drawing{x, y, z}() returns the absolute coordinate
 * of the view after scrolling
 *
 * To extend this class, define a custom ViewExtraProps, and
 * override the #copy() method to return a correct copy
 */
export default class DxView<T extends ExtraProps = ExtraProps>
  implements ArrayTreeNode<DxView> {
  // The drawing level is different from the z index of
  // each view. Views at each level are not overlapped, but
  // views at adjacent levels are overlapped at least at one
  // view. To construct the drawing level, invoke method
  // DxCompatUi#buildDrawingLevel()
  public drawingLevel: number = -1;

  protected props: Required<BaseProps>;
  protected extra: T;
  protected parent_: N<DxView> = null;
  protected children_: DxView[] = [];

  constructor(props: BaseProps, extra: T) {
    this.props = {
      package: props.package,
      class: props.class,
      id: props.id,
      hash: props.hash,
      flags: props.flags,
      shown: props.shown,
      bgClass: props.bgClass,
      bgColor: props.bgColor,
      foreground: props.foreground,
      left: props.left,
      top: props.top,
      right: props.right,
      bottom: props.bottom,
      elevation: props.elevation,
      translationX: props.translationX ?? DefaultProps.translationX,
      translationY: props.translationY ?? DefaultProps.translationY,
      translationZ: props.translationZ ?? DefaultProps.translationZ,
      scrollX: props.scrollX ?? DefaultProps.scrollX,
      scrollY: props.scrollY ?? DefaultProps.scrollY,
      resPkg: props.resPkg ?? DefaultProps.resPkg,
      resType: props.resType ?? DefaultProps.resType,
      resEntry: props.resEntry ?? DefaultProps.resEntry,
      desc: props.desc ?? DefaultProps.desc,
      text: props.text ?? DefaultProps.text,
      tag: props.tag ?? DefaultProps.tag,
      tip: props.tip ?? DefaultProps.tip,
      hint: props.hint ?? DefaultProps.hint,
    };
    this.extra = extra;
  }

  get pkg(): string {
    return this.props.package;
  }

  get cls(): string {
    return this.props.class;
  }

  get id(): string {
    return this.props.id;
  }

  get hash(): string {
    return this.props.hash;
  }

  get flags(): ViewFlags {
    return this.props.flags;
  }

  get shown(): boolean {
    return this.props.shown;
  }

  get bgClass(): string {
    return this.props.bgClass;
  }

  get bgColor(): number | null {
    return this.props.bgColor;
  }

  get background(): string {
    return `${this.props.bgClass}/#${
      this.props.bgColor?.toString(16) ?? 'nnnn'
    }`;
  }

  get foreground(): string | null {
    return this.props.foreground;
  }

  get parent(): N<DxView> {
    return this.parent_;
  }

  get children(): DxView[] {
    return this.children_.slice();
  }

  get left(): number {
    return this.props.left;
  }

  get right(): number {
    return this.props.right;
  }

  get top(): number {
    return this.props.top;
  }

  get bottom(): number {
    return this.props.bottom;
  }

  get elevation(): number {
    return this.props.elevation;
  }

  get width(): number {
    return this.right - this.left;
  }

  get height(): number {
    return this.bottom - this.top;
  }

  get translationX(): number {
    return this.props.translationX;
  }

  get translationY(): number {
    return this.props.translationY;
  }

  get translationZ(): number {
    return this.props.translationZ;
  }

  get scrollX(): number {
    return this.props.scrollX;
  }

  get scrollY(): number {
    return this.props.scrollY;
  }

  get x(): number {
    return this.left + this.translationX;
  }

  get y(): number {
    return this.top + this.translationY;
  }

  get z(): number {
    return this.elevation + this.translationZ;
  }

  get drawingX(): number {
    return this.x - (this.parent?.scrollX ?? 0);
  }

  get drawingY(): number {
    return this.y - (this.parent?.scrollY ?? 0);
  }

  get drawingZ(): number {
    return this.z;
  }

  get myLeft(): number {
    return this.left - (this.parent?.left ?? 0);
  }

  get myTop(): number {
    return this.top - (this.parent?.top ?? 0);
  }

  get myRight(): number {
    return this.myLeft + this.width;
  }

  get myBottom(): number {
    return this.myTop + this.height;
  }

  get myElevation(): number {
    return this.elevation - (this.parent?.elevation ?? 0);
  }

  get myTranslationX(): number {
    return this.translationX - (this.parent?.translationX ?? 0);
  }

  get myTranslationY(): number {
    return this.translationY - (this.parent?.translationY ?? 0);
  }

  get myTranslationZ(): number {
    return this.translationZ - (this.parent?.translationZ ?? 0);
  }

  get myScrollX(): number {
    return this.scrollX - (this.parent?.scrollX ?? 0);
  }

  get myScrollY(): number {
    return this.scrollY - (this.parent?.scrollY ?? 0);
  }

  get resId(): string {
    if (this.resPkg.length + this.resType.length + this.resEntry.length > 0) {
      return `${this.resPkg}:${this.resType}/${this.resEntry}`;
    } else {
      return '';
    }
  }

  get resPkg(): string {
    return this.props.resPkg;
  }

  get resType(): string {
    return this.props.resType;
  }

  get resEntry(): string {
    return this.props.resEntry;
  }

  get desc(): string {
    return this.props.desc;
  }

  get text(): string {
    return this.props.text;
  }

  get tag(): string {
    return this.props.tag;
  }

  get tip(): string {
    return this.props.tip;
  }

  get hint(): string {
    return this.props.hint;
  }

  get siblings(): DxView[] {
    return (this.parent?.children ?? []).filter((v) => v != this);
  }

  /** Add view v as a child */
  addView(v: DxView): void {
    v.parent_ = this;
    this.children_.push(v);
  }

  /** Remove child view v */
  removeView(v: DxView): void {
    if (v.parent_ != this) {
      return;
    }
    const ind = this.children_.indexOf(v);
    v.parent_ = null;
    this.children_.splice(ind, 1);
  }

  /** Attach self as a child of view v */
  attach(v: DxView): void {
    v.addView(this);
  }

  /** Detach self from parent */
  detach(): void {
    this.parent?.removeView(this);
  }

  /** Return a new DxView that are copied from this */
  copy(): DxView {
    return new DxView(this.props, this.extra);
  }

  /** Check the equality of two views */
  equals(v: DxView, flags = true) {
    let ret =
      this.id == v.id &&
      this.hash == v.hash &&
      this.pkg == v.pkg &&
      this.cls == v.cls &&
      this.shown == v.shown &&
      this.background == v.background &&
      this.foreground == v.foreground &&
      this.left == v.left &&
      this.right == v.right &&
      this.top == v.top &&
      this.bottom == v.bottom &&
      this.elevation == v.elevation &&
      this.translationX == v.translationX &&
      this.translationY == v.translationY &&
      this.translationZ == v.translationZ &&
      this.scrollX == v.scrollX &&
      this.scrollY == v.scrollY &&
      this.resId == v.resId &&
      this.desc == v.desc &&
      this.text == v.text &&
      this.tag == v.tag &&
      this.tip == v.tip &&
      this.hint == v.hint;
    if (flags) {
      ret =
        ret &&
        this.flags.V == v.flags.V &&
        this.flags.f == v.flags.f &&
        this.flags.F == v.flags.F &&
        this.flags.S == v.flags.S &&
        this.flags.E == v.flags.E &&
        this.flags.d == v.flags.d &&
        this.flags.s.l == v.flags.s.l &&
        this.flags.s.t == v.flags.s.t &&
        this.flags.s.r == v.flags.s.r &&
        this.flags.s.b == v.flags.s.b &&
        this.flags.c == v.flags.c &&
        this.flags.lc == v.flags.lc &&
        this.flags.cc == v.flags.cc &&
        this.flags.a == v.flags.a;
    }
    return ret;
  }
}

export class DxDecorView extends DxView {
  public static readonly NAME = 'com.android.internal.policy.DecorView';
  constructor(
    pkg: string,
    hash: string,
    width: number,
    height: number,
    bgClass: string,
    bgColor: number | null
  ) {
    super(
      {
        package: pkg,
        class: DxDecorView.NAME,
        hash,
        id: DefaultProps.id,
        flags: DefaultFlags,
        shown: DefaultProps.shown,
        foreground: DefaultProps.foreground,
        bgClass,
        bgColor,
        left: 0,
        right: width,
        top: 0,
        bottom: height,
        elevation: 0,
      },
      {}
    );
  }
  copy(): DxDecorView {
    return new DxDecorView(
      this.pkg,
      this.hash,
      this.width,
      this.height,
      this.bgClass,
      this.bgColor
    );
  }
}

interface ViewPagerProps extends ExtraProps {
  currPage: number;
}

const DefaultViewPagerProps = {
  currPage: 0,
};

export class DxViewPager extends DxView<ViewPagerProps> {
  get currPage(): number {
    return this.extra.currPage;
  }

  copy(): DxViewPager {
    return new DxViewPager(this.props, this.extra);
  }

  equals(v: DxView, flags = true) {
    return (
      v instanceof DxViewPager &&
      super.equals(v, flags) &&
      this.currPage == v.currPage
    );
  }
}

interface TabHostProps extends ExtraProps {
  currTab: number;
  tabsHash: string;
  contentHash: string;
}

const DefaultTabHostProps: TabHostProps = {
  currTab: 0,
  tabsHash: '',
  contentHash: '',
};

export class DxTabHost extends DxView<TabHostProps> {
  get currTab(): number {
    return this.extra.currTab;
  }

  get tabsHash(): string {
    return this.extra.tabsHash;
  }

  get contentHash(): string {
    return this.extra.contentHash;
  }

  copy(): DxTabHost {
    return new DxTabHost(this.props, this.extra);
  }

  equals(v: DxView, flags = true) {
    return (
      v instanceof DxTabHost &&
      super.equals(v, flags) &&
      this.currTab == v.currTab &&
      this.tabsHash == v.tabsHash &&
      this.contentHash == v.contentHash
    );
  }
}

export class DxWebView extends DxView {
  copy(): DxWebView {
    return new DxWebView(this.props, this.extra);
  }
  equals(v: DxView, flags = true) {
    return v instanceof DxWebView && super.equals(v, flags);
  }
}

export class DxRecyclerView extends DxView {
  copy(): DxRecyclerView {
    return new DxRecyclerView(this.props, this.extra);
  }
  equals(v: DxView, flags = true) {
    return v instanceof DxRecyclerView && super.equals(v, flags);
  }
}

export class DxListView extends DxView {
  copy(): DxListView {
    return new DxListView(this.props, this.extra);
  }
  equals(v: DxView, flags = true) {
    return v instanceof DxListView && super.equals(v, flags);
  }
}

export class DxGridView extends DxView {
  copy(): DxGridView {
    return new DxGridView(this.props, this.extra);
  }
  equals(v: DxView, flags = true) {
    return v instanceof DxGridView && super.equals(v, flags);
  }
}

export class DxScrollView extends DxView {
  copy(): DxScrollView {
    return new DxScrollView(this.props, this.extra);
  }
  equals(v: DxView, flags = true) {
    return v instanceof DxScrollView && super.equals(v, flags);
  }
}

export class DxHorizontalScrollView extends DxView {
  copy(): DxHorizontalScrollView {
    return new DxHorizontalScrollView(this.props, this.extra);
  }
  equals(v: DxView, flags = true) {
    return v instanceof DxHorizontalScrollView && super.equals(v, flags);
  }
}

export class DxNestedScrollView extends DxView {
  copy(): DxNestedScrollView {
    return new DxNestedScrollView(this.props, this.extra);
  }
  equals(v: DxView, flags = true) {
    return v instanceof DxNestedScrollView && super.equals(v, flags);
  }
}

export class DxToolbar extends DxView {
  copy(): DxToolbar {
    return new DxToolbar(this.props, this.extra);
  }
  equals(v: DxView, flags = true) {
    return v instanceof DxToolbar && super.equals(v, flags);
  }
}

/** Utility to find a specific view */
export class ViewFinder extends ArrayTreeOp {
  /** Find the first horizontally scrollable parent, this returns a parent
   * that is either a view used for scrolling (e.g., ListView) but not ensured
   * to be scrollable, or a scrollable generic view */
  static findHScrollableParent(v: DxView): N<DxView> {
    return ViewFinder.findParent(
      v,
      (p) => p instanceof DxHorizontalScrollView || p.flags.s.l || p.flags.s.r
    );
  }

  /** Find the first horizontally scrollable parent, this returns a parent
   * that is either a view used for scrolling (e.g., ListView) but not ensured
   * to be scrollable, or a scrollable generic view */
  static findVScrollableParent(v: DxView): N<DxView> {
    return ViewFinder.findParent(
      v,
      (p) =>
        p instanceof DxRecyclerView ||
        p instanceof DxListView ||
        p instanceof DxScrollView ||
        p instanceof DxNestedScrollView ||
        p.flags.s.t ||
        p.flags.s.b
    );
  }

  /** Find the first view that satisfy the predicate */
  static findView(v: DxView, pred: (v: DxView) => boolean): N<DxView> {
    return ViewFinder.findFirst(v, pred);
  }

  static findViewById(v: DxView, id: string): N<DxView> {
    return ViewFinder.findView(v, (w) => w.id == id);
  }

  /** Find a most detailed view by x, y coordinate, set visible to false
   * if need to find invisible also */
  static findViewByXY(
    v: DxView,
    x: number,
    y: number,
    visible = true,
    a11y = true,
    meaningful = true
  ): N<DxView> {
    let views = ViewFinder.findViewsByXY(v, x, y, visible);
    if (a11y) {
      views = views.filter((v) => v.flags.a);
    }
    return meaningful
      ? ViewFinder.heuristicallyFindFirstMeaningful(views)
      : views[0];
  }

  /** Find the first met view with hash h */
  static findViewByHash(v: DxView, hash: string): N<DxView> {
    return ViewFinder.findView(v, (w) => w.hash == hash);
  }

  /** Find the first met view with text t */
  static findViewByText(
    v: DxView,
    text: string,
    caseInsensitive = false
  ): N<DxView> {
    if (caseInsensitive) {
      return ViewFinder.findView(
        v,
        (w) => w.text.toLowerCase() == text.toLowerCase()
      );
    } else {
      return ViewFinder.findView(v, (w) => w.text == text);
    }
  }

  /** Find the first met view with desc t */
  static findViewByDesc(v: DxView, desc: string): N<DxView> {
    return ViewFinder.findView(v, (w) => w.desc == desc);
  }

  /** Find the first met view with resource type and entry */
  static findViewByResource(v: DxView, type: string, entry: string): N<DxView> {
    return ViewFinder.findView(
      v,
      (w) => w.resType == type && w.resEntry == entry
    );
  }

  /** Find the view by children indices */
  static findViewByIndices(v: DxView, indices: number[]): N<DxView> {
    return ViewFinder.findChildByIndices(v, indices);
  }

  /** Find all views that satisfy the predicate */
  static findViews(v: DxView, pred: (v: DxView) => boolean): DxView[] {
    return ViewFinder.find(v, pred);
  }

  /** Find all views that classes by cls */
  static findViewsByClass(v: DxView, cls: string): DxView[] {
    return ViewFinder.findViews(v, (w) => w.cls == cls);
  }

  /** Find all views by x, y coordinate, set visible to false
   * if need to find invisible ones also */
  static findViewsByXY(
    v: DxView,
    x: number,
    y: number,
    visible = true
  ): DxView[] {
    let found: DxView[] = [];
    if (!ViewFinder.isInView(v, x, y, visible)) {
      return found;
    }
    found.push(v);
    for (const c of v.children) {
      found = [...ViewFinder.findViewsByXY(c, x, y, visible), ...found];
    }
    return found;
  }

  /** Check whether a point hits self or not */
  private static isInView(
    v: DxView,
    x: number,
    y: number,
    visible = true
  ): boolean {
    let hit =
      Views.x0(v) <= x &&
      x <= Views.x1(v) &&
      Views.y0(v) <= y &&
      y <= Views.y1(v);
    if (visible) {
      hit = hit && v.shown;
    }
    return hit;
  }

  private static heuristicallyFindFirstMeaningful(views: DxView[]): N<DxView> {
    if (views.length == 0) {
      return null;
    } else if (views.length == 1) {
      return views[0];
    }
    // one seldom taps progress bar
    views = views.filter(
      (v) => v.cls.toLowerCase().indexOf('progressbar') == -1
    );
    if (views.length == 0) {
      return null;
    } else if (views.length == 1) {
      return views[0];
    }
    {
      const texts = views.filter((v) => v.text.length > 0);
      if (texts.length >= 1) {
        return texts[0];
      }
    }
    let sorted = views
      .slice()
      .sort(
        (a, b) => Views.informativeLevelOf(b) - Views.informativeLevelOf(a)
      );
    if (sorted[0] == views[0]) {
      return sorted[0];
    } else if (
      Views.informativeLevelOf(sorted[0]) > Views.informativeLevelOf(sorted[1])
    ) {
      return Views.informativeLevelOf(sorted[0]) >= 2 &&
        !Views.isChild(views[0], sorted[0])
        ? sorted[0]
        : views[0];
    } else {
      return views[0];
    }
  }
}

/** Utility to compute some view properties */
export class Views {
  static isStatusBar(v: DxView): boolean {
    return v.resId == 'android:id/statusBarBackground';
  }

  static isNavBar(v: DxView): boolean {
    return v.resId == 'android:id/navigationBarBackground';
  }

  static isViewImportantForA11y(v: DxView): boolean {
    return v.flags.a;
  }

  static isViewHierarchyImportantForA11y(v: DxView): boolean {
    if (Views.isViewImportantForA11y(v)) {
      return true;
    }
    for (const cv of v.children) {
      if (Views.isViewHierarchyImportantForA11y(cv)) {
        return true;
      }
    }
    return false;
  }

  /** Informative level of a view, return
   * 0: not informative,
   * 1: informative,
   * 2: very informative,
   * 3: great informative
   * 4: super informative
   */
  static informativeLevelOf(v: DxView): number {
    return (
      (v.desc.length != 0 ? 1 : 0) +
      (v.text.length != 0 ? 1 : 0) +
      (v.resId.length != 0 ? 1 : 0) +
      (v.hint.length != 0 ? 1 : 0)
    );
  }

  static layoutSummaryOf(v: DxView, d = 1): string {
    let summary = `${v.cls}:${Math.max(Views.informativeLevelOf(v), 2)};`;
    if (d != 1) {
      for (const c of v.children) {
        summary += Views.layoutSummaryOf(c, d - 1);
      }
    }
    return summary;
  }

  static drawingLevelRangeOf(v: DxView): [number, number] {
    let max = v.drawingLevel;
    let min = v.drawingLevel;
    for (const cv of v.children) {
      const next = Views.drawingLevelRangeOf(cv);
      min = Math.min(min, next[0]);
      max = Math.max(max, next[1]);
    }
    return [min, max];
  }

  static isText(v: DxView): boolean {
    return v.text.length != 0;
  }

  /** Test whether the given view obeys the valid
   * definition, i.e., is large enough */
  static isValid(v: DxView): boolean {
    return v.width >= 5 && v.height >= 5;
  }

  /** Return the visible bounds of this view */
  static visibleBounds(v: DxView, d: DevInfo) {
    if (!v.shown) {
      return null;
    }
    const { width, height } = d;
    return XYInterval.overlap(
      XYInterval.of(0, width, 0, height),
      Views.bounds(v)
    );
  }

  /** Test whether the user can see the given view */
  static isVisibleToUser(v: DxView, d: DevInfo): boolean {
    if (!v.shown) {
      return false;
    }
    const { width, height } = d;
    return (
      XYInterval.overlap(XYInterval.of(0, width, 0, height), Views.bounds(v)) !=
      null
    );
  }

  /** Return the distance from parent to child, or
   * 0 if child == parent, or -1 if not a child */
  static distance(child: DxView, parent: DxView) {
    const path = Views.path(child, parent);
    return path.length - 1;
  }

  /** Return the path from parent to child, or empty */
  static path(child: DxView, parent: DxView) {
    const path: DxView[] = [];
    let ptr: N<DxView> = child;
    while (ptr) {
      path.push(ptr);
      if (ptr == parent) {
        return path.reverse();
      }
      ptr = ptr.parent;
    }
    return [];
  }

  static canR2LScroll(v: DxView): boolean {
    return v.flags.s.l;
  }

  static canL2RScroll(v: DxView): boolean {
    return v.flags.s.r;
  }

  static canB2TScroll(v: DxView): boolean {
    return v.flags.s.t;
  }

  static canT2BScroll(v: DxView): boolean {
    return v.flags.s.b;
  }

  static hasValidChild(v: DxView): boolean {
    return v.children.some((c) => this.isValid(c));
  }

  static indexOf(v: DxView): number {
    return v.parent?.children.indexOf(v) ?? -1;
  }

  static areaOf(v: DxView): number {
    return v.width * v.height;
  }

  static isChild(v: DxView, r: DxView): boolean {
    let p = v.parent;
    while (p) {
      if (p == r) {
        return true;
      }
      p = p.parent;
    }
    return false;
  }

  static splitResourceId(resId: string): [string, string, string] {
    if (resId.length == 0) return ['', '', ''];
    const colon = resId.indexOf(':');
    const slash = resId.indexOf('/');
    if (colon == -1 || slash == -1) {
      return ['', '', ''];
    }
    return [
      resId.substring(0, colon),
      resId.substring(colon + 1, slash),
      resId.substring(slash + 1),
    ];
  }

  static bounds(v: DxView): XYInterval {
    return XYInterval.of(...Views.xxyy(v));
  }

  static xxyy(v: DxView): [number, number, number, number] {
    return [Views.x0(v), Views.x1(v), Views.y0(v), Views.y1(v)];
  }

  static x0(v: DxView): number {
    return v.drawingX;
  }

  static x1(v: DxView): number {
    return v.drawingX + v.width;
  }

  static xCenter(v: DxView): number {
    return (Views.x0(v) + Views.x1(v)) / 2;
  }

  static y0(v: DxView): number {
    return v.drawingY;
  }

  static y1(v: DxView): number {
    return v.drawingY + v.height;
  }

  static yCenter(v: DxView): number {
    return (Views.y0(v) + Views.y1(v)) / 2;
  }

  static z(v: DxView): number {
    return v.drawingZ;
  }
}

export interface ViewProps extends BaseProps, ExtraProps {
  [key: string]: any;
}

export enum ViewType {
  DECOR_VIEW = 1,
  VIEW_PAGER,
  TAB_HOST,
  WEB_VIEW,
  RECYCLER_VIEW,
  LIST_VIEW,
  GRID_VIEW,
  SCROLL_VIEW,
  HORIZONTAL_SCROLL_VIEW,
  NESTED_SCROLL_VIEW,
  TOOLBAR,
  VIEW,
}

export class ViewFactory {
  public static create(type: ViewType, props: ViewProps): DxView {
    switch (type) {
      case ViewType.DECOR_VIEW:
        return new DxDecorView(
          props.package,
          props.hash,
          props.right,
          props.bottom,
          props.bgClass,
          props.bgColor
        );
      case ViewType.VIEW_PAGER:
        return new DxViewPager(props, extract(props, DefaultViewPagerProps));
      case ViewType.TAB_HOST:
        return new DxTabHost(props, extract(props, DefaultTabHostProps));
      case ViewType.WEB_VIEW:
        return new DxWebView(props, {});
      case ViewType.RECYCLER_VIEW:
        return new DxRecyclerView(props, {});
      case ViewType.LIST_VIEW:
        return new DxListView(props, {});
      case ViewType.GRID_VIEW:
        return new DxGridView(props, {});
      case ViewType.SCROLL_VIEW:
        return new DxScrollView(props, {});
      case ViewType.HORIZONTAL_SCROLL_VIEW:
        return new DxHorizontalScrollView(props, {});
      case ViewType.NESTED_SCROLL_VIEW:
        return new DxNestedScrollView(props, {});
      case ViewType.TOOLBAR:
        return new DxToolbar(props, {});
      default:
        return new DxView(props, {});
    }
  }

  public static typeOf(v: DxView): ViewType {
    if (v instanceof DxDecorView) {
      return ViewType.DECOR_VIEW;
    } else if (v instanceof DxViewPager) {
      return ViewType.VIEW_PAGER;
    } else if (v instanceof DxTabHost) {
      return ViewType.TAB_HOST;
    } else if (v instanceof DxWebView) {
      return ViewType.WEB_VIEW;
    } else if (v instanceof DxRecyclerView) {
      return ViewType.RECYCLER_VIEW;
    } else if (v instanceof DxListView) {
      return ViewType.LIST_VIEW;
    } else if (v instanceof DxGridView) {
      return ViewType.GRID_VIEW;
    } else if (v instanceof DxScrollView) {
      return ViewType.SCROLL_VIEW;
    } else if (v instanceof DxHorizontalScrollView) {
      return ViewType.HORIZONTAL_SCROLL_VIEW;
    } else if (v instanceof DxNestedScrollView) {
      return ViewType.NESTED_SCROLL_VIEW;
    } else if (v instanceof DxToolbar) {
      return ViewType.TOOLBAR;
    } else {
      return ViewType.VIEW;
    }
  }
}
