package io.github.directorx.dxrec.utils.accessors

import android.app.Activity
import android.view.View
import android.view.ViewGroup
import androidx.core.view.iterator

private const val PREFIX = " "

fun Activity.dumpView(): String {
    val buf = StringBuffer()
    dumpViewInner(0, this.window.decorView, buf)
    return buf.toString()
}

private fun Activity.dumpViewInner(numPrefix: Int, view: View, buf: StringBuffer) {
    buf.append("${PREFIX.repeat(numPrefix)}${view}\n")
    if (view is ViewGroup) {
        for (v in view) {
            dumpViewInner(numPrefix+1, v, buf)
        }
    }
}