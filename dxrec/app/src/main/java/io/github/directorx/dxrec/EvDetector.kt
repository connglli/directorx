package io.github.directorx.dxrec

import android.app.Activity
import android.view.GestureDetector
import android.view.InputEvent
import android.view.KeyEvent
import android.view.MotionEvent

class EvDetector(private val listener: Listener = Listener()) {

    open class Listener {
        open fun onDown(down: MotionEvent, act: Activity) = Unit
        open fun onUp(up: MotionEvent, act: Activity) = Unit
        open fun onTap(down: MotionEvent, act: Activity) = Unit
        open fun onLongTap(down: MotionEvent, act: Activity) = Unit
        open fun onDoubleTap(down: MotionEvent, act: Activity) = Unit
        open fun onSwipe(
            down: MotionEvent, move: MotionEvent,
            deltaX: Float, deltaY: Float,
            act: Activity
        ) = Unit

        open fun onKey(down: KeyEvent, act: Activity) = Unit
    }

    private lateinit var activity: Activity
    @Suppress("DEPRECATION")
    private val detector = GestureDetector(object : GestureDetector.SimpleOnGestureListener() {
        override fun onSingleTapConfirmed(down: MotionEvent): Boolean {
            listener.onTap(down, activity)
            return false
        }

        override fun onLongPress(down: MotionEvent) {
            listener.onLongTap(down, activity)
        }

        override fun onScroll(
            down: MotionEvent, move: MotionEvent,
            deltaX: Float, deltaY: Float
        ): Boolean {
            listener.onSwipe(down, move, deltaX, deltaY, activity)
            return false
        }

        override fun onDoubleTap(down: MotionEvent): Boolean {
            listener.onDoubleTap(down, activity)
            return false
        }
    })

    fun next(act: Activity, evt: InputEvent) {
        updateActivity(act)
        when (evt) {
            is MotionEvent -> nextMotion(evt)
            is KeyEvent -> nextKey(evt)
            else -> {}
        }
    }

    private fun nextMotion(event: MotionEvent) {
        if (event.action == MotionEvent.ACTION_DOWN) {
            listener.onDown(event, activity)
        } else if (event.action == MotionEvent.ACTION_UP) {
            listener.onUp(event, activity)
        }
        detector.onTouchEvent(event)
    }

    private fun nextKey(event: KeyEvent) {
        if (event.action == MotionEvent.ACTION_DOWN) {
            listener.onKey(event, activity)
        }
    }

    private fun updateActivity(act: Activity) {
        if (!::activity.isInitialized || activity != act) {
            activity = act
        }
    }
}