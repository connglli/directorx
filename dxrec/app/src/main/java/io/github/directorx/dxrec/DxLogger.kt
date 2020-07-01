package io.github.directorx.dxrec

import android.util.Log

object DxLogger {

    lateinit var pkgName: String

    fun i(msg: String, noPrefix: Boolean = false) =
        if (noPrefix) {
            androidLog(Log.INFO, DxRecorder.LOG_TAG, msg)
        } else {
            androidLog(Log.INFO, DxRecorder.LOG_TAG, "$pkgName $msg")
        }

    fun e(msg: String, tr: Throwable? = null) {
        androidLog(Log.ERROR, DxRecorder.LOG_ETAG, "($pkgName) $msg")
        if (tr != null) {
            androidLog(Log.ERROR, DxRecorder.LOG_ETAG, Log.getStackTraceString(tr))
        }
    }

    fun catchAndLog(block: () -> Unit) {
        try {
            block()
        } catch (t: Throwable) {
            if (t.message != null) {
                e(t.message!!, t)
            }
        }
    }

    private const val MAX_LOG_LENGTH = 4000
    private fun androidLog(logLevel: Int, logTag: String, logMessage: String) {
        // Copied from OkHttp
        // Split by line, then ensure each line can fit into Log's maximum length.
        var i = 0
        val length = logMessage.length
        while (i < length) {
            var newline = logMessage.indexOf('\n', i)
            newline = if (newline != -1) newline else length
            do {
                val end = minOf(newline, i + MAX_LOG_LENGTH)
                Log.println(logLevel, logTag, logMessage.substring(i, end))
                i = end
            } while (i < newline)
            i++
        }
    }
}