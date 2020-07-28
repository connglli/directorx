import { DevInfo } from './dxdroid.ts';
import LinkedList from './utils/linked_list.ts';
import { XYInterval } from './utils/interval.ts';
import { CannotReachHereError } from './utils/error.ts';

type N<T> = T | null;

export type DxViewFlags = {
  V: 'V' | 'G' | 'I'; // visibility
  f: boolean; // focusable
  F: boolean; // focused
  S: boolean; // selected
  E: boolean; // enabled
  d: boolean; // will draw?
  s: {
    l: boolean; // horizontal (left) scrollable
    t: boolean; // vertical (top) scrollable
    r: boolean; // horizontal (right) scrollable
    b: boolean; // vertical (bottom) scrollable
  };
  c: boolean; // clickable
  lc: boolean; // long clickable
  cc: boolean; // context clickable
  a: boolean; // important for accessibility
};

export const DefaultFlags: DxViewFlags = {
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

export enum DxViewType {
  DECOR = 1,
  VIEW_PAGER,
  TAB_HOST,
  OTHERS,
}

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
 * The DxView#translation{X,Y,Z}() returns the absolute
 * translation (recursively including its parent's translation)
 * in pixel of the view. The DxView#myTranslation{X,Y,Z}()
 * returns the relative ones
 *
 * The DxView#scroll{X, Y}() returns the the scroll x and y
 * of the view itself to its children (recursively including
 * its ancestor's scroll). DxView#myScroll{X,Y,Z}() returns
 * the relative ones
 *
 * The DxView#{X,Y,Z}() returns the absolute coordinate
 * of the view after translation
 *
 * The DxView#drawing{X,Y,Z}() returns the absolute coordinate
 * of the view after scrolling
 */
export default class DxView {
  // The drawing level is different from the z index of
  // each view. Views at each level are not overlapped, but
  // views at adjacent levels are overlapped at least at one
  // view. To construct the drawing level, invoke method
  // DxActivity#buildDrawingLevel()
  public drawingLevel: number = -1;
  constructor(
    protected pkg_: string,
    protected cls_: string,
    protected flags_: DxViewFlags,
    protected shown_: boolean,
    protected bgClass_: string,
    protected bgColor_: number | null,
    protected fg_: string | null,
    protected left_: number,
    protected top_: number,
    protected right_: number,
    protected bottom_: number,
    protected elevation_: number,
    protected tx_ = 0,
    protected ty_ = 0,
    protected tz_ = 0,
    protected sx_ = 0,
    protected sy_ = 0,
    protected resPkg_ = '',
    protected resType_ = '',
    protected resEntry_ = '',
    protected desc_ = '',
    protected text_ = '',
    protected tag_ = '',
    protected tip_ = '',
    protected hint_ = '',
    protected parent_: N<DxView> = null,
    protected children_: DxView[] = []
  ) {}

  get pkg(): string {
    return this.pkg_;
  }

  get cls(): string {
    return this.cls_;
  }

  get flags(): DxViewFlags {
    return this.flags_;
  }

  get shown(): boolean {
    return this.shown_;
  }

  get bgClass(): string {
    return this.bgClass_;
  }

  get bgColor(): number | null {
    return this.bgColor_;
  }

  get background(): string {
    return `${this.bgClass_}/#${this.bgColor_?.toString(16) ?? 'nnnn'}`;
  }

  get foreground(): string | null {
    return this.fg_;
  }

  get parent(): N<DxView> {
    return this.parent_;
  }

  get children(): DxView[] {
    return this.children_.slice();
  }

  get left(): number {
    return this.left_;
  }

  get right(): number {
    return this.right_;
  }

  get top(): number {
    return this.top_;
  }

  get bottom(): number {
    return this.bottom_;
  }

  get elevation(): number {
    return this.elevation_;
  }

  get width(): number {
    return this.right - this.left;
  }

  get height(): number {
    return this.bottom - this.top;
  }

  get translationX(): number {
    return this.tx_;
  }

  get translationY(): number {
    return this.ty_;
  }

  get translationZ(): number {
    return this.tz_;
  }

  get scrollX(): number {
    return this.sx_;
  }

  get scrollY(): number {
    return this.sy_;
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
    return this.resPkg_;
  }

  get resType(): string {
    return this.resType_;
  }

  get resEntry(): string {
    return this.resEntry_;
  }

  get desc(): string {
    return this.desc_;
  }

  get text(): string {
    return this.text_;
  }

  get tag(): string {
    return this.tag_;
  }

  get tip(): string {
    return this.tip_;
  }

  get hint(): string {
    return this.hint_;
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

  /** Reset view properties: remember to detach from parents first */
  reset(
    pkg: string,
    cls: string,
    flags: DxViewFlags,
    shown: boolean,
    bgClass: string,
    bgColor: number | null,
    fg: string | null,
    left: number,
    top: number,
    right: number,
    bottom: number,
    elevation: number,
    tx = 0,
    ty = 0,
    tz = 0,
    sx = 0,
    sy = 0,
    rpkg = '',
    rtype = '',
    rentry = '',
    desc = '',
    text = '',
    tag = '',
    tip = '',
    hint = '',
    parent: N<DxView> = null,
    children: DxView[] = []
  ): void {
    this.pkg_ = pkg;
    this.cls_ = cls;
    this.flags_ = flags;
    this.shown_ = shown;
    this.bgClass_ = bgClass;
    this.bgColor_ = bgColor;
    this.fg_ = fg;
    this.left_ = left;
    this.top_ = top;
    this.right_ = right;
    this.bottom_ = bottom;
    this.elevation_ = elevation;
    this.tx_ = tx;
    this.ty_ = ty;
    this.tz_ = tz;
    this.sx_ = sx;
    this.sy_ = sy;
    this.resPkg_ = rpkg;
    this.resType_ = rtype;
    this.resEntry_ = rentry;
    this.desc_ = desc;
    this.text_ = text;
    this.tag_ = tag;
    this.tip_ = tip;
    this.hint_ = hint;
    this.parent_ = parent;
    this.children_ = children;
  }

  /** Return a new DxView that are copied from this */
  copy(parent: N<DxView> = null, children: DxView[] = []): DxView {
    return new DxView(
      this.pkg_,
      this.cls_,
      this.flags_,
      this.shown_,
      this.bgClass_,
      this.bgColor_,
      this.fg_,
      this.left_,
      this.top_,
      this.right_,
      this.bottom_,
      this.elevation_,
      this.tx_,
      this.ty_,
      this.tz_,
      this.sx_,
      this.sy_,
      this.resPkg_,
      this.resType_,
      this.resEntry_,
      this.desc_,
      this.text_,
      this.tag_,
      this.tip_,
      this.hint_,
      parent,
      children
    );
  }
}

export class DxDecorView extends DxView {
  public static readonly NAME = 'com.android.internal.policy.DecorView';
  constructor(
    pkg: string,
    width: number,
    height: number,
    bgClass: string,
    bgColor: number | null
  ) {
    super(
      pkg,
      DxDecorView.NAME,
      DefaultFlags,
      true,
      bgClass,
      bgColor,
      null,
      0,
      0,
      width,
      height,
      0
    );
  }
  copy(): DxDecorView {
    return new DxDecorView(
      this.pkg,
      this.width,
      this.height,
      this.bgClass,
      this.bgColor
    );
  }
}

export class DxViewPager extends DxView {
  private currItem_ = 0;

  get currItem(): number {
    return this.currItem_;
  }

  set currItem(newItem: number) {
    this.currItem_ = newItem;
  }

  copy(parent: N<DxView> = null, children: DxView[] = []): DxView {
    const view = new DxViewPager(
      this.pkg_,
      this.cls_,
      this.flags_,
      this.shown_,
      this.bgClass_,
      this.bgColor_,
      this.fg_,
      this.left_,
      this.top_,
      this.right_,
      this.bottom_,
      this.elevation_,
      this.tx_,
      this.ty_,
      this.tz_,
      this.sx_,
      this.sy_,
      this.resPkg_,
      this.resType_,
      this.resEntry_,
      this.desc_,
      this.text_,
      this.tag_,
      this.tip_,
      this.hint_,
      parent,
      children
    );
    view.currItem = this.currItem_;
    return view;
  }
}

export class DxTabHost extends DxView {
  private currTab_ = 0;

  get currTab(): number {
    return this.currTab_;
  }

  set currTab(newTab: number) {
    this.currTab_ = newTab;
  }

  copy(parent: N<DxView> = null, children: DxView[] = []): DxView {
    const view = new DxTabHost(
      this.pkg_,
      this.cls_,
      this.flags_,
      this.shown_,
      this.bgClass_,
      this.bgColor_,
      this.fg_,
      this.left_,
      this.top_,
      this.right_,
      this.bottom_,
      this.elevation_,
      this.tx_,
      this.ty_,
      this.tz_,
      this.sx_,
      this.sy_,
      this.resPkg_,
      this.resType_,
      this.resEntry_,
      this.desc_,
      this.text_,
      this.tag_,
      this.tip_,
      this.hint_,
      parent,
      children
    );
    view.currTab = this.currTab_;
    return view;
  }
}

export type ViewWalkerListenerFn = (v: DxView) => void;

export interface ViewWalkerListener {
  onWalk: ViewWalkerListenerFn;
}

/** Utility to find a specific */
export class ViewFinder {
  /** Dfs walk the tree, and trigger the listener */
  static walk(v: DxView, walker: ViewWalkerListener | ViewWalkerListenerFn) {
    if (typeof walker == 'function') {
      walker(v);
    } else {
      walker.onWalk(v);
    }
    for (const cv of v.children) {
      ViewFinder.walk(cv, walker);
    }
  }

  /** Find all views that satisfy the predicate */
  static find(v: DxView, pred: (v: DxView) => boolean): DxView[] {
    let found: DxView[] = [];
    ViewFinder.walk(v, (w) => {
      if (pred(w)) {
        found.push(w);
      }
    });
    return found;
  }

  /** Find the first view via dfs that satisfy the predicate */
  static findFirst(v: DxView, pred: (v: DxView) => boolean): N<DxView> {
    let found: N<DxView> = null;
    ViewFinder.walk(v, (w) => {
      if (!found && pred(w)) {
        found = w;
      }
    });
    return found;
  }

  /** Walk the hierarchy up to find all parents that satisfy the predicate */
  static findParents(v: DxView, pred: (v: DxView) => boolean): DxView[] {
    let found: DxView[] = [];
    let p = v.parent;
    while (p != null) {
      if (pred(p)) {
        found.push(p);
      }
      p = p.parent;
    }
    return found;
  }

  /** Walk the hierarchy up to find the first parent that satisfy the predicate */
  static findParent(v: DxView, pred: (v: DxView) => boolean): N<DxView> {
    let p = v.parent;
    while (p != null) {
      if (pred(p)) {
        return p;
      }
      p = p.parent;
    }
    return null;
  }

  /** Find the first horizontally scrollable parent */
  static findHScrollableParent(v: DxView): N<DxView> {
    return ViewFinder.findParent(v, (p) => p.flags.s.l || p.flags.s.r);
  }

  /** Find the first horizontally scrollable parent */
  static findVScrollableParent(v: DxView): N<DxView> {
    return ViewFinder.findParent(v, (p) => p.flags.s.t || p.flags.s.b);
  }

  /** Find a most detailed view by x, y coordinate, set visible to false
   * if need to find invisible also */
  static findViewByXY(
    v: DxView,
    x: number,
    y: number,
    visible = true,
    enabled = true
  ): N<DxView> {
    const views = ViewFinder.findViewsByXY(v, x, y, visible, enabled);
    if (views.length > 0) {
      // only those important for accessibility are useful
      return visible ? views.find((v) => v.flags.a) ?? null : views[0];
    } else {
      return null;
    }
  }

  /** Find the first met view with text t */
  static findViewByText(v: DxView, text: string): N<DxView> {
    return ViewFinder.findFirst(v, (w) => w.text == text);
  }

  /** Find the first met view with desc t */
  static findViewByDesc(v: DxView, desc: string): N<DxView> {
    return ViewFinder.findFirst(v, (w) => w.desc == desc);
  }

  /** Find the first met view with resource type and entry */
  static findViewByResource(v: DxView, type: string, entry: string): N<DxView> {
    return ViewFinder.findFirst(
      v,
      (w) => w.resType == type && w.resEntry == entry
    );
  }

  /** Find the view by children indices */
  static findViewByIndices(v: DxView, indices: number[]): N<DxView> {
    let p: DxView = v;
    for (let i = 0; i < indices.length; i++) {
      const ind = indices[i];
      if (ind < 0 || ind >= p.children.length) {
        return null;
      }
      p = p.children[ind];
    }
    return p;
  }

  /** Find all views that classes by cls */
  static findViewsByClass(v: DxView, cls: string): DxView[] {
    return this.find(v, (w) => w.cls == cls);
  }

  /** Find all views by x, y coordinate, set visible to false
   * if need to find invisible ones also */
  static findViewsByXY(
    v: DxView,
    x: number,
    y: number,
    visible = true,
    enabled = true
  ): DxView[] {
    let found: DxView[] = [];
    if (ViewFinder.isInView(v, x, y, visible, enabled)) {
      found.push(v);
    }
    for (const c of v.children) {
      found = [
        ...ViewFinder.findViewsByXY(c, x, y, visible, enabled),
        ...found,
      ];
    }
    return found;
  }

  /** Check whether a point hits self or not */
  static isInView(
    v: DxView,
    x: number,
    y: number,
    visible = true,
    enabled = true
  ): boolean {
    let hit =
      Views.x0(v) <= x &&
      x <= Views.x1(v) &&
      Views.y0(v) <= y &&
      y <= Views.y1(v);
    if (visible) {
      hit = hit && v.shown;
    }
    if (enabled) {
      hit = hit && v.flags.E;
    }
    return hit;
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
   */
  static informativeLevelOf(v: DxView): number {
    return (
      (v.desc.length != 0 ? 1 : 0) +
      (v.text.length != 0 ? 1 : 0) +
      (v.resId.length != 0 ? 1 : 0)
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

  static isValid(v: DxView): boolean {
    return v.width >= 5 && v.height >= 5;
  }

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

  static canScrollLeft(v: DxView): boolean {
    return v.flags.s.l;
  }

  static canScrollRight(v: DxView): boolean {
    return v.flags.s.r;
  }

  static canScrollTop(v: DxView): boolean {
    return v.flags.s.t;
  }

  static canScrollBottom(v: DxView): boolean {
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
}

export class DxActivity {
  private decor: DxDecorView | null = null;

  constructor(
    public readonly app: string, // app package name
    public readonly name: string // activity name
  ) {}

  get decorView(): DxDecorView | null {
    return this.decor;
  }

  installDecor(
    width: number,
    height: number,
    bgClass: string,
    bgColor: number | null
  ): void {
    this.decor = new DxDecorView(this.app, width, height, bgClass, bgColor);
  }

  replaceDecor(decor: DxDecorView): void {
    this.decor = decor;
  }

  findViewByXY(x: number, y: number, visible = true): N<DxView> {
    return this.decor
      ? ViewFinder.findViewByXY(this.decor, x, y, visible)
      : null;
  }

  findViewByText(text: string): N<DxView> {
    return this.decor ? ViewFinder.findViewByText(this.decor, text) : null;
  }

  findViewByDesc(desc: string): N<DxView> {
    return this.decor ? ViewFinder.findViewByDesc(this.decor, desc) : null;
  }

  findViewByResource(type: string, entry: string): N<DxView> {
    return this.decor
      ? ViewFinder.findViewByResource(this.decor, type, entry)
      : null;
  }

  /** Build the drawing level top-down. Views at each level are
   * not overlapped, but views at adjacent levels are overlapped
   * at least at one view. See more in source code of
   * Android Studio Dynamic Layout Inspector:
   * https://android.googlesource.com/platform/tools/adt/idea/+/refs/heads/studio-master-dev/layout-inspector/src/com/android/tools/idea/layoutinspector/ui/DeviceViewPanelModel.kt#175 */
  buildDrawingLevelLists(): DxView[][] {
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

    const decor = this.decorView!;
    decor.children.forEach((v) => doBuildForView(v, levelLists.length));

    return levelLists;
  }
}

export class DxViewFactory {
  public static create(type: DxViewType): DxView {
    switch (type) {
      case DxViewType.DECOR:
        return new DxDecorView('', -1, -1, '', null);
      case DxViewType.VIEW_PAGER:
        return new DxViewPager(
          '',
          '',
          DefaultFlags,
          true,
          '',
          null,
          null,
          -1,
          -1,
          -1,
          -1,
          -1
        );
      case DxViewType.TAB_HOST:
        return new DxTabHost(
          '',
          '',
          DefaultFlags,
          true,
          '',
          null,
          null,
          -1,
          -1,
          -1,
          -1,
          -1
        );
      case DxViewType.OTHERS:
        return new DxView(
          '',
          '',
          DefaultFlags,
          true,
          '',
          null,
          null,
          -1,
          -1,
          -1,
          -1,
          -1
        );
      default:
        throw new CannotReachHereError();
    }
  }

  public static typeOf(v: DxView): DxViewType {
    if (v instanceof DxDecorView) {
      return DxViewType.DECOR;
    } else if (v instanceof DxViewPager) {
      return DxViewType.VIEW_PAGER;
    } else if (v instanceof DxTabHost) {
      return DxViewType.TAB_HOST;
    } else {
      return DxViewType.OTHERS;
    }
  }
}

export class DxViewCache {
  private decorCache = new LinkedList<DxDecorView>();
  private pagerCache = new LinkedList<DxViewPager>();
  private tabCache = new LinkedList<DxTabHost>();
  private otherCache = new LinkedList<DxView>();

  get(type: DxViewType): DxView {
    let cache: LinkedList<DxView>;
    switch (type) {
      case DxViewType.DECOR:
        cache = this.decorCache;
        break;
      case DxViewType.VIEW_PAGER:
        cache = this.pagerCache;
        break;
      case DxViewType.TAB_HOST:
        cache = this.tabCache;
        break;
      case DxViewType.OTHERS:
        cache = this.otherCache;
        break;
      default:
        throw new CannotReachHereError();
    }
    if (cache.isEmpty()) {
      return DxViewFactory.create(type);
    } else {
      return cache.remove(0);
    }
  }

  put(v: DxView): void {
    switch (DxViewFactory.typeOf(v)) {
      case DxViewType.DECOR:
        return this.decorCache.pushFront(v as DxDecorView);
      case DxViewType.VIEW_PAGER:
        return this.pagerCache.pushFront(v as DxViewPager);
      case DxViewType.TAB_HOST:
        return this.tabCache.pushFront(v as DxTabHost);
      case DxViewType.OTHERS:
        return this.otherCache.pushFront(v);
      default:
        throw new CannotReachHereError();
    }
  }
}
