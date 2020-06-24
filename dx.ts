#! /usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-run --unstable

import { Command, IFlags } from './deps.ts';
import dxRec from './dxrec.ts';
import dxPlay, { DxPlayerType } from './dxplay.ts';

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
  .allowEmpty(false)
  .throwErrors();

prog
  .command('rec <app>')
  .description('Record as a dxpk')
  .option('-s, --serial <type:string>', 'serial no')
  .option('-o, --output <type:string>', 'output dxpk', {
    default: 'out.dxpk'
  })
  .action(async ({ serial, output }: IFlags, app: string): Promise<void> => {
    await dxRec({
      serial: serial as (string | undefined),
      app,
      dxpk: output as string,
      decode: DECODE,
      tag: TAG
    });
  });

prog
  .command('play <dxpk>')
  .description('Replay an dxpk')
  .option('-s, --serial <type:string>', 'serial no')
  .option('-p, --player <type:string>', 'which player to use', {
    default: 'px'
  })
  .action(async ({ serial, player }: IFlags, dxpk: string): Promise<void> => {
    await dxPlay({ 
      serial: serial as (string | undefined),
      pty: player as DxPlayerType, 
      dxpk 
    });
  });

try {
  await prog.parse(Deno.args);
} catch (e) {
  console.error(e);
}