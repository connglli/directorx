import { DevInfo } from './dxdroid.ts';
import LinkedList from './utils/linked_list.ts';
import { XYInterval } from './utils/interval.ts';
import { CannotReachHereError } from './utils/error.ts';

export type DxViewFlags = {
  V: 'V' | 'G' | 'I'; // visibility
  f: boolean;         // focusable
  F: boolean;         // focused
  S: boolean;         // selected
  E: boolean;         // enabled
  d: boolean;         // will draw?
  hs: boolean;        // horizontal scrollable
  vs: boolean;        // vertical scrollable
  c: boolean;         // clickable
  lc: boolean;        // long clickable
  cc: boolean;        // context clickable  
}

export const DefaultFlags: DxViewFlags = {
  V: 'V',
  f: false,
  F: false,
  S: false,
  E: true,
  d: true,
  hs: false,
  vs: false,
  c: false,
  lc: false,
  cc: false,
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
    protected parent_: DxView | null = null,
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

  get parent(): DxView | null {
    return this.parent_;
  }

  get children(): DxView[] {
    return this.children_;
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
    this.children_ = [
      ...this.children_.slice(0, ind),
      ...this.children_.slice(ind+1)
    ];
  }

  /** Attach self as a child of view v */
  attach(v: DxView): void {
    v.addView(this);
  }

  /** Detach self from parent */
  detach(): void {
    this.parent?.removeView(this);
  }

  /** Walk the hierarchy up to find a horizontally scrollable parent. 
   * A scrollable parent indicates that this node may be in a content
   * where it is partially visible due to scrolling. its clickable 
   * center maybe invisible and adjustments should be made to the 
   * click coordinates.
   */
  findHScrollableParent(): DxView | null {
    let v = this.parent;
    while (v != null) {
      if (v.flags.hs) {
        return v;
      }
      v = v.parent;
    }
    return null;
  }

  /** Walk the hierarchy up to find a vertically scrollable parent. 
   * A scrollable parent indicates that this node may be in a content
   * where it is partially visible due to scrolling. its clickable 
   * center maybe invisible and adjustments should be made to the 
   * click coordinates.
   */
  findVScrollableParent(): DxView | null {
    let v = this.parent;
    while (v != null) {
      if (v.flags.vs) {
        return v;
      }
      v = v.parent;
    }
    return null;
  }

  /** Find a most detailed view by x, y coordinate, set visible to false 
   * if need to find invisible also */
  findViewByXY(x: number, y: number, visible = true, enabled = true): DxView | null {
    const views = this.findViewsByXY(x, y, visible, enabled);
    if (views.length > 0) {
      return views[0];
    } else {
      return null;
    }
  }

  /** Find all views by x, y coordinate, set visible to false 
   * if need to find invisible ones also */
  findViewsByXY(x: number, y: number, visible = true, enabled = true): DxView[] {
    let hitViews = [];
    if (this.hitSelf(x, y, visible, enabled)) {
      hitViews.push(this);
    }
    for (const c of this.children) {
      hitViews = [...c.findViewsByXY(x, y), ...hitViews];
    }
    return hitViews;
  }

  /** Check whether a point hits self or not */
  hitSelf(x: number, y: number, visible = true, enabled = true): boolean {
    let hit = (
      this.drawingX <= x && x <= (this.drawingX + this.width) &&
      this.drawingY <= y && y <= (this.drawingY + this.height)
    );
    if (visible) {
      hit = hit && this.shown;
    }
    if (enabled) {
      hit = hit && this.flags.E;
    }
    return hit;
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
    hint= '',
    parent: DxView | null = null,
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
  copy(
    parent: DxView | null = null, 
    children: DxView[] = []
  ): DxView {
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
      bgClass, bgColor, null,
      0, 0, width, height, 0
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

  findViewsByXY(x: number, y: number, visible = true, enabled = true): DxView[] {
    let hitViews: DxView[] = [];
    if (this.hitSelf(x, y, visible, enabled)) {
      hitViews.push(this);
    }
    if (this.currItem < this.children.length) {
      const c = this.children[this.currItem];
      hitViews = [...c.findViewsByXY(x, y, visible, enabled), ...hitViews];
    }
    return hitViews;
  }

  copy(
    parent: DxView | null = null, 
    children: DxView[] = []
  ): DxView {
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

  copy(
    parent: DxView | null = null, 
    children: DxView[] = []
  ): DxView {
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

export class Views {
  static isStatusBar(v: DxView): boolean {
    return v.resId == 'android:id/statusBarBackground';
  }

  static isNavBar(v: DxView): boolean {
    return v.resId == 'android:id/navigationBarBackground';
  }

  static isInformative(v: DxView): boolean {
    return v.children.length != 0 || 
      v.desc.length != 0 || 
      v.text.length != 0 || 
      v.resId.length != 0;
  }

  static isText(v: DxView): boolean {
    return v.text.length != 0;
  }

  static isValid(v: DxView): boolean {
    return v.width != 0 && v.height != 0;
  }

  static isVisibleToUser(v: DxView, d: DevInfo): boolean {
    if (!v.shown) {
      return false;
    }
    const { width, height } = d;
    return XYInterval.overlap(
      XYInterval.of(0, width, 0, height), 
      Views.bounds(v)
    ) != null;
  }

  static hasValidChild(v: DxView): boolean {
    return v.children.some(c => this.isValid(c));
  }

  static areaOf(v: DxView): number {
    return v.width * v.height;
  }

  static siblings(v: DxView, self = false): DxView[] {
    if (self) {
      return v.parent?.children ?? [];
    } else {
      return v.parent?.children.filter(c => c != v) ?? [];
    }
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

  static y0(v: DxView): number {
    return v.drawingY;
  }

  static y1(v: DxView): number {
    return v.drawingY + v.height;
  }
}

export class DxActivity {
  private decor: DxDecorView | null = null;

  constructor(
    public readonly app: string,  // app package name
    public readonly name: string  // activity name
  ) {}

  get decorView(): DxDecorView | null {
    return this.decor;
  }

  installDecor(
    width: number, height: number, 
    bgClass: string, bgColor: number | null
  ): void {
    this.decor = new DxDecorView(this.app, width, height, bgClass, bgColor);
  }

  replaceDecor(decor: DxDecorView): void {
    this.decor = decor;
  }

  findViewByXY(x: number, y: number, visible = true): DxView | null {
    return this.decor?.findViewByXY(x, y, visible) ?? null;
  }

  /** Build the drawing level top-down. Views at each level are 
   * not overlapped, but views at adjacent levels are overlapped 
   * at least at one view. */
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
          .findIndex(l => l.filter(node => XYInterval.overlap(Views.bounds(node), viewBounds)).length == 0);
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
      view.children.forEach(v => doBuildForView(v, viewLevel));
    }

    const decor = this.decorView!;
    decor.children.forEach(v => doBuildForView(v, levelLists.length));

    return levelLists;
  }
}

export class DxViewFactory { 
  public static create(type: DxViewType): DxView {
    switch (type) {
    case DxViewType.DECOR:
      return new DxDecorView('', -1, -1, '', null);
    case DxViewType.VIEW_PAGER:
      return new DxViewPager('', '', DefaultFlags, true, '', null, null, -1, -1, -1, -1, -1);
    case DxViewType.TAB_HOST:
      return new DxTabHost('', '', DefaultFlags, true, '', null, null, -1, -1, -1, -1, -1);
    case DxViewType.OTHERS:
      return new DxView('', '', DefaultFlags, true, '', null, null, -1, -1, -1, -1, -1);
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
