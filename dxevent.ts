import { DxActivity } from './dxview.ts';

export default DxEvent;
interface DxEvent {
  readonly a: DxActivity;
}

export class DxTapEvent implements DxEvent {
  constructor(
    public readonly a: DxActivity,
    public readonly x: number,
    public readonly y: number,
    public readonly t: number
  ) {}
}

export class DxLongTapEvent implements DxEvent {
  constructor(
    public readonly a: DxActivity,
    public readonly x: number,
    public readonly y: number,
    public readonly t: number,
  ) {}
}

export class DxDoubleTapEvent implements DxEvent {
  constructor(
    public readonly a: DxActivity,
    public readonly x: number,
    public readonly y: number,
    public readonly t: number,
  ) {}
}

export class DxSwipeEvent implements DxEvent {
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

export class DxKeyEvent implements DxEvent {
  constructor(
    public readonly a: DxActivity,
    public readonly c: number,
    public readonly k: string,
    public readonly t: number,
  ) {}
}