package io.github.directorx.dxrec

import android.app.Activity
import android.view.Window
import io.github.directorx.dxrec.utils.accessors.dump

sealed class DxViewOwner {
    open fun dump(buf: StringBuffer) {
        throw NotImplementedError("dump is not implement by children")
    }

    open fun name(): String {
        throw NotImplementedError("dump is not implement by children")
    }
}

@Suppress("MemberVisibilityCanBePrivate")
class DxActivity(val activity: Activity) : DxViewOwner() {
    override fun dump(buf: StringBuffer) {
        activity.dump(buf)
    }

    override fun name(): String {
        return activity.javaClass.name
    }
}

@Suppress("MemberVisibilityCanBePrivate")
class DxWindow(val window: Window) : DxViewOwner() {
    override fun dump(buf: StringBuffer) {
        window.dump(buf)
    }

    override fun name(): String {
        return window.javaClass.name
    }
}