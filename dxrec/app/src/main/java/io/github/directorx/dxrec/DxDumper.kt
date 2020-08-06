package io.github.directorx.dxrec

import android.util.Base64
import java.io.ByteArrayOutputStream
import java.util.concurrent.BlockingQueue
import java.util.zip.GZIPOutputStream

class DxDumper(private val queue: BlockingQueue<DxBroker.Item>) : Thread() {

    override fun run() {
        try {
            while (true) {
                doDump(queue.take())
            }
        } catch (ignored: InterruptedException) {}
    }

    private fun doDump(item: DxBroker.Item) {
        val (act, evt, dump) = item
        val eDump = gzipThenBase64(dump)

        // ACTIVITY act
        DxLogger.i("ACTIVITY_BEGIN $act")
        DxLogger.i(eDump)
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
            // TEXT act down_time text
            is DxTextEvent ->
                DxLogger.i("TEXT $act ${evt.t} ${evt.x}")
        }
    }

    private fun gzipThenBase64(input: String): String {
        // compress using gzip
        val bos = ByteArrayOutputStream()
        GZIPOutputStream(bos).bufferedWriter(Charsets.UTF_8).use { it.write(input) }
        // encode using base64
        val output = Base64.encodeToString(bos.toByteArray(), Base64.DEFAULT).trim()
        bos.close()
        return output
    }
}