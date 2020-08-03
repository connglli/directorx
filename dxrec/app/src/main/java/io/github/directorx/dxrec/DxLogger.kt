package io.github.directorx.dxrec

import android.os.Handler
import android.os.HandlerThread
import io.github.directorx.dxrec.log.DxAbsLogger

object DxLogger {

    private lateinit var thread: HandlerThread
    private lateinit var handler: Handler
    private lateinit var logger: DxAbsLogger

    fun setLogger(value: DxAbsLogger) {
        thread = HandlerThread("${value.pkgName}.dxlogger.thread")
        thread.start()
        handler = Handler(thread.looper)
        logger = value
    }

    fun d(msg: String) = handler.post { logger.d(msg) }

    fun i(msg: String) = handler.post { logger.i(msg) }

    fun e(msg: String) = handler.post { logger.e(msg) }

    fun catchAndLog(block: () -> Unit) = handler.post { logger.catchAndLog(block) }
}