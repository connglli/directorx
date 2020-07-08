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

const DxLog = {
  debug(msg: string): void { 
    dxLogger.debug(msg);
  },
  info(msg: string): void { 
    dxLogger.info(msg);
  },
  warning(msg: string): void { 
    dxLogger.warning(msg);
  },
  error(msg: string): void { 
    dxLogger.error(msg);
  },
  critical(msg: string): void { 
    dxLogger.critical(msg);
  },
  getLevel(): LogLevels {
    return dxLogger.levelName;
  },
  async setLevel(level: LogLevels): Promise<void> {
    dxLogger = await setupLogger(level);
  },
};

export default DxLog;