package io.github.directorx.dxrec

import android.app.Activity
import android.util.Base64
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import de.robv.android.xposed.IXposedHookLoadPackage
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import de.robv.android.xposed.callbacks.XC_LoadPackage
import io.github.directorx.dxrec.utils.accessors.contains
import io.github.directorx.dxrec.utils.accessors.getFieldValue
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

class DxRecorder : IXposedHookLoadPackage, EvDetector.Listener() {

    companion object {
        const val LOG_TAG = "DxRecorder"
        const val MEM_CAP = 5
        const val CONFIG = "/data/local/tmp/directorx/dxrec.config.json"
    }

    private var config: JSONObject
    private var whitelist: JSONArray
    private var encode: Boolean

    private val broker: DxBroker
    private val detector: EvDetector
    private val dumper: DxDumper

    init {
        val file = File(CONFIG)
        config = if (file.exists() && file.isFile) {
            JSONObject(file.readText(Charsets.UTF_8))
        } else {
            JSONObject("")
        }
        whitelist = config.opt("whitelist") as? JSONArray ?: JSONArray("[]")
        encode = config.optBoolean("encode", false)
        broker = DxBroker(MEM_CAP)
        detector = EvDetector(this)
        dumper = DxDumper(broker.staged)
    }

    override fun handleLoadPackage(lpparam: XC_LoadPackage.LoadPackageParam?) {
        val pkgName = lpparam?.packageName ?: return
        if (pkgName !in whitelist) {
            return
        } else {
            initialize(pkgName, encode)
        }

        try {
            val method = Activity::class.java.getMethod("dispatchTouchEvent", MotionEvent::class.java)
            XposedBridge.hookMethod(method, object : XC_MethodHook() {
                override fun beforeHookedMethod(param: MethodHookParam?) {
                    val act = param?.thisObject as? Activity ?: return
                    val evt = param.args[0] as? MotionEvent ?: return
                    detector.next(act, evt)
                }
            })
        } catch (ignored: Throwable) {}

        try {
            val method = Activity::class.java.getMethod("dispatchKeyEvent", KeyEvent::class.java)
            XposedBridge.hookMethod(method, object : XC_MethodHook() {
                override fun beforeHookedMethod(param: MethodHookParam?) {
                    val act = param?.thisObject as? Activity ?: return
                    val evt = param.args[0] as? KeyEvent ?: return
                    detector.next(act, evt)
                }
            })
        } catch (ignored: Throwable) {}
    }

    override fun onTap(down: MotionEvent, act: Activity) {
        broker.add(act, DxTapEvent(down.x, down.y, down.downTime))
        broker.commit()
    }

    override fun onLongTap(down: MotionEvent, act: Activity) {
        broker.add(act, DxLongTapEvent(down.x, down.y, down.downTime))
        broker.commit()
    }

    override fun onDoubleTap(down: MotionEvent, act: Activity) {
        broker.add(act, DxDoubleTapEvent(down.x, down.y, down.downTime))
        broker.commit()
    }

    override fun onSwipe(
        down: MotionEvent,
        move: MotionEvent,
        deltaX: Float,
        deltaY: Float,
        act: Activity
    ) {
        val evt = DxSwipeEvent(down.x, down.y, deltaX, deltaY, down.downTime, move.eventTime)
        val last = broker.curr
        // pending to dump until the corresponding UP event happens
        if (last == null || last.evt !is DxSwipeEvent || last.evt.t0 != evt.t0) {
            broker.add(act, evt)
        } else {
            broker.add(last.act, last.dec, evt, refresh = true)
        }
    }

    override fun onUp(up: MotionEvent, act: Activity) {
        val last = broker.curr ?: return
        // dump the pending swipe event
        if (last.evt is DxSwipeEvent) {
            broker.commit()
        }
    }

    override fun onKey(down: KeyEvent, act: Activity) {
        broker.add(act, DxKeyEvent(down.keyCode, KeyEvent.keyCodeToString(down.keyCode), down.downTime))
        broker.commit()
    }

    private fun initialize(pkgName: String, encode: Boolean) {
        DxLogger.pkgName = pkgName

        try { // initialize hooking context
            initView(encode)
        } catch (ignored: Throwable) {}

        // start the dump thread
        dumper.start()
    }

    private fun initView(encode: Boolean) {
        val method = View::class.java.getMethod("toString")
        XposedBridge.hookMethod(method, object : XC_MethodHook() {
            override fun afterHookedMethod(param: MethodHookParam?) {
                try {
                    param?.also {
                        if (param.hasThrowable()) {
                            return
                        }

                        // append desc and text
                        val view = it.thisObject as View
                        val mContentDescription = View::class.java.getFieldValue<View, CharSequence>(view, "mContentDescription")
                        val mText = View::class.java.getFieldValue<View, CharSequence>(view, "mText")
                        val result = it.result as String

                        var info = result.substring(0 until result.length - 1)
                        // FIX: some custom view may invoke View#toString() more than once
                        if ("desc=" !in info) {
                            if (mContentDescription != null && mContentDescription.isNotEmpty()) {
                                info += " desc=\"${asString("application/json", mContentDescription, encode)}\""
                            }
                        }
                        if ("text=" !in info) {
                            if (mText != null && mText.isNotEmpty()) {
                                info += " text=\"${asString("application/json", mText, encode)}\""
                            }
                        }
                        info += "}"

                        param.result = info
                    }
                } catch (ignored: Throwable) {}
            }
        })
    }

    private fun asString(mime: String, cs: CharSequence, encode: Boolean) =
        if (encode) asBase64String(mime, cs) else cs.toString()

    private fun asBase64String(mime: String, cs: CharSequence) =
        "data:${mime};base64,${Base64.encodeToString(cs.toString().toByteArray(), Base64.DEFAULT)}".trim()
}