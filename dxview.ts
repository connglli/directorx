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

export default class DxView {
  constructor(
    public readonly cls: string,
    public readonly flags: DxViewFlags,
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

  
  addView(v: DxView): void {
    v.parent_ = this;
    this.children_.push(v);
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
      {
        v: DxViewVisibility.VISIBLE,
        f: false,
        e: true ,
        d: true,
        hs: false,
        vs: false,
        c: false,
        lc: false,
        cc: false
      },
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