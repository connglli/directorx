import type DxCompatUi from './ui/dxui.ts';
import Stack from './utils/stack.ts';

export type DxEventType =
  | 'tap'
  | 'long-tap'
  | 'double-tap'
  | 'swipe'
  | 'key'
  | 'text'
  | 'hsk';

export default DxEvent;
interface DxEvent {
  readonly ui: DxCompatUi;
  readonly ty: DxEventType;
  readonly t: number;
  copy(ui: DxCompatUi): DxEvent;
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
    public readonly ui: DxCompatUi,
    public readonly x: number,
    public readonly y: number,
    public readonly t: number
  ) {}
  copy(ui: DxCompatUi = this.ui): DxEvent {
    return new DxTapEvent(ui, this.x, this.y, this.t);
  }
  toString(): string {
    return `tap (${this.x}, ${this.y})`;
  }
}

export class DxLongTapEvent implements DxXYEvent {
  public readonly ty = 'long-tap';
  constructor(
    public readonly ui: DxCompatUi,
    public readonly x: number,
    public readonly y: number,
    public readonly t: number
  ) {}
  copy(ui: DxCompatUi = this.ui): DxEvent {
    return new DxLongTapEvent(ui, this.x, this.y, this.t);
  }
  toString(): string {
    return `long-tap (${this.x}, ${this.y})`;
  }
}

export class DxDoubleTapEvent implements DxXYEvent {
  public readonly ty = 'double-tap';
  constructor(
    public readonly ui: DxCompatUi,
    public readonly x: number,
    public readonly y: number,
    public readonly t: number
  ) {}
  copy(ui: DxCompatUi = this.ui): DxEvent {
    return new DxDoubleTapEvent(ui, this.x, this.y, this.t);
  }
  toString(): string {
    return `double-tap (${this.x}, ${this.y})`;
  }
}

export class DxSwipeEvent implements DxXYEvent {
  public readonly ty = 'swipe';
  public readonly t: number;
  constructor(
    public readonly ui: DxCompatUi,
    public readonly x: number,
    public readonly y: number,
    public readonly dx: number,
    public readonly dy: number,
    public readonly t0: number,
    public readonly t1: number
  ) {
    this.t = t0;
  }
  copy(ui: DxCompatUi = this.ui): DxEvent {
    return new DxSwipeEvent(
      ui,
      this.x,
      this.y,
      this.dx,
      this.dy,
      this.t0,
      this.t1
    );
  }
  toString(): string {
    return `swipe (${this.x}, ${this.y}) + (${this.dx}, ${this.dy})`;
  }
}

export class DxKeyEvent implements DxEvent {
  public readonly ty = 'key';
  constructor(
    public readonly ui: DxCompatUi,
    public readonly c: number,
    public readonly k: string,
    public readonly t: number
  ) {}
  copy(ui: DxCompatUi = this.ui): DxEvent {
    return new DxKeyEvent(ui, this.c, this.k, this.t);
  }
  toString(): string {
    return `key ${this.k}`;
  }
}

export class DxTextEvent implements DxEvent {
  public readonly ty = 'text';
  constructor(
    public readonly ui: DxCompatUi,
    public readonly x: string,
    public readonly t: number
  ) {}
  copy(ui: DxCompatUi = this.ui): DxEvent {
    return new DxTextEvent(ui, this.x, this.t);
  }
  toString(): string {
    return `text ${this.x}`;
  }
}

export class DxHideSoftKeyboardEvent implements DxEvent {
  public readonly ty = 'hsk';
  constructor(public readonly ui: DxCompatUi, public readonly t: number) {}
  copy(ui: DxCompatUi = this.ui): DxEvent {
    return new DxHideSoftKeyboardEvent(ui, this.t);
  }
  toString(): string {
    return `hide-soft-keyboard`;
  }
}

export class DxEvSeq extends Stack<DxEvent> {
  constructor(eventArray: DxEvent[]) {
    super(eventArray.reverse());
  }
}
