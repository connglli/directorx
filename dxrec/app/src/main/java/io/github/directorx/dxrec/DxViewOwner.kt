package io.github.directorx.dxrec

import android.app.Activity
import android.view.View
import android.view.Window
import io.github.directorx.dxrec.utils.accessors.FakePopupWindow
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
class ActivityOwner(val activity: Activity) : DxViewOwner() {
    override fun dump(buf: StringBuffer) {
        activity.dump(buf)
    }

    override fun name(): String {
        return activity.javaClass.name
    }
}

@Suppress("MemberVisibilityCanBePrivate")
class PhoneWindowOwner(val window: Window) : DxViewOwner() {
    override fun dump(buf: StringBuffer) {
        window.dump(buf)
    }

    override fun name(): String {
        return window.javaClass.name
    }
}

@Suppress("MemberVisibilityCanBePrivate")
class PopupWindowOwner(view: View) : DxViewOwner() {
    val window = FakePopupWindow(view.context, view)

    override fun dump(buf: StringBuffer) {
        window.dump(buf)
    }

    override fun name(): String {
        return window.name
    }
}