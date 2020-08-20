import { Command, IFlags } from './deps.ts';
import dxRec from './dxrec.ts';
import dxPlay, { DxPlayerType } from './dxplay.ts';

const NAME = 'dx.ts';
const VERSION = '0.1';
const TAG = 'DxRecorder';
const DECODE = true;

const prog = new Command();

prog.name(NAME).version(VERSION);

prog
  .description('directorx: record and replay for Android Platform')
  .allowEmpty(false)
  .throwErrors();

prog
  .command('rec <app>')
  .description('Record as a dxpk')
  .option('-s, --serial <type:string>', 'serial no')
  .option('-o, --output <type:string>', 'output dxpk', {
    default: 'out.dxpk',
  })
  .option('-v, --verbose [type:boolean]', 'output verbose information')
  .action(
    async ({ serial, output, verbose }: IFlags, app: string): Promise<void> => {
      await dxRec({
        serial: serial as string | undefined,
        app,
        dxpk: output as string,
        decode: DECODE,
        tag: TAG,
        verbose: verbose as boolean | undefined,
      });
    }
  );

prog
  .command('play <dxpk>')
  .description('Replay an dxpk')
  .option('-s, --serial <type:string>', 'serial no')
  .option(
    '-p, --player <type:string>',
    'which player to use, one of [px, pt, wdg, res]',
    {
      default: 'px',
    }
  )
  .option(
    '-K, --lookahead <type:number>',
    'Look ahead constant, required when player is res'
  )
  .option(
    '-H, --autohide [type:boolean]',
    'automatically hide soft keyboard before firing each event',
    {
      default: true,
    }
  )
  .option('-v, --verbose [type:boolean]', 'output verbose information')
  .action(
    async (
      { serial, player, lookahead, verbose, autohide }: IFlags,
      dxpk: string
    ): Promise<void> => {
      await dxPlay({
        serial: serial as string | undefined,
        pty: player as DxPlayerType,
        dxpk,
        K: lookahead as number | undefined,
        decode: DECODE,
        verbose: verbose as boolean | undefined,
        autoHideSoftKeyboard: autohide as boolean | undefined,
      });
    }
  );

try {
  await prog.parse(Deno.args);
} catch (e) {
  console.error(e);
}
