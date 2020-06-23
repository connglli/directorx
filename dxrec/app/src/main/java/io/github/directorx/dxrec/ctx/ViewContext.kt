package io.github.directorx.dxrec.ctx

import android.util.Base64
import android.view.View
import android.widget.TextView
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import io.github.directorx.dxrec.DxContext
import io.github.directorx.dxrec.utils.accessors.getFieldValue

//class ViewContext(val encode: Boolean) : DxContext {
//
//    override fun prepare() {
//        val method = View::class.java.getMethod("toString")
//        XposedBridge.hookMethod(method, object : XC_MethodHook() {
//            override fun afterHookedMethod(param: MethodHookParam?) {
//                if (param == null || param.hasThrowable()) {
//                    return
//                }
//
//                // append desc and text
//                val view = param.thisObject as View
//                val mScrollX = View::class.java.getFieldValue<View, Int>(view, "mScrollX") ?: 0
//                val mScrollY = View::class.java.getFieldValue<View, Int>(view, "mScrollY") ?: 0
//                val mContentDescription = View::class.java.getFieldValue<View, CharSequence>(view, "mContentDescription") ?: ""
//                val mText = if (view is TextView) {
//                    TextView::class.java.getFieldValue<TextView, CharSequence>(view, "mText") ?: ""
//                } else {
//                    ""
//                }
//
//                val result = param.result as String
//
//                var info = result.substring(0 until result.length - 1)
//                // FIX: some custom view may invoke View#toString() more than once
//                if ("dx-tx" !in info) {
//                    info += " dx-tx=${view.x - view.left}"
//                }
//                if ("dx-ty" !in info) {
//                    info += " dx-ty=${view.y - view.top}"
//                }
//                if ("dx-tz" !in info) {
//                    info += " dx-tz=${view.z}"
//                }
//                if ("dx-sx" !in info) {
//                    info += " dx-sx=${mScrollX}"
//                }
//                if ("dx-sy" !in info) {
//                    info += " dx-sy=${mScrollY}"
//                }
//                if ("dx-desc=" !in info) {
//                    info += if (mContentDescription.isNotEmpty()) {
//                        " dx-desc=\"${asString(mContentDescription, encode)}\""
//                    } else {
//                        " dx-desc=\"\""
//                    }
//                }
//                if ("dx-text=" !in info) {
//                    info += if (mText.isNotEmpty()) {
//                        " dx-text=\"${asString(mText, encode)}\""
//                    } else {
//                        " dx-text=\"\""
//                    }
//                }
//                info += "}"
//
//                param.result = info
//            }
//        })
//    }
//
//    private fun asString(cs: CharSequence, encode: Boolean) = if (encode) {
//        Base64.encodeToString(cs.toString().toByteArray(), Base64.NO_WRAP).trim()
//    } else {
//        cs.toString()
//    }
//}

class ViewContext(val encode: Boolean) : DxContext {

    override fun prepare() {
        val method = View::class.java.getMethod("toString")
        XposedBridge.hookMethod(method, object : XC_MethodHook() {
            override fun afterHookedMethod(param: MethodHookParam?) {
                if (param == null || param.hasThrowable()) {
                    return
                }

                // append desc and text
                val view = param.thisObject as View
                val desc = view.contentDescription ?: ""
                val text = if (view is TextView) {
                    view.text ?: ""
                } else {
                    ""
                }

                val result = param.result as String

                var info = result.substring(0 until result.length - 1)
                // FIX: some custom view may invoke View#toString() more than once
                if ("dx-tx" !in info) {
                    info += " dx-tx=${view.translationX}"
                }
                if ("dx-ty" !in info) {
                    info += " dx-ty=${view.translationY}"
                }
                if ("dx-tz" !in info) {
                    info += " dx-tz=${view.translationZ}"
                }
                if ("dx-sx" !in info) {
                    info += " dx-sx=${view.scrollX}"
                }
                if ("dx-sy" !in info) {
                    info += " dx-sy=${view.scrollY}"
                }
                if ("dx-desc=" !in info) {
                    info += if (desc.isNotEmpty()) {
                        " dx-desc=\"${asString(desc, encode)}\""
                    } else {
                        " dx-desc=\"\""
                    }
                }
                if ("dx-text=" !in info) {
                    info += if (text.isNotEmpty()) {
                        " dx-text=\"${asString(text, encode)}\""
                    } else {
                        " dx-text=\"\""
                    }
                }
                info += "}"

                param.result = info
            }
        })
    }

    private fun asString(cs: CharSequence, encode: Boolean) = if (encode) {
        Base64.encodeToString(cs.toString().toByteArray(), Base64.NO_WRAP).trim()
    } else {
        cs.toString()
    }
}