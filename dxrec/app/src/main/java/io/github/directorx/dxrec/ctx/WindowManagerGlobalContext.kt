package io.github.directorx.dxrec.ctx

import android.annotation.SuppressLint
import android.view.View
import android.view.WindowManager
import io.github.directorx.dxrec.DxContext
import java.lang.NullPointerException

object WindowManagerGlobalContext : DxContext {

    private lateinit var WindowManagerGlobal: Class<*>
    private lateinit var instance: Any

    @SuppressLint("PrivateApi")
    override fun prepare() {
        WindowManagerGlobal =
            WindowManager::class.java.classLoader?.loadClass("android.view.WindowManagerGlobal")
                ?: return
        val getInstance = WindowManagerGlobal.getDeclaredMethod("getInstance")
        instance = getInstance.invoke(null) ?: return
    }

    val viewRootNames: Array<String>?
    get() {
        return invoke("getViewRootNames") as? Array<String>
    }

    fun getRootView(name: String): View? {
        return invoke("getRootView", name) as? View
    }

    private fun invoke(name: String, vararg args: Any): Any? {
        if (!this::instance.isInitialized) {
            throw NullPointerException("WindowManagerGlobal instance is null")
        }
        val argTypes = args.map { it.javaClass }
        val method = try {
            WindowManagerGlobal.getDeclaredMethod(name, *argTypes.toTypedArray())
        } catch (x: NoSuchMethodException) {
            null
        }
        return method?.invoke(instance, *args)
    }
}