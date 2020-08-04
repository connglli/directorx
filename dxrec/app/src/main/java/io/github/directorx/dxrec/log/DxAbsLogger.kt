package io.github.directorx.dxrec.log

import android.util.Log

abstract class DxAbsLogger(val pkgName: String) {

    fun d(tag: String, msg: String) = postLog(Log.DEBUG, tag, msg)

    fun i(tag: String, msg: String) = postLog(Log.INFO, tag, msg)

    fun e(tag: String, msg: String, tr: Throwable? = null) {
        postLog(Log.ERROR, tag, msg)
        if (tr != null) {
            postLog(Log.ERROR, tag, Log.getStackTraceString(tr))
        }
    }

    abstract fun postLog(logLevel: Int, logTag: String, logMessage: String)
}
