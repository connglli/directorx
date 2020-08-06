package io.github.directorx.dxrec

import android.app.Activity
import android.app.Application
import android.os.Bundle

object DxActivityStack {

    private lateinit var app: Application
    private var stack = mutableListOf<Activity>()

    fun registerSelf(app: Application) {
        app.registerActivityLifecycleCallbacks(object : Application.ActivityLifecycleCallbacks {
            override fun onActivityStarted(activity: Activity) {
                for (a in stack) {
                    if (a == activity) {
                        stack.remove(a)
                        break
                    }
                }
                stack.add(activity)
            }

            override fun onActivityDestroyed(activity: Activity) {
                for (a in stack) {
                    if (a == activity) {
                        stack.remove(a)
                        break
                    }
                }
            }

            override fun onActivityCreated(
                activity: Activity,
                savedInstanceState: Bundle?
            ) = Unit
            override fun onActivityResumed(activity: Activity) = Unit
            override fun onActivityPaused(activity: Activity) = Unit
            override fun onActivityStopped(activity: Activity) = Unit
            override fun onActivitySaveInstanceState(
                activity: Activity,
                outState: Bundle
            ) = Unit
        })
    }

    val top: Activity
    get() = stack.last()
}