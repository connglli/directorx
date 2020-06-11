package io.github.directorx.dxrec

import java.util.concurrent.BlockingQueue

class DxDumper(private val queue: BlockingQueue<DxBroker.Item>) : Thread() {

    override fun run() {
        try {
            while (true) {
                val item = queue.take()
                doDump(item)
            }
        } catch (ignored: InterruptedException) {}
    }

    private fun doDump(item: DxBroker.Item) {
        val (act, evt, dump) = item

        // ACTIVITY act
        DxLogger.d("ACTIVITY_BEGIN $act")
        for (line in dump.split("\n")) {
            // FIX: each log entry is limited to 8192 bytes
            if (line.isNotEmpty()) {
                DxLogger.d(line, noPrefix=true)
            }
        }
        DxLogger.d("ACTIVITY_END $act")
        when (evt) {
            // TAP act down_time x y
            is DxTapEvent ->
                DxLogger.d("TAP $act ${evt.t} ${evt.x} ${evt.y}")
            // LONG_TAP act down_time x y
            is DxLongTapEvent ->
                DxLogger.d("LONG_TAP $act ${evt.t} ${evt.x} ${evt.y}")
            // DOUBLE_TAP act down_time x y
            is DxDoubleTapEvent ->
                DxLogger.d("DOUBLE_TAP $act ${evt.t} ${evt.x} ${evt.y}")
            // SWIPE act down_time x y delta_x delta_y up_time
            is DxSwipeEvent ->
                DxLogger.d("SWIPE $act ${evt.t0} ${evt.x} ${evt.y} ${evt.dx} ${evt.dy} ${evt.t1}")
            // KEY act down_time code key
            is DxKeyEvent ->
                DxLogger.d("KEY $act ${evt.t} ${evt.c} ${evt.k}")
        }
    }
}