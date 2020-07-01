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
  DxViewVisibility, 
  DxActivity, 
  DxDecorView,
  DxViewPager,
  DxTabHost,
  DxViewFactory,
  DxViewType
} from './dxview.ts';
import { DevInfo } from './dxadb.ts';
import * as base64 from './utils/base64.ts';
import KnaryTree from './utils/knary_tree.ts';
import { IllegalStateError, CannotReachHereError } from './utils/error.ts';
import LinkedList from './utils/linked_list.ts';

class ViewCache {
  private decorCache = new LinkedList<DxDecorView>();
  private pagerCache = new LinkedList<DxViewPager>();
  private tabCache = new LinkedList<DxTabHost>();
  private otherCache = new LinkedList<DxView>();

  get(type: DxViewType): DxView {
    let cache: LinkedList<DxView>;
    switch (type) {
    case DxViewType.DECOR:
      cache = this.decorCache;
      break;
    case DxViewType.VIEW_PAGER:
      cache = this.pagerCache;
      break;
    case DxViewType.TAB_HOST:
      cache = this.tabCache;
      break;
    case DxViewType.OTHERS:
      cache = this.otherCache;
      break;
    default:
      throw new CannotReachHereError();
    }
    if (cache.isEmpty()) {
      return DxViewFactory.create(type);
    } else {
      return cache.remove(0);
    }
  }

  put(v: DxView): void {
    switch (DxViewFactory.typeOf(v)) {
    case DxViewType.DECOR:
      return this.decorCache.push_front(v as DxDecorView);
    case DxViewType.VIEW_PAGER:
      return this.pagerCache.push_front(v as DxViewPager);
    case DxViewType.TAB_HOST:
      return this.tabCache.push_front(v as DxTabHost);
    case DxViewType.OTHERS:
      return this.otherCache.push_front(v);
    default:
      throw new CannotReachHereError();
    }
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
  dev: DevInfo;
  vpool: DxView[];
  eseq: EventPack[];
}

class DXPK {
  private static readonly ENCODER = new TextEncoder();
  private static readonly DECODER = new TextDecoder();

  private static readonly STATE_DEV = 0; // read dev info next
  private static readonly STATE_APP = 1; // read app next
  private static readonly STATE_PSZ = 2; // read pool_size next
  private static readonly STATE_POL = 3; // read pool item (view) next
  private static readonly STATE_SSZ = 4; // read seq_size next
  private static readonly STATE_SEQ = 5; // read seq item (event) next
  private static readonly STATE_DNE = 6; // no long read

  private static type2str(t: DxViewType): string {
    switch (t) {
    case DxViewType.DECOR: return 'd';
    case DxViewType.VIEW_PAGER: return 'p';
    case DxViewType.TAB_HOST: return 't';
    case DxViewType.OTHERS: return '.';
    default: throw new CannotReachHereError();
    }
  }

  private static str2type(s: string): DxViewType {
    switch (s) {
    case 'd': return DxViewType.DECOR;
    case 'p': return DxViewType.VIEW_PAGER;
    case 't': return DxViewType.TAB_HOST;
    case '.': return DxViewType.OTHERS;
    default: throw new CannotReachHereError();
    }
  }


  /** Parse an dxpk file and return */
  static async load(path: string): Promise<DxpkFields> {
    // TODO throw meaningful exception and 
    // add semantic checking
    const vpool: DxView[] = [];
    const eseq: EventPack[] = [];
    let app = '';
    let dev: DevInfo | null = null;

    const dxpk = await Deno.open(path, {read: true});

    let state = DXPK.STATE_DEV;
    let size = 0;
    for await (const l of readLines(dxpk)) {
      if (state == DXPK.STATE_DEV) {
        const tokens = l.trim().split(';');
        dev = new DevInfo(
          tokens[3],
          tokens[0],
          tokens[1],
          tokens[2],
          Number(tokens[4]),
          Number(tokens[5]),
          Number(tokens[6]),
          Number(tokens[7]),
          Number(tokens[8])
        );
        state = DXPK.STATE_APP;
      } else if (state == DXPK.STATE_APP) {
        app = l.trim();
        state = DXPK.STATE_PSZ;
      } else if (state == DXPK.STATE_PSZ) {
        size = Number(l.trim());
        state = DXPK.STATE_POL;
      } else if (state == DXPK.STATE_POL) {
        const tokens = l.trim().split(';');
        const type = DXPK.str2type(tokens[0]);
        const view = DxViewFactory.create(type);
        view.reset(
          app,                               // pkg
          tokens[1],                         // cls
          {                                  // flags
            V: tokens[18][0] == 'V' 
              ? DxViewVisibility.VISIBLE
              : tokens[18][0] == 'I'
                ? DxViewVisibility.INVISIBLE
                : DxViewVisibility.GONE,
            f:  tokens[18][1] == 'F',
            F:  tokens[18][2] == 'F',
            S:  tokens[18][3] == 'S',
            E:  tokens[18][4] == 'E',
            d:  tokens[18][5] == 'D',
            hs: tokens[18][6] == 'H',
            vs: tokens[18][7] == 'V',
            c:  tokens[18][8] == 'C',
            lc: tokens[18][9] == 'L',
            cc: tokens[18][10] == 'X'
          },
          tokens[16],                        // bgClass
          tokens[17] == '.'                  // bgColor
            ? null : 
            Number(tokens[17]),
          Number(tokens[5]),                 // left
          Number(tokens[6]),                 // top
          Number(tokens[7]),                 // right
          Number(tokens[8]),                 // bottom
          Number(tokens[9]),                 // tx
          Number(tokens[10]),                // ty
          Number(tokens[11]),                // tz
          Number(tokens[12]),                // sx
          Number(tokens[13]),                // sy
          tokens[2],                         // resPkg
          tokens[3],                         // resType
          tokens[4],                         // resEntry
          base64.decode(tokens[14]),         // desc
          base64.decode(tokens[15])          // text
        );
        if (view instanceof DxViewPager) {
          view.currItem = Number(tokens[19]);
        } else if (view instanceof DxTabHost) {
          view.currTab = Number(tokens[19]);
        }
        vpool.push(view);
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
          throw new IllegalStateError(`Unsupported event type: ${tokens[i]}`);
        }
        eseq.push(new EventPack(e, ap));
        size -= 1;
        if (size == 0) {
          state = DXPK.STATE_DNE;
        }
      }
    }

    await dxpk.close();

    return { app, dev: dev!, vpool, eseq }; // eslint-disable-line
  }

  /** Dump dxpk to file
   * 
   * File format:
   *      dev # brand;model;...
   *      app # pkg
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

    await DXPK.writeString(buf, `${dxpk.dev.brand};${dxpk.dev.model};`, false);
    await DXPK.writeString(buf, `${dxpk.dev.abi};${dxpk.dev.board};`, false);
    await DXPK.writeString(buf, `${dxpk.dev.width};${dxpk.dev.height};${dxpk.dev.dpi};`, false);
    await DXPK.writeString(buf, `${dxpk.dev.sdk};${dxpk.dev.release}`);
    await DXPK.writeString(buf, dxpk.app);
    await DXPK.writeNumber(buf, dxpk.vpool.length);
    for (const v of dxpk.vpool) {
      const type = DxViewFactory.typeOf(v);
      await DXPK.writeString(buf, `${DXPK.type2str(type)};`, false);
      await DXPK.writeString(buf, `${v.cls};${v.resPkg};${v.resType};${v.resEntry};`, false);
      await DXPK.writeString(buf, `${v.left};${v.top};${v.right};${v.bottom};`, false);
      await DXPK.writeString(buf, `${v.translationX};${v.translationY};${v.translationZ};`, false);
      await DXPK.writeString(buf, `${v.scrollX};${v.scrollY};`, false);
      await DXPK.writeString(buf, `${base64.encode(v.desc)};${base64.encode(v.text)};`, false);
      await DXPK.writeString(buf, `${v.bgClass};${v.bgColor ?? '.'};`, false);
      let flags = '';
      flags += v.flags.V == DxViewVisibility.VISIBLE 
        ? 'V' 
        : v.flags.V == DxViewVisibility.INVISIBLE 
          ? 'I' 
          : 'G';
      flags += v.flags.f ? 'F' : '.';
      flags += v.flags.F ? 'F' : '.';
      flags += v.flags.S ? 'S' : '.';
      flags += v.flags.E ? 'E' : '.';
      flags += v.flags.d ? 'D' : '.';
      flags += v.flags.hs ? 'H' : '.';
      flags += v.flags.vs ? 'V' : '.';
      flags += v.flags.c ? 'C' : '.';
      flags += v.flags.lc ? 'L' : '.';
      flags += v.flags.cc ? 'X' : '.';
      if (v instanceof DxViewPager) {
        await DXPK.writeString(buf, `${flags};`, false);
        await DXPK.writeString(buf, `${v.currItem}`);
      } else if (v instanceof DxTabHost) {
        await DXPK.writeString(buf, `${flags};`, false);
        await DXPK.writeString(buf, `${v.currTab}`);
      } else {
        await DXPK.writeString(buf, flags);
      }
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
        throw new IllegalStateError(`Unsupported event type: ${ep.e.ty}`);
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
    public readonly dev: DevInfo,
    public readonly app: string,
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
      throw new IllegalStateError(`Cannot pack events from other apps, the expected app is ${this.app}`);
    }
    const ap = this.packAct(e.a);
    return new EventPack(e, ap);
  }

  unpack(ep: EventPack): DxEvent {
    if (ep.ap.app != this.app) {
      throw new IllegalStateError(`Cannot unpack events from other apps, the expected app is ${this.app}`);
    }
    const a = this.unpackActP(ep.ap);
    return ep.e.copy(a);
  }

  newView(type: DxViewType): DxView {
    return this.cache.get(type);
  }

  async save(path: string): Promise<void> {
    await DXPK.dump(path, {
      app: this.app,
      dev: this.dev,
      vpool: this.vpool.slice(),
      eseq: this.eseq.slice()
    });
  }

  static async load(path: string): Promise<DxPacker> {
    const dxpk = await DXPK.load(path);
    const packer = new DxPacker(dxpk.dev, dxpk.app);
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
      throw new IllegalStateError('Expect a DxDecorView as root');
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
      a.translationX == b.translationX &&
      a.translationY == b.translationY &&
      a.translationZ == b.translationZ &&
      a.scrollX == b.scrollX &&
      a.scrollY == b.scrollY &&
      a.resId == b.resId &&
      a.desc == b.desc &&
      a.text == b.text &&
      a.flags.V == b.flags.V &&
      a.flags.f == b.flags.f &&
      a.flags.F == b.flags.F &&
      a.flags.S == b.flags.S &&
      a.flags.E == b.flags.E &&
      a.flags.d == b.flags.d &&
      a.flags.hs == b.flags.hs &&
      a.flags.vs == b.flags.vs &&
      a.flags.c == b.flags.c &&
      a.flags.lc == b.flags.lc &&
      a.flags.cc == b.flags.cc
    );
  }

  private infoLog(e: DxEvent) {
    /* eslint-disable */
    switch (e.ty) {
    case 'tap':
      this.infoLogInner(
        e,
        e.a.decorView!.findViewsByXY(
          (e as DxTapEvent).x,
          (e as DxTapEvent).y
        )
      );
      break;
    
    case 'double-tap':
      this.infoLogInner(
        e,
        e.a.decorView!.findViewsByXY(
          (e as DxDoubleTapEvent).x,
          (e as DxDoubleTapEvent).y
        )
      );
      break;

    case 'long-tap':
      this.infoLogInner(
        e,
        e.a.decorView!.findViewsByXY(
          (e as DxLongTapEvent).x,
          (e as DxLongTapEvent).y
        )
      );
      break;

    case 'swipe':
      this.infoLogInner(
        e,
        e.a.decorView!.findViewsByXY(
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
      DxLog.debug(`${e.toString()} cls=${v.cls} id="${v.resId}" text="${v.text}" desc="${v.desc}" x=${v.x}-${v.x + v.width} y=${v.y}-${v.y + v.height} z=${v.z}`);
    } else if (e.ty == 'key') {
      DxLog.debug(e.toString());
    }
  }
}

if (import.meta.main) {
  const dxpk = await DXPK.load('./calculator2.dxpk');
  await DXPK.dump('./calculator22.dxpk', dxpk);
}