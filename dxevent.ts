import { DxActivity } from './dxview.ts';
import Stack from './utils/stack.ts';

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

export interface DxXYEvent extends DxEvent {
  readonly x: number;
  readonly y: number;
}

export function isXYEvent(e: DxEvent): e is DxXYEvent {
  return 'x' in e && 'y' in e;
}

export class DxTapEvent implements DxXYEvent {
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
  toString(): string {
    return `tap (${this.x}, ${this.y})`;
  }
}

export class DxLongTapEvent implements DxXYEvent {
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
  toString(): string {
    return `long-tap (${this.x}, ${this.y})`;
  }
}

export class DxDoubleTapEvent implements DxXYEvent {
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
  toString(): string {
    return `double-tap (${this.x}, ${this.y})`;
  }
}

export class DxSwipeEvent implements DxXYEvent {
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
  toString(): string {
    return `swipe (${this.x}, ${this.y}) + (${this.dx}, ${this.dy})`;
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
  toString(): string {
    return `key ${this.k}`;
  }
}

export class DxEvSeq extends Stack<DxEvent> {
  constructor(eventArray: DxEvent[]) {
    super(eventArray.reverse());
  }
}