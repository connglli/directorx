import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.60.0/testing/asserts.ts';

export class StackError extends Error {}

export default class Stack<T> {
  constructor(
    // items: tail(0) => top(items.length-1)
    private readonly items: T[] = []
  ) {}

  empty(): boolean {
    return this.items.length == 0;
  }

  size(): number {
    return this.items.length;
  }

  top(): T | null {
    if (this.items.length == 0) {
      return null;
    }
    return this.items[this.items.length - 1];
  }

  topN(n: number): T[] {
    if (n > this.items.length) {
      n = this.items.length;
    }
    return this.items.slice(this.items.length - n).reverse();
  }

  pop(): T {
    if (this.items.length == 0) {
      throw new StackError('Stack is empty at present');
    }
    return this.items.pop() as T;
  }

  popN(n: number): T[] {
    const arr = [];
    for (let i = 0; i < n; i++) {
      arr.push(this.pop());
    }
    return arr;
  }

  push(...x: T[]): void {
    for (const i of x) {
      this.items.push(i);
    }
  }
}

if (import.meta.main) {
  const s = new Stack([1, 2, 3, 4, 5]);
  assertEquals(s.size(), 5);
  assertEquals(s.top(), 5);
  assertEquals(s.topN(3), [5, 4, 3]);
  let x = s.pop();
  assertEquals(x, 5);
  s.pop();
  s.pop();
  s.pop();
  x = s.pop();
  assertEquals(x, 1);
  assertEquals(s.size(), 0);
  try {
    s.pop();
  } catch (e) {
    assert(e instanceof StackError);
  }
  s.push(5);
  s.push(8);
  assertEquals(s.top(), 8);
  assertEquals(s.size(), 2);
  s.push(11, 12);
  assertEquals(s.top(), 12);
  assertEquals(s.size(), 4);
}
