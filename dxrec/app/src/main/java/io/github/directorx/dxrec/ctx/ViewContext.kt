package io.github.directorx.dxrec.ctx

import android.util.Base64
import android.view.View
import android.widget.TabHost
import android.widget.TextView
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import io.github.directorx.dxrec.DxContext
import io.github.directorx.dxrec.utils.accessors.getBackgroundColor
import io.github.directorx.dxrec.utils.accessors.getFieldValue
import io.github.directorx.dxrec.utils.accessors.isInstanceOf

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
                val bg = getBackgroundColor(view)
                appendKV(info, "tx", view.translationX)
                appendKV(info, "ty", view.translationY)
                appendKV(info, "tz", view.translationZ)
                appendKV(info, "sx", view.scrollX)
                appendKV(info, "sy", view.scrollY)
                appendKString(info, "desc", asString(desc, encode))
                appendKString(info, "text", asString(text, encode))
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

                // tab host properties
                if (view is TabHost) {
                    val curTab = view.currentTab
                    appendKV(info, "tab-curr", curTab)
                }

                // view pager properties: alert don't use `is` operator, 'cause
                // ViewPager is not in framework, but in androidx (a 2nd party
                // library)
                if (view.isInstanceOf("androidx.widget.ViewPager") ||
                    view.isInstanceOf("android.support.v4.view.ViewPager")) {
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