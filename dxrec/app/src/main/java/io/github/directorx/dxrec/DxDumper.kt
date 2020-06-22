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
        DxLogger.i("ACTIVITY_BEGIN $act")
        for (line in dump.split("\n")) {
            // FIX: each log entry is limited to 8192 bytes
            if (line.isNotEmpty()) {
                DxLogger.i(line, noPrefix=true)
            }
        }
        DxLogger.i("ACTIVITY_END $act")
        when (evt) {
            // TAP act down_time x y
            is DxTapEvent ->
                DxLogger.i("TAP $act ${evt.t} ${evt.x} ${evt.y}")
            // LONG_TAP act down_time x y
            is DxLongTapEvent ->
                DxLogger.i("LONG_TAP $act ${evt.t} ${evt.x} ${evt.y}")
            // DOUBLE_TAP act down_time x y
            is DxDoubleTapEvent ->
                DxLogger.i("DOUBLE_TAP $act ${evt.t} ${evt.x} ${evt.y}")
            // SWIPE act down_time x y delta_x delta_y up_time
            is DxSwipeEvent ->
                DxLogger.i("SWIPE $act ${evt.t0} ${evt.x} ${evt.y} ${evt.dx} ${evt.dy} ${evt.t1}")
            // KEY act down_time code key
            is DxKeyEvent ->
                DxLogger.i("KEY $act ${evt.t} ${evt.c} ${evt.k}")
        }
    }
}