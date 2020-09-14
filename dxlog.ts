import { log } from './deps.ts';

const __unused = log.getLogger('default');
type Logger = typeof __unused;
type LogLevels = typeof __unused.levelName;

const DX_LG_NAME = 'directorx';
const DX_LG_FMT = '{msg}';
const DX_LG_DEFAULT_LEVEL = 'INFO';

async function setupLogger(level: LogLevels): Promise<Logger> {
  await log.setup({
    handlers: {
      console: new log.handlers.ConsoleHandler('DEBUG', {
        formatter: DX_LG_FMT,
      }),
    },
    loggers: {
      [DX_LG_NAME]: {
        level: level,
        handlers: ['console'],
      },
    },
  });
  return log.getLogger(DX_LG_NAME);
}

let dxLogger = await setupLogger(DX_LG_DEFAULT_LEVEL);

export interface CustomLogger {
  debug(msg: string): void;
  info(msg: string): void;
  warning(msg: string): void;
  error(msg: string): void;
  critical(msg: string): void;
}

let alsoLogger: CustomLogger | null = null;

const DxLog = {
  also(logger: CustomLogger) {
    alsoLogger = logger;
  },
  debug(msg: string): void {
    dxLogger.debug(msg);
    alsoLogger?.debug(msg);
  },
  info(msg: string): void {
    dxLogger.info(msg);
    alsoLogger?.info(msg);
  },
  warning(msg: string): void {
    dxLogger.warning(msg);
    alsoLogger?.warning(msg);
  },
  error(msg: string): void {
    dxLogger.error(msg);
    alsoLogger?.error(msg);
  },
  critical(msg: string): void {
    dxLogger.critical(msg);
    alsoLogger?.critical(msg);
  },
  getLevel(): LogLevels {
    return dxLogger.levelName;
  },
  async setLevel(level: LogLevels): Promise<void> {
    dxLogger = await setupLogger(level);
  },
};

export default DxLog;
