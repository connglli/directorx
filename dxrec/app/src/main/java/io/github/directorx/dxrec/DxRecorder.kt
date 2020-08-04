package io.github.directorx.dxrec

import android.app.Activity
import android.view.KeyEvent
import android.view.MotionEvent
import de.robv.android.xposed.IXposedHookLoadPackage
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import de.robv.android.xposed.callbacks.XC_LoadPackage
import io.github.directorx.dxrec.ctx.DecorViewContext
import io.github.directorx.dxrec.ctx.ViewContext
import io.github.directorx.dxrec.log.AndroidLogger
import io.github.directorx.dxrec.utils.accessors.contains
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

class DxRecorder : IXposedHookLoadPackage, EvDetector.Listener() {

    companion object {
        const val LOG_TAG = "DxRecorder"
        const val LOG_ETAG = "DxRecorderE"
        const val MEM_CAP = 5
        const val CONFIG = "/data/local/tmp/directorx/dxrec.config.json"
    }

    // FIX: different from VirtualXposed, Xposed only load and
    // initialize DxRecorder once when zygote is initialized,
    // so we have to do them in the #handleLoadPackage method
    private lateinit var config: JSONObject
    private lateinit var broker: DxBroker
    private lateinit var detector: EvDetector
    private lateinit var dumper: DxDumper

    override fun handleLoadPackage(lpparam: XC_LoadPackage.LoadPackageParam?) {
        val pkgName = lpparam?.packageName ?: return
        val file = File(CONFIG)
        config = if (file.exists() && file.isFile) {
            JSONObject(file.readText(Charsets.UTF_8))
        } else {
            JSONObject("{}")
        }
        val whitelist = config.opt("whitelist") as? JSONArray ?: JSONArray("[]")
        val encode = config.optBoolean("encode", false)
        if (pkgName !in whitelist) { return }
        DxLogger.setLogger(AndroidLogger(pkgName))

        DxLogger.catchAndLog {
            prepare(pkgName, encode)
        }

        DxLogger.catchAndLog {
            val method = Activity::class.java.getMethod("dispatchTouchEvent", MotionEvent::class.java)
            XposedBridge.hookMethod(method, object : XC_MethodHook() {
                override fun beforeHookedMethod(param: MethodHookParam?) {
                    val act = param?.thisObject as? Activity ?: return
                    val evt = param.args[0] as? MotionEvent ?: return
                    detector.next(act, evt)
                }
            })
        }

        DxLogger.catchAndLog {
            val method = Activity::class.java.getMethod("dispatchKeyEvent", KeyEvent::class.java)
            XposedBridge.hookMethod(method, object : XC_MethodHook() {
                override fun beforeHookedMethod(param: MethodHookParam?) {
                    val act = param?.thisObject as? Activity ?: return
                    val evt = param.args[0] as? KeyEvent ?: return
                    detector.next(act, evt)
                }
            })
        }
    }

    // Fix: GestureDetector invokes the onSingleTapConfirmed() and
    // onLongPress() callback in its handler, and thus makes our
    // dump later after the firing event
    //
    // Considering each event starts very from a down event, and
    // onDown() is run synchronously, we dump the hierarchy each time
    // a down is detected
    override fun onDown(down: MotionEvent, act: Activity) {
        broker.addActivity(act)
    }

    override fun onTap(down: MotionEvent, act: Activity) {
        broker.addEvent(DxTapEvent(down.x, down.y, down.downTime))
        broker.commit()
    }

    override fun onLongTap(down: MotionEvent, act: Activity) {
        broker.addEvent(DxLongTapEvent(down.x, down.y, down.downTime))
        broker.commit()
    }

    override fun onDoubleTap(down: MotionEvent, act: Activity) {
        broker.addEvent(DxDoubleTapEvent(down.x, down.y, down.downTime))
        broker.commit()
    }

    override fun onSwipeMove(
        down: MotionEvent,
        move: MotionEvent,
        deltaX: Float,
        deltaY: Float,
        act: Activity
    ) {
        val last = broker.curr
        // pending to dump until the corresponding UP event happens
        val evt = if (last == null || last.evt !is DxSwipeEvent || last.evt.t0 != down.downTime) {
            DxSwipeEvent(down.x, down.y, deltaX, deltaY, down.downTime, move.eventTime)
        } else {
            DxSwipeEvent(
                down.x, down.y,
                last.evt.dx + deltaX,
                last.evt.dy + deltaY,
                down.downTime, move.eventTime)
        }
        broker.addEvent(evt)
    }

    override fun onUp(up: MotionEvent, act: Activity) {
        val last = broker.curr ?: return
        // dump the pending swipe event
        if (last.evt is DxSwipeEvent) {
            broker.commit()
        }
    }

    override fun onKey(down: KeyEvent, act: Activity) {
        broker.addPair(act, DxKeyEvent(down.keyCode, KeyEvent.keyCodeToString(down.keyCode), down.downTime))
        broker.commit()
    }

    private fun prepare(pkgName: String, encode: Boolean) {
        // initialize components
        broker = DxBroker(MEM_CAP)
        detector = EvDetector(this, pkgName)
        dumper = DxDumper(broker.committed)

        try { // initialize hooking context
            ViewContext(encode).prepare()
            DecorViewContext().prepare()
        } catch (ignored: Throwable) {}

        // start the dump thread
        dumper.start()
    }
}