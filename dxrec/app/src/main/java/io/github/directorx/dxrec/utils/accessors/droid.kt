package io.github.directorx.dxrec.utils.accessors

import android.app.Activity
import android.content.res.ColorStateList
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.RippleDrawable
import android.os.Build
import android.os.Process
import android.os.SystemClock
import android.util.SparseArray
import android.view.View
import android.view.ViewGroup
import androidx.core.view.iterator
import java.io.*
import java.util.*

private const val PREFIX = " "

fun Activity.dump(buf: StringBuffer) {
    // dump the activity like what dumpsys does
    // ACTIVITY com.microsoft.todos/.ui.TodoMainActivity 366132a pid=2954
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
        dump(PREFIX.repeat(4), null, writer, null)
        writer.flush()
        buf.append(this.toString(Charsets.UTF_8.name()))
        close()
    }

    // dump using reflection
    if (false) {
        val decor = window.decorView
        val fm = this.fragmentManager
        val getSupportFragmentManager = try {
            this.javaClass.getDeclaredMethodIncludingParent("getSupportFragmentManager")
        } catch (x: NoSuchMethodException) {
            null
        }
        val sfm = getSupportFragmentManager?.invoke(this)

        buf.append("View Hierarchy:\n")
        decor.dump(buf)

        buf.append("Added Fragments:\n")
        val added = fm.javaClass.getFieldValue<ArrayList<Any>>(fm, "mAdded")
        if (added != null) {
            for (f in added) {
                buf.append(f.toString()).append("\n")
            }
        }

        buf.append("Active Fragments:\n")
        val active = fm.javaClass.getFieldValue<SparseArray<Any>>(fm, "mActive")
        if (active != null) {
            val size = active.size()
            for (i in 0 until size) {
                val f = active.valueAt(i)
                val mFragmentId = f.javaClass.getFieldValue<Int>(f, "mFragmentId") ?: 0
                val mContainerId = f.javaClass.getFieldValue<Int>(f, "mContainerId") ?: 0
                val mTag = f.javaClass.getFieldValue<String>(f, "mTag") ?: ""
                buf.append(f.toString()).append("\n")
                buf.append(PREFIX).append("mFragmentId=#").append(Integer.toHexString(mFragmentId))
                    .append(" ").append("mContainerId=#").append(Integer.toHexString(mContainerId))
                    .append(" ").append("mTag=").append(mTag)
                    .append("\n")
            }
        }

        if (sfm != null) {
            buf.append("Added Support Fragments:").append("\n")
            buf.append(PREFIX).append("Not null: TODO: add added support fragments").append("\n")
            buf.append("Active Support Fragments:").append("\n")
            buf.append(PREFIX).append("Not null: TODO: add active support fragments").append("\n")
        } else {
            buf.append("Added Support Fragments:").append("\n")
            buf.append("Active Support Fragments:").append("\n")
        }
    }
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

data class TextEvent(val text: String, val downTime: Long = SystemClock.uptimeMillis())