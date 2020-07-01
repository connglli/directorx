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

export class ProcessError extends Error {
  constructor(
    public readonly code: number,
    public readonly err: string
  ) {
    super(`ProcessException[code=${code}]: ${err}`);
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
  // Fix: see also https://github.com/denoland/deno/issues/2505
  // the subprocess maintains a buffer up to 64K, and once the 
  // buffer is full, the subprocess is blocked until someone
  // reads some; so for non-blocking, read all output firstly
  // even though it is so space-consuming (considering most
  // commands are succeeded, it is not that space-consuming)
  const rawOut = await proc.output();
  const { code } = await proc.status();
  let out: string;
  if (code == 0) {
    out = new TextDecoder().decode(rawOut);
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
      throw new ProcessError(code, err);
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

/** Execute shell commands by 
 * (1) exec-out and 
 * (2) returning its outputs (exec-out always return 0)
 */
export async function execOut(
  cmd: string,
  gOpt?: AdbGlobalOptions,
): Promise<string> {
  return (await exec(`exec-out ${cmd}`, gOpt)).out;
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

export type LogcatBuffer = 
  | 'main'
  | 'system'
  | 'radio'
  | 'events'
  | 'crash'
  | 'default'
  | 'all';

export type LogcatBufferSize = {
  size: number;
  unit: 'K' | 'M';
}

export type LogcatOptions = {
  prio?: LogcatPrio;
  /** Set default filter to silent */
  silent?: boolean;
  /** Logcat format */
  formats?: LogcatFormat[];
  /** Clear and exit */
  clear?: boolean;
  /** Ring buffers to be logged */
  buffers?: LogcatBuffer[];
  /** Size of log ring buffer */
  bufSize?: LogcatBufferSize;
}

function makeLogcatCmd(
  tag = '*',
  opt: LogcatOptions = {},
): string {
  const {
    prio = 'V',
    silent = false,
    formats = [],
    clear = false,
    buffers = [],
    bufSize = null,
  } = opt;
  let cmd = 'logcat ';
  if (buffers.length > 0) {
    for (const buf of buffers) {
      cmd += `-b ${buf} `;
    }
  }
  if (clear) {
    return cmd + '--clear';
  }
  if (silent) {
    cmd += '-s ';
  }
  if (formats.length > 0) {
    for (const fm of formats) {
      cmd += `-v ${fm} `;
    }
  }
  if (bufSize) {
    cmd += `-G ${bufSize.size}${bufSize.unit} `;
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

export type AdbBindShape = {
  shell(cmd: string): Promise<AdbResult>;
  execOut(cmd: string): Promise<string>;
  logcat(tag?: string, opt?: LogcatOptions): Promise<AdbResult>;
  pl: {
    shell(cmd: string): AsyncIterableIterator<string>;
    execOut(cmd: string): AsyncIterableIterator<string>;
    logcat(
      tag?: string,
      opt?: LogcatOptions,
    ): AsyncIterableIterator<string>;
  };
};

export function bindAdb(gOpt: AdbGlobalOptions): AdbBindShape {
  return {
    async shell(cmd: string): Promise<AdbResult> {
      return await shell(cmd, gOpt);
    },

    async execOut(cmd: string): Promise<string> {
      return await execOut(cmd, gOpt);
    },

    async logcat(
      tag?: string,
      opt?: LogcatOptions,
    ): Promise<AdbResult> {
      return await logcat(tag, opt, gOpt);
    },

    pl: {
      async *shell(cmd: string): AsyncIterableIterator<string> {
        yield* pl.shell(cmd, gOpt);
      },

      async *execOut(cmd: string): AsyncIterableIterator<string> {
        yield* pl.execOut(cmd, gOpt);
      },

      async *logcat(
        tag?: string,
        opt?: LogcatOptions,
      ): AsyncIterableIterator<string> {
        yield* pl.logcat(tag, opt, gOpt);
      },
    },
  };
}