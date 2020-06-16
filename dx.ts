#! /usr/bin/env -S deno run --allow-net --allow-write --allow-run --unstable

import { Command, IFlags } from './deps.ts';
import dxRec from './dxrec.ts';

const NAME = 'dx.ts';
const VERSION = '0.1';
const TAG = 'DxRecorder';

const prog = new Command();
  
prog
  .name(NAME)
  .version(VERSION);

prog
  .description('directorx: record and replay for Android Platform')
  .allowEmpty(false);

prog
  .command('rec <app>')
  .option('-o, --output <type:string>', 'output file', {
    default: 'out.dxpk'
  })
  .option('-d, --decode', 'decode text/desc or not', {
    default: true
  })
  .action(async ({ output, decode }: IFlags, app: string): Promise<void> => {
    await dxRec({
      app,
      dxpk: output as string,
      decode: decode as boolean,
      tag: TAG
    });
  });

await prog.parse(Deno.args);