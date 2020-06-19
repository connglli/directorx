#! /usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-run --unstable

import { Command, IFlags } from './deps.ts';
import dxRec from './dxrec.ts';
import dxPlay, { DxPlayerType } from './dxplay.ts';
import DxLog from './dxlog.ts';

const NAME = 'dx.ts';
const VERSION = '0.1';
const TAG = 'DxRecorder';
const DECODE = true;

const prog = new Command();
  
prog
  .name(NAME)
  .version(VERSION);

prog
  .description('directorx: record and replay for Android Platform')
  .allowEmpty(false);

prog
  .command('rec <app>')
  .description('Record as a dxpk')
  .option('-o, --output <type:string>', 'output dxpk', {
    default: 'out.dxpk'
  })
  .action(async ({ output }: IFlags, app: string): Promise<void> => {
    try {
      await dxRec({
        app,
        dxpk: output as string,
        decode: DECODE,
        tag: TAG
      });
    } catch (t) {
      DxLog.critical(t);
    }
  });

prog
  .command('play <dxpk>')
  .description('Replay an dxpk')
  .option('-p, --player <type:string>', 'which player to use', {
    default: 'px'
  })
  .action(async ({ player }: IFlags, dxpk: string): Promise<void> => {
    try {
      await dxPlay({ pty: player as DxPlayerType, dxpk });
    } catch (t) {
      DxLog.critical(t);
    }
  });

await prog.parse(Deno.args);