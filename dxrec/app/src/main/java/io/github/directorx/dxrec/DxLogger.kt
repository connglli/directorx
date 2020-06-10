package io.github.directorx.dxrec

import android.util.Log

object DxLogger {

    lateinit var pkgName: String

    fun d(msg: String, noPrefix: Boolean = false) =
        if (noPrefix) {
            Log.d(DxRecorder.LOG_TAG, msg)
        } else {
            Log.d(DxRecorder.LOG_TAG, "$pkgName $msg")
        }
}