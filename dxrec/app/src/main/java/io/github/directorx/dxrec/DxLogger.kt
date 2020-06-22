package io.github.directorx.dxrec

import android.util.Log

object DxLogger {

    lateinit var pkgName: String

    fun i(msg: String, noPrefix: Boolean = false) =
        if (noPrefix) {
            Log.d(DxRecorder.LOG_TAG, msg)
        } else {
            Log.d(DxRecorder.LOG_TAG, "$pkgName $msg")
        }

    fun e(msg: String, stackTrace: Array<StackTraceElement>? = null) {
        Log.d(DxRecorder.LOG_ETAG, "($pkgName) $msg")
        if (stackTrace != null) {
            for (s in stackTrace) {
                Log.d(DxRecorder.LOG_ETAG, s.toString())
            }
        }

    }
}