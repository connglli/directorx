export enum DxViewVisibility {
  VISIBLE,
  INVISIBLE,
  GONE
}

export type DxViewFlags = {
  v: DxViewVisibility; // visibility
  f: boolean;          // focusable
  e: boolean;          // enabled
  d: boolean;          // will draw?
  hs: boolean;         // horizontal scrollable
  vs: boolean;         // vertical scrollable
  c: boolean;          // clickable
  lc: boolean;         // long clickable
  cc: boolean;         // context clickable  
}

export const DefaultFlags: DxViewFlags = {
  v: DxViewVisibility.VISIBLE,
  f: false,
  e: true,
  d: true,
  hs: false,
  vs: false,
  c: false,
  lc: false,
  cc: false,
};

export default class DxView {
  constructor(
    private cls_: string,
    private flags_: DxViewFlags,
    private left_: number,
    private top_: number,
    private right_: number,
    private bottom_: number,
    private rpkg_ = '',
    private rtype_ = '',
    private rid_ = '',
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

  get res(): string {
    return `${this.resPkg}:${this.resType}/${this.resId}`;
  }

  get resPkg(): string {
    return this.rpkg_;
  }

  get resType(): string {
    return this.rtype_;
  }

  get resId(): string {
    return this.rid_;
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

  reset(
    cls: string,
    flags: DxViewFlags,
    left: number,
    top: number,
    right: number,
    bottom: number,
    rpkg = '',
    rtype = '',
    rid = '',
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
    this.rpkg_ = rpkg;
    this.rtype_ = rtype;
    this.rid_ = rid;
    this.desc_ = desc;
    this.text_ = text;
    this.parent_ = parent;
    this.children_ = children;
  }

  copy(): DxView {
    return new DxView(
      this.cls_,
      this.flags_,
      this.left_,
      this.top_,
      this.right_,
      this.bottom_,
      this.rpkg_,
      this.rtype_,
      this.rid_,
      this.desc_,
      this.text_
    );
  }
}

export class DxDecorView extends DxView {
  constructor(
    left: number,
    top: number,
    right: number,
    bottom: number,
  ) {
    super(
      'com.android.internal.policy.DecorView',
      DefaultFlags,
      left, top, right, bottom
    );
  }
}

export class DxActivity {
  private decor: DxDecorView | null = null;

  constructor(
    public readonly pkg: string, 
    public readonly name: string
  ) {}

  installDecor(
    left: number,
    top: number,
    right: number,
    bottom: number
  ): void {
    this.decor = new DxDecorView(left, top, right, bottom);
  }

  get decorView(): DxDecorView | null {
    return this.decor;
  }
}