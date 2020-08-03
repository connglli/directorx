package io.github.directorx.dxrec.log

import android.util.Log
import io.github.directorx.dxrec.DxRecorder

abstract class DxAbsLogger(val pkgName: String) {

    fun d(msg: String) = postLog(Log.DEBUG, DxRecorder.LOG_TAG, msg)

    fun i(msg: String) = postLog(Log.INFO, DxRecorder.LOG_TAG, msg)

    fun e(msg: String, tr: Throwable? = null) {
        postLog(Log.ERROR, DxRecorder.LOG_TAG, msg)
        if (tr != null) {
            postLog(Log.ERROR, DxRecorder.LOG_TAG, Log.getStackTraceString(tr))
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

    abstract fun postLog(logLevel: Int, logTag: String, logMessage: String)
}
