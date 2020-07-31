package io.github.directorx.dxrec.ctx

import android.os.Build
import android.util.Base64
import android.view.View
import android.webkit.WebView
import android.widget.*
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import io.github.directorx.dxrec.DxContext
import io.github.directorx.dxrec.utils.accessors.*

class ViewContext(val encode: Boolean) : DxContext {

    companion object {
        fun appendKString(info: StringBuilder, key: String, value: String, prefix: String =" ") {
            appendKV(info, key, "\"${value}\"", prefix)
        }

        fun appendKV(info: StringBuilder, key: String, value: Any, prefix: String =" ") {
            // FIX: some custom view may invoke View#toString() more than once
            val dxKeyEquals = "dx-$key="
            if (dxKeyEquals !in info) {
                info.append("$prefix$dxKeyEquals$value")
            }
        }
    }

    override fun prepare() {
        val method = View::class.java.getMethod("toString")
        XposedBridge.hookMethod(method, object : XC_MethodHook() {
            override fun afterHookedMethod(param: MethodHookParam?) {
                if (param == null || param.hasThrowable()) {
                    return
                }

                val result = param.result as String
                val info = StringBuilder(result.substring(0 until result.length - 1))

                // general view properties
                val view = param.thisObject as View
                val desc = view.contentDescription ?: ""
                val text = if (view is TextView) { view.text ?: "" } else { "" }
                val tag = view.tag?.toString() ?: ""
                val tip = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    view.tooltipText?.toString() ?: ""
                } else {
                    ""
                }
                val hint = if (view is TextView) { view.hint ?: "" } else { "" }
                val bg = getBackgroundColor(view)
                val fg = getForegroundColor(view)
                var scroll = ""
                scroll += if (view.canScrollHorizontally(-1)) "L" else "."
                scroll += if (view.canScrollVertically(-1)) "T" else "."
                scroll += if (view.canScrollHorizontally(1)) "R" else "."
                scroll += if (view.canScrollVertically(1)) "B" else "."
                val type = when {
                    view is Toolbar -> "TB"
                    view instanceof "android.support.v7.widget.Toolbar" -> "TB"
                    view instanceof "androidx.widget.Toolbar" -> "TB"
                    view is ListView -> "LV"
                    view is GridView -> "GV"
                    view is ScrollView -> "VSV"
                    view is HorizontalScrollView -> "HSV"
                    view instanceof "android.support.v4.widget.NestedScrollView" -> "NSV"
                    view instanceof "androidx.widget.NestedScrollView" -> "NSV"
                    view instanceof "android.support.v7.widget.RecyclerView" -> "RV"
                    view instanceof "androidx.widget.RecyclerView" -> "RV"
                    view instanceof "android.support.v4.view.ViewPager" -> "VP"
                    view instanceof "androidx.widget.ViewPager" -> "VP"
                    view is TabHost -> "TH"
                    view is WebView -> "WV"
                    else -> "."
                }
                appendKV(info, "type", type)
                appendKV(info, "scroll", scroll)
                appendKV(info, "e", view.elevation)
                appendKV(info, "tx", view.translationX)
                appendKV(info, "ty", view.translationY)
                appendKV(info, "tz", view.translationZ)
                appendKV(info, "sx", view.scrollX)
                appendKV(info, "sy", view.scrollY)
                appendKV(info, "shown", view.isShown)
                appendKString(info, "desc", asString(desc, encode))
                appendKString(info, "text", asString(text, encode))
                appendKString(info, "tag", asString(tag, encode))
                appendKString(info, "tip", asString(tip, encode))
                appendKString(info, "hint", asString(hint, encode))
                when {
                    bg.first == null -> { // no background, then inherits from parent
                        appendKV(info, "bg-class", ".")
                        appendKV(info, "bg-color", ".")
                    }
                    bg.second == null -> { // no color, maybe a layer, a shape, an image
                        appendKV(info, "bg-class", bg.first!!)
                        appendKV(info, "bg-color", ".")
                    }
                    else -> { // has color, but maybe color from ripple (often used in animation)
                        appendKV(info, "bg-class", bg.first!!)
                        appendKV(info, "bg-color", bg.second!!)
                    }
                }
                when (fg) {
                    null -> { // no foreground
                        appendKV(info, "fg", ".")
                    }
                    else -> { // has color, but maybe color from ripple (often used in animation)
                        appendKV(info, "fg", fg)
                    }
                }
                appendKV(info, "im-acc", view.isImportantForAccessibility)

                // tab host properties
                if (view is TabHost) {
                    appendKV(info, "tab-curr", view.currentTab)
                    appendKV(info, "tab-widget",  view.tabWidget.hexId())
                    appendKV(info, "tab-content", view.tabContentView.hexId())
                }

                // view pager properties: alert don't use `is` operator, 'cause
                // ViewPager is not in framework, but in androidx (a 2nd party
                // library)
                if (view instanceof "androidx.widget.ViewPager" ||
                    view instanceof "android.support.v4.view.ViewPager") {
                    val curItem = view.javaClass.getFieldValue<Int>(view, "mCurItem")
                    if (curItem != null) {
                        appendKV(info, "pgr-curr", curItem)
                    } else {
                        appendKV(info, "pgr-curr", 0)
                    }
                }

                param.result = "$info}"
            }
        })
    }

    private fun asString(cs: CharSequence, encode: Boolean) = if (encode) {
        Base64.encodeToString(cs.toString().toByteArray(), Base64.NO_WRAP).trim()
    } else {
        cs.toString()
    }
}