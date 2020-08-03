package io.github.directorx.dxrec.log

import android.util.Log

class AndroidLogger(pkgName: String) : DxAbsLogger(pkgName) {

    override fun postLog(logLevel: Int, logTag: String, logMessage: String) {
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

    companion object {
        private const val MAX_LOG_LENGTH = 4000
    }
}