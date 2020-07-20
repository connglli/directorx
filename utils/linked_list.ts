import { assertEquals } from 'https://deno.land/std@0.60.0/testing/asserts.ts';

type LinkedListNode<T> = { 
  value: T;
  next: LinkedListNode<T> | null; 
};

export default class LinkedList<T> {
  private _size = 0;
  private _head: LinkedListNode<T> | null = null;
  private _tail: LinkedListNode<T> | null = null;
  
  get size(): number {
    return this._size;
  }

  isEmpty(): boolean {
    return this._size == 0;
  }

  get(i: number): T {
    return this.getNode(i).value;
  }

  remove(i: number): T {
    /* eslint-disable */
    if (i == 0) {
      const curr = this._head;
      this._head = this._head!.next;
      this._size -= 1;
      return curr!.value;
    }
    const prev = this.getNode(i - 1);
    const curr = prev!.next;
    prev!.next = curr!.next;
    this._size -= 1;
    return curr!.value;
  }

  insert(i: number, x: T) {
    if (i == 0) {
      this.pushFront(x);
    } else if (i == this._size - 1) {
      this.pushBack(x);
    } else {
      const curr: LinkedListNode<T> = { value: x, next: null };
      const prev = this.getNode(i - 1);
      curr.next = prev.next;
      prev.next = curr;
      this._size += 1;
    }
  }

  pushBack(x: T): void {
    if (this._size == 0) {
      this._head = { value: x, next: null };
      this._tail = this._head;
    } else {
      /* eslint-disable */
      this._tail!.next = { value: x, next: null};
      this._tail = this._tail!.next;
    }
    this._size += 1;
  }

  pushFront(x: T): void {
    if (this._size == 0) {
      this._head = { value: x, next: null };
      this._tail = this._head;
    } else {
      this._head = { value: x, next: this._head };
    }
    this._size += 1;
  }

  *[Symbol.iterator](): Iterator<T> {
    let curr = this._head;
    while (curr != null) {
      yield curr.value;
      curr = curr.next;
    }
  }

  private getNode(i: number): LinkedListNode<T> {
    /* eslint-disable */
    let curr: LinkedListNode<T> = this._head!;
    for (let ii = 0; ii < i; ii += 1) {
      curr = curr!.next!;
    }
    return curr!;
  }
}

if (import.meta.main) {
  const list1 = new LinkedList<number>();
  const array = [1, 5, 4];
  for (const a of array) {
    list1.pushBack(a);
  }
  assertEquals(list1.size, array.length);
  let i = 0;
  for (const b of list1) {
    assertEquals(b, array[i]);
    assertEquals(b, list1.get(i));
    i += 1;
  }

  const list2 = new LinkedList<number>();
  for (const i in array) {
    list2.insert(Number(i), array[Number(i)]);
  }
  assertEquals(list2.size, array.length);
  i = 0;
  for (const b of list2) {
    assertEquals(b, array[i]);
    assertEquals(b, list2.get(i));
    i += 1;
  }

  const at1 = list2.remove(1);
  assertEquals(at1, array[1]);
}