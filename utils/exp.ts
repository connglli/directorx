export class IllegalStateException {
  constructor(public readonly msg: string) {}
  toString(): string {
    return `IllegalState: ${this.msg}`;
  }
}