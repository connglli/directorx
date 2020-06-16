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
}

export class DxTapEvent {
  public readonly ty = 'tap';
  constructor(
    public readonly a: DxActivity,
    public readonly x: number,
    public readonly y: number,
    public readonly t: number
  ) {}
}

export class DxLongTapEvent {
  public readonly ty = 'long-tap';
  constructor(
    public readonly a: DxActivity,
    public readonly x: number,
    public readonly y: number,
    public readonly t: number,
  ) {}
}

export class DxDoubleTapEvent {
  public readonly ty = 'double-tap';
  constructor(
    public readonly a: DxActivity,
    public readonly x: number,
    public readonly y: number,
    public readonly t: number,
  ) {}
}

export class DxSwipeEvent {
  public readonly ty = 'swipe';
  constructor(
    public readonly a: DxActivity,
    public readonly x: number,
    public readonly y: number,
    public readonly dx: number,
    public readonly dy: number,
    public readonly t0: number,
    public readonly t1: number,
  ) {}
}

export class DxKeyEvent {
  public readonly ty = 'key';
  constructor(
    public readonly a: DxActivity,
    public readonly c: number,
    public readonly k: string,
    public readonly t: number,
  ) {}
}