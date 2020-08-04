package io.github.directorx.dxrec.log

import android.util.Log

class AndroidLogger(pkgName: String, private val maxRetry: Int = 32) : DxAbsLogger(pkgName) {
    companion object {
        const val RETRY_INTERVAL_MS = 100L
        const val LOG_CHUNK_SIZE = 4000
    }

    override fun postLog(logLevel: Int, logTag: String, logMessage: String) {
        // FIX: fast dump causes logd deny of service by returning EAGAIN; so
        // when our logging triggers DOS, let's have a rest, and retry again
        // See OkHttp: split by line, then ensure each line can fit into Log's maximum length.
        var i = 0
        val length = logMessage.length
        while (i < length) {
            var newline = logMessage.indexOf('\n', i)
            newline = if (newline != -1) newline else length
            do {
                val end = minOf(newline, i + LOG_CHUNK_SIZE)
                if (!tryLogLine(logLevel, logTag, logMessage.substring(i, end))) {
                    return
                }
                i = end
            } while (i < newline)
            i++
        }
    }

    private fun tryLogLine(logLevel: Int, logTag: String, logMessage: String): Boolean {
        var retry = 0
        do {
            val ret = Log.println(logLevel, logTag, logMessage)
            when {
                ret == -11 -> { // -EAGAIN
                    retry ++
                    Thread.sleep(RETRY_INTERVAL_MS)
                }
                ret < 0 -> {
                    Log.println(Log.ERROR, logTag, "Log.println() returns $ret")
                    return false
                }
                else -> {
                    return true
                }
            }
        } while (retry < maxRetry)
        Log.println(Log.ERROR, logTag, "Log.println() returns -11 (EAGAIN)")
        return false
    }
}