package io.github.directorx.dxrec.utils.accessors

import android.app.Activity
import android.view.View
import android.view.ViewGroup
import androidx.core.view.iterator

private const val PREFIX = " "

fun Activity.dump(buf: StringBuffer) {
    window.decorView.dump(buf)
}

fun View.dump(buf: StringBuffer) {
    dumpInner(0, buf)
}

private fun View.dumpInner(repeat: Int, buf: StringBuffer) {
    buf.append(PREFIX.repeat(repeat)).append(this).append("\n")
    if (this is ViewGroup) {
        for (v in this) {
            v.dumpInner(repeat+1, buf)
        }
    }
}