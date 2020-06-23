export enum DxViewVisibility {
  VISIBLE,
  INVISIBLE,
  GONE
}

export type DxViewFlags = {
  V: DxViewVisibility; // visibility
  f: boolean;          // focusable
  F: boolean;          // focused
  S: boolean;          // selected
  E: boolean;          // enabled
  d: boolean;          // will draw?
  hs: boolean;         // horizontal scrollable
  vs: boolean;         // vertical scrollable
  c: boolean;          // clickable
  lc: boolean;         // long clickable
  cc: boolean;         // context clickable  
}

export const DefaultFlags: DxViewFlags = {
  V: DxViewVisibility.VISIBLE,
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
 * y axis.
 * 
 * The DxView#{left,right,top,bottom}() returns the absolute
 * boundary coordinate after layout in pixel of the view
 * 
 * The DxView#translation{X,Y,Z}() returns the absolute 
 * translation (recursively including its parent's translation)
 * in pixel of the view
 * 
 * The DxView#{x, y, z}() returns the absolute coordinate 
 * of the view after translation
 * 
 * The DxView#scroll{X, Y}() returns the the scroll x and y
 * of the view itself to its children
 */
export default class DxView {
  constructor(
    private cls_: string,
    private flags_: DxViewFlags,
    private left_: number,
    private top_: number,
    private right_: number,
    private bottom_: number,
    private tx_ = 0,
    private ty_ = 0,
    private tz_ = 0,
    private sx_ = 0,
    private sy_ = 0,
    private rpkg_ = '',
    private rtype_ = '',
    private rentry_ = '',
    private desc_ = '',
    private text_ = '',
    private parent_: DxView | null = null,
    private children_: DxView[] = []
  ) {}

  get cls(): string {
    return this.cls_;
  }

  get flags(): DxViewFlags {
    return this.flags_;
  }

  get parent(): DxView | null {
    return this.parent_;
  }

  get children(): DxView[] {
    return this.children_;
  }

  get x(): number {
    return this.left + this.translationX;
  }

  get y(): number {
    return this.top + this.translationY;
  }

  get z(): number {
    return this.translationZ;
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

  get resId(): string {
    return `${this.resPkg}:${this.resType}/${this.resEntry}`;
  }

  get resPkg(): string {
    return this.rpkg_;
  }

  get resType(): string {
    return this.rtype_;
  }

  get resEntry(): string {
    return this.rentry_;
  }

  get desc(): string {
    return this.desc_;
  }

  get text(): string {
    return this.text_;
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
    if (this.parent) {
      this.parent.removeView(this);
    }
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
    let hit = (
      this.x <= x && x <= (this.x + this.width) &&
      this.y <= y && y <= (this.y + this.height)
    );
    if (visible) {
      hit = hit && this.flags.V == DxViewVisibility.VISIBLE;
    }
    if (enabled) {
      hit = hit && this.flags.E;
    }
    let hitViews = [];
    if (hit) {
      hitViews.push(this);
    }
    const xInChild = x + this.scrollX;
    const yInChild = y + this.scrollY;
    for (const c of this.children) {
      hitViews = [...c.findViewsByXY(xInChild, yInChild), ...hitViews];
    }
    return hitViews;
  }

  /** Reset view properties: remember to detach from parents first */
  reset(
    cls: string,
    flags: DxViewFlags,
    left: number,
    top: number,
    right: number,
    bottom: number,
    tx: number,
    ty: number,
    tz: number,
    sx: number,
    sy: number,
    rpkg = '',
    rtype = '',
    rentry = '',
    desc = '',
    text = '',
    parent: DxView | null = null,
    children: DxView[] = []
  ): void {
    this.cls_ = cls;
    this.flags_ = flags;
    this.left_ = left;
    this.top_ = top;
    this.right_ = right;
    this.bottom_ = bottom;
    this.tx_ = tx;
    this.ty_ = ty;
    this.tz_ = tz;
    this.sx_ = sx;
    this.sy_ = sy;
    this.rpkg_ = rpkg;
    this.rtype_ = rtype;
    this.rentry_ = rentry;
    this.desc_ = desc;
    this.text_ = text;
    this.parent_ = parent;
    this.children_ = children;
  }

  /** Return a new DxView that are copied from this */
  copy(
    parent: DxView | null = null, 
    children: DxView[] = []
  ): DxView {
    return new DxView(
      this.cls_,
      this.flags_,
      this.left_,
      this.top_,
      this.right_,
      this.bottom_,
      this.tx_,
      this.ty_,
      this.tz_,
      this.sx_,
      this.sy_,
      this.rpkg_,
      this.rtype_,
      this.rentry_,
      this.desc_,
      this.text_,
      parent,
      children
    );
  }
}

export class DxDecorView extends DxView {
  public static readonly NAME = 'com.android.internal.policy.DecorView';
  constructor(width: number, height: number) {
    super(
      DxDecorView.NAME,
      DefaultFlags,
      0, 0, width, height,
      0, 0, 0, 0, 0
    );
  }
  copy(): DxDecorView {
    return new DxDecorView(
      this.width,
      this.height
    );
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

  installDecor(width: number, height: number): void {
    this.decor = new DxDecorView(width, height);
  }

  replaceDecor(decor: DxDecorView): void {
    this.decor = decor;
  }

  findViewByXY(x: number, y: number, visible = true): DxView | null {
    if (!this.decor) {
      return null;
    }
    return this.decor.findViewByXY(x, y, visible);
  }
}