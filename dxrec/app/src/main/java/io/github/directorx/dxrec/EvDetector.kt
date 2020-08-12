package io.github.directorx.dxrec

import android.view.GestureDetector
import android.view.InputEvent
import android.view.KeyEvent
import android.view.MotionEvent
import io.github.directorx.dxrec.utils.accessors.HideSoftKeyboardEvent
import io.github.directorx.dxrec.utils.accessors.TextEvent

class EvDetector(
    private val listener: Listener = Listener(),
    pkgName: String
) {

    open class Listener {
        open fun onDown(down: MotionEvent, owner: DxViewOwner) = Unit
        open fun onUp(up: MotionEvent, owner: DxViewOwner) = Unit
        open fun onTap(down: MotionEvent, owner: DxViewOwner) = Unit
        open fun onLongTap(down: MotionEvent, owner: DxViewOwner) = Unit
        open fun onDoubleTap(down: MotionEvent, owner: DxViewOwner) = Unit
        open fun onSwipeMove(
            down: MotionEvent, move: MotionEvent,
            deltaX: Float, deltaY: Float,
            owner: DxViewOwner
        ) = Unit

        open fun onKey(down: KeyEvent, owner: DxViewOwner) = Unit
        open fun onText(down: TextEvent, owner: DxViewOwner) = Unit
        open fun onHideSoftKeyboard(down: HideSoftKeyboardEvent, owner: DxViewOwner) = Unit
    }

    private lateinit var owner: DxViewOwner
    private val detector: GestureDetector = GestureDetector(null, object : GestureDetector.SimpleOnGestureListener() {
        override fun onDown(down: MotionEvent): Boolean {
            listener.onDown(down, owner)
            return false
        }

        // onSingleTapConfirmed() is invoked whenever a tap
        // (except double-tap) is fired; and onSingleTapConfirmed()
        // is invoked in the handler thread of GestureDetector instead
        // of the thread which invokes GestureDetector#onTouchEvent()
        override fun onSingleTapConfirmed(down: MotionEvent): Boolean {
            listener.onTap(down, owner)
            return false
        }

        // onSingleTapUp() is invoked when a tap is fired; however,
        // when a double-tap is fired, the onSingleTapUp() is also
        // invoked right after the first tap (but not after the second)
        override fun onSingleTapUp(e: MotionEvent?): Boolean {
            return super.onSingleTapUp(e)
        }

        // onLongPress() is invoked in the handler thread of
        // GestureDetector instead of the thread which invokes
        // GestureDetector#onTouchEvent()
        override fun onLongPress(down: MotionEvent) {
            listener.onLongTap(down, owner)
        }

        override fun onScroll(
            down: MotionEvent, move: MotionEvent,
            deltaX: Float, deltaY: Float // delta since last call to onScroll
        ): Boolean {
            listener.onSwipeMove(down, move, -deltaX, -deltaY, owner)
            return false
        }

        override fun onDoubleTap(down: MotionEvent): Boolean {
            listener.onDoubleTap(down, owner)
            return false
        }
    })

    fun next(owner: DxViewOwner, evt: InputEvent) {
        updateOwner(owner)
        when (evt) {
            is MotionEvent -> nextMotion(evt)
            is KeyEvent -> nextKey(evt)
            else -> {}
        }
    }

    fun next(owner: DxViewOwner, evt: TextEvent) {
        updateOwner(owner)
        nextText(evt)
    }

    fun next(owner: DxViewOwner, evt: HideSoftKeyboardEvent) {
        updateOwner(owner)
        nextHideSoftKeyboard(evt)
    }

    private fun nextMotion(event: MotionEvent) {
        if (event.action == MotionEvent.ACTION_UP) {
            listener.onUp(event, owner)
        }
        detector.onTouchEvent(event)
    }

    private fun nextKey(event: KeyEvent) {
        if (event.action == MotionEvent.ACTION_DOWN) {
            listener.onKey(event, owner)
        }
    }

    private fun nextText(event: TextEvent) {
        listener.onText(event, owner)
    }

    private fun nextHideSoftKeyboard(event: HideSoftKeyboardEvent) {
        listener.onHideSoftKeyboard(event, owner)
    }

    private fun updateOwner(owner: DxViewOwner) {
        if (!this::owner.isInitialized || this.owner != owner) {
            this.owner = owner
        }
    }
}