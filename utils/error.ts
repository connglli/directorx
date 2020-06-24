export class NotImplementedError extends Error {
  constructor() {
    super('Not implemented by far');
  }
}

export class CannotReachHereError extends Error {
  constructor() {
    super('Cannot reach here');
  }
}

export class IllegalStateError extends Error {
  constructor(msg: string) {
    super(`IllegalStateError: ${msg}`);
  }
}