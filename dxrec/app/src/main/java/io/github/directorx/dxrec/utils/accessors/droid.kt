package io.github.directorx.dxrec.utils.accessors

import android.app.Activity
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.RippleDrawable
import android.os.Build
import android.os.Process
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.widget.PopupWindow
import androidx.core.view.iterator
import java.io.*

class FakePopupWindow(val context: Context, val view: View) {
    val name: String
    get() = PopupWindow::class.java.name
}

fun Activity.dump(buf: StringBuffer) {
    // dump the activity like what dumpsys does
    // ACTIVITY package/class hash pid=2954
    buf.append("  ACTIVITY ")
        .append(this.packageName)
        .append("/")
        .append(this.localClassName)
        .append(" ")
        .append(Integer.toHexString(System.identityHashCode(this)))
        .append(" ")
        .append("pid=")
        .append(Process.myPid())
        .append("\n")
    ByteArrayOutputStream(4096).apply {
        val writer = PrintWriter(this)
        dump("    ", null, writer, null)
        writer.flush()
        buf.append(this.toString(Charsets.UTF_8.name()))
        close()
    }
}

fun Window.dump(buf: StringBuffer) {
    // PHONE_WINDOW package/class hash pid=2954
    buf.append("  PHONE_WINDOW")
        .append(" ${this.context.packageName}/${this.javaClass.name}")
        .append(" ")
        .append(Integer.toHexString(System.identityHashCode(this)))
        .append(" ")
        .append("pid=")
        .append(Process.myPid())
        .append("\n")
        .append("\n")
    buf.append("    View Hierarchy:")
        .append("\n")
    this.decorView.dump(buf, "  ", 3)
}

fun FakePopupWindow.dump(buf: StringBuffer) {
    // POPUP_WINDOW package/class hash pid=2954
    buf.append("  POPUP_WINDOW")
        .append(" ${this.context.packageName}/${this.name}")
        .append(" ")
        .append(Integer.toHexString(System.identityHashCode(this.view)))
        .append(" ")
        .append("pid=")
        .append(Process.myPid())
        .append("\n")
        .append("\n")
    buf.append("    View Hierarchy:")
        .append("\n")
    // let's wrap it with a decor view, to simulate a phone window
    buf.append("      DecorView@fffff[PopupWindow]{dx-bg-class=ColorDrawable dx-bg-color=-1}")
        .append("\n")
    this.view.dump(buf, "  ", 4)
}

fun View.dump(buf: StringBuffer, prefix: String, repeat: Int) {
    dumpInner(prefix, repeat, buf)
}

private fun View.dumpInner(prefix: String, repeat: Int, buf: StringBuffer) {
    buf.append(prefix.repeat(repeat)).append(this).append("\n")
    if (this is ViewGroup) {
        for (v in this) {
            v.dumpInner(prefix,repeat+1, buf)
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

data class TextEvent(val text: String, val downTime: Long = SystemClock.uptimeMillis())