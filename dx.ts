import { Command, IFlags } from './deps.ts';
import dxRec from './dxrec.ts';
import dxPlay, { DxPlayerType } from './dxplay.ts';

const NAME = 'dx.ts';
const VERSION = '0.2.1';
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
  .version(VERSION)
  .description('Record as a dxpk')
  .option('-s, --serial <type:string>', 'serial no')
  .option('-o, --output <type:string>', 'output dxpk', {
    default: 'out.dxpk',
  })
  .option('-v, --verbose', 'output verbose information')
  .option('-L, --lhook <type:string>', 'path of the lifecycle hook used')
  .option('-G, --mylog <type:string>', 'path of the custom logger')
  .action(
    async (
      { serial, output, verbose, lhook, mylog }: IFlags,
      app: string
    ): Promise<void> => {
      await dxRec({
        serial: serial as string | undefined,
        app,
        dxpk: output as string,
        decode: DECODE,
        tag: TAG,
        verbose: verbose as boolean | undefined,
        lifecycleHookPath: lhook as string | undefined,
        customLoggerPath: mylog as string | undefined,
      });
    }
  );

prog
  .command('play <dxpk>')
  .version(VERSION)
  .description('Replay an dxpk')
  .option('-s, --serial <type:string>', 'serial no')
  .option(
    '-p, --player <type:string>',
    'which player to use, one of [px, pt, wdg, res]',
    {
      default: 'px',
    }
  )
  .option('-K, --lookahead <type:number>', 'Look ahead constant', {
    default: 1,
  })
  .option(
    '-H, --nohide',
    'do not automatically hide soft keyboard before firing each event'
  )
  .option('-L, --lhook <type:string>', 'path of the lifecycle hook used')
  .option('-P, --plugin <type:string>', 'path of the plugin used')
  .option('-U, --uinorm <type:string>', 'path of the ui normalizer used')
  .option('-S, --segnorm <type:string>', 'path of the segment normalizer used')
  .option('-M, --matcher <type:string>', 'path of the segment matcher used')
  .option('-R, --recogn <type:string>', 'path of the pattern recognizer used')
  .option('-v, --verbose', 'output verbose information')
  .action(
    async (
      {
        serial,
        player,
        lookahead,
        verbose,
        nohide,
        lhook,
        plugin,
        uinorm,
        segnorm,
        matcher,
        recogn,
      }: IFlags,
      dxpk: string
    ): Promise<void> => {
      await dxPlay({
        serial: serial as string | undefined,
        pty: player as DxPlayerType,
        dxpk,
        K: lookahead as number | undefined,
        decode: DECODE,
        verbose: verbose as boolean | undefined,
        lifecycleHookPath: lhook as string | undefined,
        dontHideSoftKeyboard: nohide as boolean | undefined,
        pluginPath: plugin as string | undefined,
        uiNormalizerPath: uinorm as string | undefined,
        segNormalizerPath: segnorm as string | undefined,
        matcherPath: matcher as string | undefined,
        recognizerPath: recogn as string | undefined,
      });
    }
  );

try {
  await prog.parse(Deno.args);
} catch (e) {
  console.error(e);
}
