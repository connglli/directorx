export class NotImplementedError extends Error {
  constructor(component = '') {
    if (component.length > 0) {
      super(`Not implemented by far: ${component}`);
    } else {
      super('Not implemented by far');
    }
  }
}

export class CannotReachHereError extends Error {
  constructor(msg = '') {
    if (msg.length > 0) {
      super(`Cannot reach here: ${msg}`);
    } else {
      super('Cannot reach here');
    }
  }
}

export class IllegalStateError extends Error {
  constructor(msg: string) {
    super(`IllegalStateError: ${msg}`);
  }
}

export class TypeCastError extends Error {
  constructor(from: string, to: string) {
    super(`TypeCastError: cannot cast type ${from} to type ${to}`);
  }
}
