package io.github.directorx.dxrec.utils.accessors

import android.app.Activity
import android.content.res.ColorStateList
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.RippleDrawable
import android.os.Build
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

fun View.hexId(): String {
    return Integer.toHexString(System.identityHashCode(this))
}

fun getBackgroundColor(view: View): Pair<String?, Int?> {
    val bg = view.background ?: null
    var type: String? = null
    var color: Int? = null
    if (bg != null) {
        type = bg.javaClass.simpleName
        if (bg is ColorDrawable) {
            color = bg.color
        } else if (bg is RippleDrawable) {
            val constantState = bg.constantState
            val mColor = constantState?.javaClass?.getFieldValue<ColorStateList>(constantState, "mColor")
            color = mColor?.getColorForState(bg.state, mColor.defaultColor)
        }
    }
    return Pair(type, color)
}

fun getForegroundColor(view: View): String? {
    val fg = if (Build.VERSION.SDK_INT < 23) {
        return null
    } else {
        view.foreground ?: return null
    }
    return if (fg is ColorDrawable) {
        "#${Integer.toHexString(fg.color)}"
    } else {
        fg.javaClass.simpleName
    }
}