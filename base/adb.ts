import { readLines } from './deps.ts';

export type AdbGlobalOptions = {
  /** Serial number */
  serial?: string;
}

export type AdbResult = {
  /** Status code */
  code: number;
  /** Stdout if code == 0 else Stderr */
  out: string;
}

export class ProcessException {
  public readonly code: number;
  public readonly err: string;

  constructor(code: number, err: string) {
    this.code = code;
    this.err = err;
  }

  toString(): string {
    return `ProcessException[code=${this.code}]: ${this.err}`;
  }
}

function makeAdbCmd(subCmd: string, opt: AdbGlobalOptions = {}): string[] {
  let cmd = 'adb ';
  const { serial } = opt;
  if (serial) {
    cmd += `-s ${serial} `;
  }
  cmd += subCmd;
  return cmd.split(/\s+/);
}

async function exec(
  subCmd: string,
  gOpt?: AdbGlobalOptions,
): Promise<AdbResult> {
  const proc = Deno.run({
    cmd: makeAdbCmd(subCmd, gOpt),
    stdout: 'piped',
    stderr: 'piped',
  });
  const { code } = await proc.status();
  let out: string;
  if (code == 0) {
    out = new TextDecoder().decode(await proc.output());
    proc.stderr.close(); // eslint-disable-line
  } else {
    out = new TextDecoder().decode(await proc.stderrOutput());
    proc.stdout.close();
  }
  proc.close();
  return { code, out };
}

async function* poll(
  subCmd: string,
  gOpt?: AdbGlobalOptions,
): AsyncIterableIterator<string> {
  const proc = Deno.run({
    cmd: makeAdbCmd(subCmd, gOpt),
    stdout: 'piped',
    stderr: 'piped',
  });
  yield* readLines(proc.stdout);
  const { code } = await proc.status();
  try {
    if (code != 0) {
      const err = new TextDecoder().decode(await proc.stderrOutput());
      proc.stdout.close();
      throw new ProcessException(code, err);
    }
    proc.stdout.close();
    proc.stderr.close();
  } finally {
    proc.close();
  }
}

/** Execute shell commands by returning its code and outputs */
export async function shell(
  cmd: string,
  gOpt?: AdbGlobalOptions,
): Promise<AdbResult> {
  return exec(`shell ${cmd}`, gOpt);
}

/** Execute shell commands by (1) exec-out and (2) returning its code and outputs */
export async function execOut(
  cmd: string,
  gOpt?: AdbGlobalOptions,
): Promise<AdbResult> {
  return exec(`exec-out ${cmd}`, gOpt);
}

export type LogcatFormat =
  | 'brief'
  | 'help'
  | 'long'
  | 'process'
  | 'raw'
  | 'tag'
  | 'thread'
  | 'threadtime'
  | 'time'  
  | 'color'
  | 'descriptive'
  | 'epoch'
  | 'monotonic'
  | 'printable'
  | 'uid'
  | 'usec'
  | 'UTC'
  | 'year'
  | 'zone';

export type LogcatPrio = 
  | 'V'
  | 'D'
  | 'I'
  | 'W'
  | 'E'
  | 'F'
  | 'S';

export type LogcatOptions = {
  prio?: LogcatPrio;
  /** Set default filter to silent */
  silent?: boolean;
  /** Logcat format */
  formats?: LogcatFormat[];
  /** Clear and exit */
  clear?: boolean;
};

function makeLogcatCmd(
  tag = '*',
  opt: LogcatOptions = {},
): string {
  const {
    prio = 'V',
    silent = false,
    formats = [],
    clear = false,
  } = opt;
  if (clear) {
    return 'logcat --clear';
  }
  let cmd = 'logcat ';
  if (silent) {
    cmd += '-s ';
  }
  if (formats.length > 0) {
    for (const fm of formats) {
      cmd += `-v ${fm} `;
    }
  }
  cmd += `${tag}:${prio}`;
  return cmd;
}

/** Get logcat logs, filter should like <tag>:<priority> */
export async function logcat(
  tag?: string,
  opt?: LogcatOptions,
  gOpt?: AdbGlobalOptions,
): Promise<AdbResult> {
  return exec(makeLogcatCmd(tag, opt), gOpt);
}

/** Execute commands by polling its outputs */
export const pl = {
  async *shell(
    cmd: string,
    gOpt?: AdbGlobalOptions,
  ): AsyncIterableIterator<string> {
    yield* poll(`shell ${cmd}`, gOpt);
  },

  async *execOut(
    cmd: string,
    gOpt?: AdbGlobalOptions,
  ): AsyncIterableIterator<string> {
    yield* poll(`exec-out ${cmd}`, gOpt);
  },

  async *logcat(
    tag?: string,
    opt?: LogcatOptions,
    gOpt?: AdbGlobalOptions
  ): AsyncIterableIterator<string> {
    yield* poll(makeLogcatCmd(tag, opt), gOpt);
  }
};