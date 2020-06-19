import { DxActivity } from './dxview.ts';

export type DxEventType = 
  | 'tap'
  | 'long-tap'
  | 'double-tap'
  | 'swipe'
  | 'key';

export default DxEvent;
interface DxEvent {
  readonly a: DxActivity;
  readonly ty: DxEventType;
  readonly t: number;
  copy(a: DxActivity): DxEvent;
}

export class DxTapEvent implements DxEvent {
  public readonly ty = 'tap';
  constructor(
    public readonly a: DxActivity,
    public readonly x: number,
    public readonly y: number,
    public readonly t: number
  ) {}
  copy(a: DxActivity = this.a): DxEvent {
    return new DxTapEvent(
      a, this.x, this.y, this.t
    );
  }
}

export class DxLongTapEvent implements DxEvent {
  public readonly ty = 'long-tap';
  constructor(
    public readonly a: DxActivity,
    public readonly x: number,
    public readonly y: number,
    public readonly t: number,
  ) {}
  copy(a: DxActivity = this.a): DxEvent {
    return new DxLongTapEvent(
      a, this.x, this.y, this.t
    );
  }
}

export class DxDoubleTapEvent implements DxEvent {
  public readonly ty = 'double-tap';
  constructor(
    public readonly a: DxActivity,
    public readonly x: number,
    public readonly y: number,
    public readonly t: number,
  ) {}
  copy(a: DxActivity = this.a): DxEvent {
    return new DxDoubleTapEvent(
      a, this.x, this.y, this.t
    );
  }
}

export class DxSwipeEvent implements DxEvent {
  public readonly ty = 'swipe';
  public readonly t: number;
  constructor(
    public readonly a: DxActivity,
    public readonly x: number,
    public readonly y: number,
    public readonly dx: number,
    public readonly dy: number,
    public readonly t0: number,
    public readonly t1: number,
  ) {
    this.t = t0;
  }
  copy(a: DxActivity = this.a): DxEvent {
    return new DxSwipeEvent(
      a, 
      this.x, this.y, 
      this.dx, this.dy,
      this.t0, this.t1
    );
  }
}

export class DxKeyEvent implements DxEvent {
  public readonly ty = 'key';
  constructor(
    public readonly a: DxActivity,
    public readonly c: number,
    public readonly k: string,
    public readonly t: number,
  ) {}
  copy(a: DxActivity = this.a): DxEvent {
    return new DxKeyEvent(
      a, this.c, this.k, this.t 
    );
  }
}