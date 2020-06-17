import { readLines } from './base/deps.ts';
import DxEvent, { 
  DxTapEvent,
  DxLongTapEvent,
  DxDoubleTapEvent,
  DxSwipeEvent, 
  DxKeyEvent
} from './dxevent.ts';
import DxLog from './dxlog.ts';
import DxView, { 
  DefaultFlags, 
  DxViewVisibility, 
  DxActivity, 
  DxDecorView
} from './dxview.ts';
import * as base64 from './utils/base64.ts';
import LinkedList from './utils/linked_list.ts';
import KnaryTree from './utils/knary_tree.ts';
import { IllegalStateException } from './utils/exp.ts';

class ViewCache {
  private cache: LinkedList<DxView> = new LinkedList<DxView>();

  get(): DxView {
    if (this.cache.isEmpty()) {
      return new DxView('', DefaultFlags, 0, 0, 0, 0);
    }
    return this.cache.remove(0);
  }

  put(v: DxView): void {
    this.cache.push_front(v);
  }
}

class ActivityPack extends DxActivity {
  constructor(
    app: string,
    name: string,
    public readonly indTree: KnaryTree<number>
  ) {
    super(app, name);
  }
}

class EventPack {
  constructor(
    public readonly e: DxEvent, 
    public readonly ap: ActivityPack
  ) {}
}

type DxpkFields = {
  app: string;
  vpool: DxView[];
  eseq: EventPack[];
}

class DXPK {
  private static readonly ENCODER = new TextEncoder();
  private static readonly DECODER = new TextDecoder();

  private static readonly STATE_ACT = 1; // read app next
  private static readonly STATE_PSZ = 2; // read pool_size next
  private static readonly STATE_POL = 3; // read pool item (view) next
  private static readonly STATE_SSZ = 4; // read seq_size next
  private static readonly STATE_SEQ = 5; // read seq item (event) next
  private static readonly STATE_DNE = 6; // no long read

  /** Parse an dxpk file and return */
  static async load(path: string): Promise<DxpkFields> {
    // TODO throw meaningful exception and 
    // add semantic checking
    const vpool: DxView[] = [];
    const eseq: EventPack[] = [];
    let app = '';

    const dxpk = await Deno.open(path, {read: true});

    let state = DXPK.STATE_ACT;
    let size = 0;
    for await (const l of readLines(dxpk)) {
      if (state == DXPK.STATE_ACT) {
        app = l.trim();
        state = DXPK.STATE_PSZ;
      } else if (state == DXPK.STATE_PSZ) {
        size = Number(l.trim());
        state = DXPK.STATE_POL;
      } else if (state == DXPK.STATE_POL) {
        const tokens = l.trim().split(';');
        if (tokens[0] == DxDecorView.NAME) {
          vpool.push(new DxDecorView(
            Number(tokens[4]),
            Number(tokens[5]),
            Number(tokens[6]),
            Number(tokens[7]),
          ));
        } else {
          vpool.push(new DxView(
            tokens[0],
            {
              v: tokens[10][0] == 'V' 
                ? DxViewVisibility.VISIBLE 
                : tokens[10][0] == 'I'
                  ? DxViewVisibility.INVISIBLE
                  : DxViewVisibility.GONE,
              f: tokens[10][1] == 'F',
              e: tokens[10][2] == 'E',
              d: tokens[10][3] == 'D',
              hs: tokens[10][4] == 'H',
              vs: tokens[10][5] == 'V',
              c: tokens[10][6] == 'C',
              lc: tokens[10][7] == 'L',
              cc: tokens[10][8] == 'X'
            },
            Number(tokens[4]),
            Number(tokens[5]),
            Number(tokens[6]),
            Number(tokens[7]),
            tokens[1],
            tokens[2],
            tokens[3],
            base64.decode(tokens[8]),
            base64.decode(tokens[9])
          ));
        }
        size -= 1;
        if (size == 0) {
          state = DXPK.STATE_SSZ;
        }
      } else if (state == DXPK.STATE_SSZ) {
        size = Number(l.trim());
        state = DXPK.STATE_SEQ;
      } else if (state == DXPK.STATE_SEQ) {
        const tokens = l.trim().split(';');
        const app = tokens[0];
        const name = tokens[1];
        let [ind, nc] = tokens[2].split(',').map(t => Number(t));
        const tree = new KnaryTree<number>(ind);
        const stack: number[] = [nc];
        let parent: KnaryTree<number> | null = tree;
        let i = 3;
        while (parent != null) {
          [ind, nc] = tokens[i].split(',').map((t) => Number(t));
          const curr = new KnaryTree<number>(ind);
          parent.addChildTree(curr);
          if (nc != 0) {
            parent = curr;
            stack.push(nc);
          } else {
            nc = stack.pop() as number;
            nc -= 1;
            while (nc == 0 && parent != null) {
              parent = parent.parent;
              nc = stack.pop() as number;
              nc -= 1;
            }
            if (nc != 0) {
              stack.push(nc);
            }
          }
          i += 1;
        }
        const ap = new ActivityPack(app, name, tree);
        let e: DxEvent;
        switch (tokens[i]) {
        case 'tap':
          e = new DxTapEvent(
            ap, 
            Number(tokens[i+1]),
            Number(tokens[i+2]),
            Number(tokens[i+3]),
          );
          break;
        case 'double-tap':
          e = new DxDoubleTapEvent(
            ap, 
            Number(tokens[i+1]),
            Number(tokens[i+2]),
            Number(tokens[i+3]),
          );
          break;
        case 'long-tap':
          e = new DxLongTapEvent(
            ap, 
            Number(tokens[i+1]),
            Number(tokens[i+2]),
            Number(tokens[i+3]),
          );
          break;
        case 'swipe':
          e = new DxSwipeEvent(
            ap, 
            Number(tokens[i+1]),
            Number(tokens[i+2]),
            Number(tokens[i+3]),
            Number(tokens[i+4]),
            Number(tokens[i+5]),
            Number(tokens[i+6])
          );
          break;
        case 'key':
          e = new DxKeyEvent(
            ap, 
            Number(tokens[i+2]),
            tokens[i+1],
            Number(tokens[i+3]),
          );
          break;
        default:
          throw new IllegalStateException(`Unsupported event type: ${tokens[i]}`);
        }
        eseq.push(new EventPack(e, ap));
        size -= 1;
        if (size == 0) {
          state = DXPK.STATE_DNE;
        }
      }
    }

    await dxpk.close();

    return {
      app,
      vpool,
      eseq
    };
  }

  /** Dump dxpk to file
   * 
   * File format:
   *      app
   *      M # vpool_size
   *      v1 # cls;resType;...
   *      v2
   *      ...
   *      vM
   *      N # eseq_size 
   *      e1 # tree;type;...
   *      e2
   *      ...
   *      eN
   */
  static async dump(path: string, dxpk: DxpkFields): Promise<void> {
    const buf = new Deno.Buffer();

    await DXPK.writeString(buf, dxpk.app);
    await DXPK.writeNumber(buf, dxpk.vpool.length);
    for (const v of dxpk.vpool) {
      await DXPK.writeString(buf, `${v.cls};${v.resPkg};${v.resType};${v.resId};`, false);
      await DXPK.writeString(buf, `${v.left};${v.top};${v.right};${v.bottom};`, false);
      await DXPK.writeString(buf, `${base64.encode(v.desc)};${base64.encode(v.text)};`, false);
      let flags = '';
      flags += v.flags.v == DxViewVisibility.VISIBLE 
        ? 'V' 
        : v.flags.v == DxViewVisibility.INVISIBLE 
          ? 'I' 
          : 'G';
      flags += v.flags.f ? 'F' : '.';
      flags += v.flags.e ? 'E' : '.';
      flags += v.flags.d ? 'D' : '.';
      flags += v.flags.hs ? 'H' : '.';
      flags += v.flags.vs ? 'V' : '.';
      flags += v.flags.c ? 'C' : '.';
      flags += v.flags.lc ? 'L' : '.';
      flags += v.flags.cc ? 'X' : '.';
      await DXPK.writeString(buf, flags);
    }
    await DXPK.writeNumber(buf, dxpk.eseq.length);
    for (const ep of dxpk.eseq) {
      await DXPK.writeString(buf, `${ep.ap.app};${ep.ap.name};`, false);
      await ep.ap.indTree.accept(async (n: KnaryTree<number>): Promise<void> => {
        await DXPK.writeString(buf, `${n.value},${n.childrenCount};`, false);
      });
      await DXPK.writeString(buf, ep.e.ty + ';', false);
      if (ep.e.ty == 'tap') {
        const e = ep.e as DxTapEvent;
        await DXPK.writeString(buf, `${e.x};${e.y};${e.t}`);
      } else if (ep.e.ty == 'double-tap') {
        const e = ep.e as DxDoubleTapEvent;
        await DXPK.writeString(buf, `${e.x};${e.y};${e.t}`);
      } else if (ep.e.ty == 'long-tap') {
        const e = ep.e as DxLongTapEvent;
        await DXPK.writeString(buf, `${e.x};${e.y};${e.t}`);
      } else if (ep.e.ty == 'swipe') {
        const e = ep.e as DxSwipeEvent;
        await DXPK.writeString(buf, `${e.x};${e.y};${e.dx};${e.dy};${e.t0};${e.t1}`);
      } else if (ep.e.ty == 'key') {
        const e = ep.e as DxKeyEvent;
        await DXPK.writeString(buf, `${e.k};${e.c};${e.t}`);
      } else {
        throw new IllegalStateException(`Unsupported event type: ${ep.e.ty}`);
      }
    }

    await Deno.writeFile(path, buf.bytes());
  }

  static async writeNumber(buf: Deno.Buffer, x: number, newline=true) {
    await DXPK.writeString(buf, String(x), newline);
  }

  static async writeString(buf: Deno.Buffer, str: string, newline=true) {
    await buf.write(DXPK.ENCODER.encode(str + (newline ? '\n' : '')));
  }
}

export default class DxPacker {
  // cache unused views
  private readonly cache: ViewCache = new ViewCache();

  // view pool: views that are same 
  // are saved only 1 copy
  private readonly vpool: DxView[] = [];
  // event sequence: one by one
  private readonly eseq: EventPack[] = [];
  
  constructor(
    private readonly app: string,
  ) {}

  get viewPool(): DxView[] {
    return this.vpool.slice(0);
  }

  get eventSeq(): EventPack[] {
    return this.eseq.slice(0);
  }

  append(e: DxEvent): void {
    this.infoLog(e);
    this.eseq.push(this.pack(e));
  }

  pack(e: DxEvent): EventPack {
    if (e.a.app != this.app) {
      throw new IllegalStateException(`Cannot pack events from other apps, the expected app is ${this.app}`);
    }
    const ap = this.packAct(e.a);
    return new EventPack(e, ap);
  }

  unpack(ep: EventPack): DxEvent {
    if (ep.ap.app != this.app) {
      throw new IllegalStateException(`Cannot unpack events from other apps, the expected app is ${this.app}`);
    }
    const a = this.unpackActP(ep.ap);
    return ep.e.copy(a);
  }

  newView(): DxView {
    return this.cache.get();
  }

  async save(path: string): Promise<void> {
    await DXPK.dump(path, {
      app: this.app,
      vpool: this.vpool.slice(),
      eseq: this.eseq.slice()
    });
  }

  static async load(path: string): Promise<DxPacker> {
    const dxpk = await DXPK.load(path);
    const packer = new DxPacker(dxpk.app);
    for (const v of dxpk.vpool) {
      packer.vpool.push(v as DxView);
    }
    for (const e of dxpk.eseq) {
      packer.eseq.push(e);
    }
    return packer;
  }

  private packAct(a: DxActivity): ActivityPack {
    const { app, name, decorView } = a;
    const tree = this.packView(decorView!); // eslint-disable-line
    const pack = new ActivityPack(app, name, tree);
    return pack;
  }

  private packView(v: DxView): KnaryTree<number> {
    v.detach(); // detach from its parent
    let ind = -1;
    for (const i in this.vpool) {
      if (this.viewEq(v, this.vpool[i])) {
        ind = Number(i);
        break;
      }
    }
    if (ind == -1) {
      ind = this.vpool.length;
      this.vpool.push(v);
    } else {
      this.cache.put(v);
    }
    const node = new KnaryTree<number>(ind);
    for (const c of v.children.slice(0)) {
      node.addChildTree(this.packView(c));
    }
    return node;
  }

  private unpackActP(ap: ActivityPack): DxActivity {
    const a = new DxActivity(ap.app, ap.name);
    const v = this.unpackViewP(ap.indTree);
    if (!(v instanceof DxDecorView)) {
      throw new IllegalStateException('Expect a DxDecorView as root');
    }
    a.replaceDecor(v as DxDecorView);
    return a;
  }

  private unpackViewP(ci: KnaryTree<number>): DxView {
    const v = this.vpool[ci.value];
    const cv: DxView = v.copy();
    for (const cci of ci.children()) {
      cv.addView(this.unpackViewP(cci));
    }
    return cv;
  }

  private viewEq(a: DxView, b: DxView) {
    return (
      a.cls == b.cls &&
      a.left == b.left &&
      a.right == b.right &&
      a.top == b.top &&
      a.bottom == b.bottom &&
      a.res == b.res &&
      a.desc == b.desc &&
      a.text == b.text &&
      a.flags.v == b.flags.v &&
      a.flags.f == b.flags.f &&
      a.flags.e == b.flags.e &&
      a.flags.d == b.flags.d &&
      a.flags.hs == b.flags.hs &&
      a.flags.vs == b.flags.vs &&
      a.flags.c == b.flags.c &&
      a.flags.lc == b.flags.lc &&
      a.flags.cc == b.flags.cc
    );
  }

  private findHitViews(v: DxView, x: number, y: number): DxView[] {
    if (!this.hitView(v, x, y)) {
      return [];
    }
    let hits: DxView[] = [v];
    for (const c of v.children) {
      hits = [...this.findHitViews(c, x, y), ...hits];
    }
    return hits;
  }

  private hitView(v: DxView, x: number, y: number): boolean {
    const { flags, left, right, top, bottom } = v;
    return (
      flags.v == DxViewVisibility.VISIBLE && 
      left <= x && x <= right && 
      top <= y && y <= bottom
    );
  }

  private infoLog(e: DxEvent) {
    /* eslint-disable */
    switch (e.ty) {
    case 'tap':
      this.infoLogInner(
        e,
        this.findHitViews(
          e.a.decorView!,
          (e as DxTapEvent).x,
          (e as DxTapEvent).y
        )
      );
      break;
    
    case 'double-tap':
      this.infoLogInner(
        e,
        this.findHitViews(
          e.a.decorView!,
          (e as DxDoubleTapEvent).x,
          (e as DxDoubleTapEvent).y
        )
      );
      break;

    case 'long-tap':
      this.infoLogInner(
        e,
        this.findHitViews(
          e.a.decorView!,
          (e as DxLongTapEvent).x,
          (e as DxLongTapEvent).y
        )
      );
      break;

    case 'swipe':
      this.infoLogInner(
        e,
        this.findHitViews(
          e.a.decorView!,
          (e as DxSwipeEvent).x,
          (e as DxSwipeEvent).y
        )
      );
      break;
  
    case 'key':
      this.infoLogInner(e, []);
      break;
    }
  }

  private infoLogInner(e: DxEvent, views: DxView[]) {
    if (views.length != 0) {
      const v = views[0];
      DxLog.debug(`${e.ty} cls=${v.cls} text="${v.text}" desc="${v.desc}"`);
    } else if (e.ty == 'key') {
      DxLog.debug(`${e.ty} ${(e as DxKeyEvent).k}`);
    }
  }
}

if (import.meta.main) {
  const dxpk = await DXPK.load('./gooexcal.dxpk');
  await DXPK.dump('./gooexcal2.dxpk', dxpk);
}