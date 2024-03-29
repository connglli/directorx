import type DxDroid from '../dxdroid.ts';
import type { DroidInput } from '../dxdroid.ts';
import DxLog from '../dxlog.ts';
import { isXYEvent } from '../dxevent.ts';
import { Views, ViewFinder } from '../ui/dxview.ts';
import { Segments, SegmentFinder, SegmentBottomUpFinder } from '../ui/dxseg.ts';
import * as DxAlgo from '../algo/mod.ts';
import * as DxAlgoDefaults from '../algo/defaults/mod.ts';
import * as Vectors from '../utils/vecutil.ts';
import * as Strings from '../utils/strutil.ts';
import * as Errors from '../utils/error.ts';
import type { ModuleGlobal } from '../utils/module/custom_module.ts';

/** The base global context of any directorx module */
export interface DxModuleGlobal extends ModuleGlobal {
  app: string;
  droid: DxDroid;
  input: DroidInput;
  algo: {
    base: typeof DxAlgo;
    defaults: typeof DxAlgoDefaults;
  };
  logger: typeof DxLog;
  utils: {
    Events: {
      isXYEvent: typeof isXYEvent;
    };
    Views: typeof Views;
    ViewFinder: typeof ViewFinder;
    Segments: typeof Segments;
    SegmentFinder: typeof SegmentFinder;
    SegmentBottomUpFinder: typeof SegmentBottomUpFinder;
    Vectors: typeof Vectors;
    Strings: typeof Strings;
    Errors: typeof Errors;
  };
}

/** Create a global context from droid */
export default function createModuleGlobal(
  app: string,
  droid: DxDroid
): DxModuleGlobal {
  return {
    app,
    droid,
    input: droid.input,
    algo: {
      base: DxAlgo,
      defaults: DxAlgoDefaults,
    },
    logger: DxLog,
    utils: {
      Events: {
        isXYEvent,
      },
      Views,
      ViewFinder,
      Segments,
      SegmentFinder,
      SegmentBottomUpFinder,
      Vectors,
      Strings,
      Errors,
    },
  };
}
