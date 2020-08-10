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
        val (owner, _, event, dump) = item
        val eDump = gzipThenBase64(dump)

        DxLogger.i("GUI_BEGIN $owner")
        DxLogger.i(eDump)
        DxLogger.i("GUI_END $owner")
        when (event) {
            // TAP act down_time x y
            is DxTapEvent ->
                DxLogger.i("TAP $owner ${event.t} ${event.x} ${event.y}")
            // LONG_TAP act down_time x y
            is DxLongTapEvent ->
                DxLogger.i("LONG_TAP $owner ${event.t} ${event.x} ${event.y}")
            // DOUBLE_TAP act down_time x y
            is DxDoubleTapEvent ->
                DxLogger.i("DOUBLE_TAP $owner ${event.t} ${event.x} ${event.y}")
            // SWIPE act down_time x y delta_x delta_y up_time
            is DxSwipeEvent ->
                DxLogger.i("SWIPE $owner ${event.t0} ${event.x} ${event.y} ${event.dx} ${event.dy} ${event.t1}")
            // KEY act down_time code key
            is DxKeyEvent ->
                DxLogger.i("KEY $owner ${event.t} ${event.c} ${event.k}")
            // TEXT act down_time text
            is DxTextEvent ->
                DxLogger.i("TEXT $owner ${event.t} ${event.x}")
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