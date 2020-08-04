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

    fun d(msg: String) = handler.post { logger.d(DxRecorder.LOG_TAG, msg) }

    fun i(msg: String) = handler.post { logger.i(DxRecorder.LOG_TAG, msg) }

    fun e(msg: String) = handler.post { logger.e(DxRecorder.LOG_ETAG, msg) }

    fun catchAndLog(block: () -> Unit) {
        try {
            block()
        } catch (t: Throwable) {
            if (t.message != null) {
                logger.e(DxRecorder.LOG_ETAG, t.message!!, t)
            }
        }
    }
}