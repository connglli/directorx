package io.github.directorx.dxrec.ctx

import android.annotation.SuppressLint
import android.view.View
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedHelpers
import io.github.directorx.dxrec.DxContext
import io.github.directorx.dxrec.ctx.ViewContext.Companion.appendKV
import io.github.directorx.dxrec.utils.accessors.getBackgroundColor

class DecorViewContext : DxContext {

    @SuppressLint("PrivateApi")
    @Suppress("LocalVariableName")
    override fun prepare() {
        val DecorView = View::class.java.classLoader?.loadClass("com.android.internal.policy.DecorView")
        XposedHelpers.findAndHookMethod(DecorView, "toString", object : XC_MethodHook() {
            override fun afterHookedMethod(param: MethodHookParam?) {
                val decor = param?.thisObject as? View ?: return

                val result = param.result as String
                val info = StringBuilder(result)
                info.append("{")

                val bg = getBackgroundColor(decor)
                when {
                    bg.first == null -> { // no background, then let's set it as white
                        appendKV(info, "bg-class", "ColorDrawable", prefix = "")
                        appendKV(info, "bg-color", "-1")
                    }
                    bg.second == null -> { // no color, maybe a layer, a shape, an image
                        appendKV(info, "bg-class", bg.first!!, prefix = "")
                        appendKV(info, "bg-color", ".")
                    }
                    else -> { // has color, but maybe color from ripple (often used in animation)
                        appendKV(info, "bg-class", bg.first!!, prefix = "")
                        appendKV(info, "bg-color", bg.second!!)
                    }
                }

                param.result = "$info}"
            }
        })
    }
}