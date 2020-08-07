package io.github.directorx.dxrec

import android.app.Application
import android.text.Spannable
import android.util.Base64
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.Window
import android.view.inputmethod.BaseInputConnection
import de.robv.android.xposed.IXposedHookLoadPackage
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import de.robv.android.xposed.XposedHelpers
import de.robv.android.xposed.callbacks.XC_LoadPackage
import io.github.directorx.dxrec.ctx.DecorViewContext
import io.github.directorx.dxrec.ctx.ViewContext
import io.github.directorx.dxrec.log.AndroidLogger
import io.github.directorx.dxrec.utils.accessors.TextEvent
import io.github.directorx.dxrec.utils.accessors.contains
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

class DxRecorder : IXposedHookLoadPackage, EvDetector.Listener() {

    companion object {
        const val LOG_TAG = "DxRecorder"
        const val LOG_ETAG = "DxRecorderE"
        const val MEM_CAP = 100
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

        DxLogger.catchAndLog { // hook activity lifecycle
            val method = Application::class.java.getMethod("onCreate")
            XposedBridge.hookMethod(method, object : XC_MethodHook() {
                override fun beforeHookedMethod(param: MethodHookParam?) {
                    val app = param?.thisObject as? Application ?: return
                    DxActivityStack.registerSelf(app)
                }
            })
        }

        DxLogger.catchAndLog { // hook window touch event
            XposedHelpers.findAndHookMethod(
                "com.android.internal.policy.PhoneWindow",
                Window::class.java.classLoader,
                "superDispatchTouchEvent",
                MotionEvent::class.java,
                object : XC_MethodHook() {
                    override fun beforeHookedMethod(param: MethodHookParam?) {
                        val window = param?.thisObject as? Window ?: return
                        val event = param.args[0] as? MotionEvent ?: return
                        if (DxActivityStack.top.window == window) {
                            detector.next(DxActivity(DxActivityStack.top), event)
                        } else {
                            detector.next(DxWindow(window), event)
                        }
                    }
                })
        }

        DxLogger.catchAndLog { // hook window key event
            XposedHelpers.findAndHookMethod(
                "com.android.internal.policy.PhoneWindow",
                Window::class.java.classLoader,
                "superDispatchKeyEvent",
                KeyEvent::class.java,
                object : XC_MethodHook() {
                    override fun beforeHookedMethod(param: MethodHookParam?) {
                        val window = param?.thisObject as? Window ?: return
                        val event = param.args[0] as? KeyEvent ?: return
                        if (DxActivityStack.top.window == window) {
                            detector.next(DxActivity(DxActivityStack.top), event)
                        } else {
                            detector.next(DxWindow(window), event)
                        }
                    }
                })
        }

        // TODO support spaces in text, and incontinuous editing
        //   1. current when there are spaces in a text, the new text after spaces will replace the former
        //   2. current incontinuous editting will produce text copies
        DxLogger.catchAndLog { // hook editor text event
            val commitText = BaseInputConnection::class.java.getMethod(
                "commitText",
                CharSequence::class.java,
                Int::class.java
            )
            XposedBridge.hookMethod(commitText, object : XC_MethodHook() {
                override fun beforeHookedMethod(param: MethodHookParam?) {
                    if (param == null) {
                        return
                    }
                    val txt = param.args[0] as? CharSequence ?: return
                    detector.next(DxActivity(DxActivityStack.top), newEncodedTextEvent(txt, encode))
                }
            })
        }

        DxLogger.catchAndLog { // hook editor text event
            val setComposingText = BaseInputConnection::class.java.getMethod(
                "setComposingText",
                CharSequence::class.java,
                Int::class.java
            )
            XposedBridge.hookMethod(setComposingText, object : XC_MethodHook() {
                override fun beforeHookedMethod(param: MethodHookParam?) {
                    if (param == null) {
                        return
                    }
                    val txt = param.args[0] as? CharSequence ?: return
                    detector.next(DxActivity(DxActivityStack.top), newEncodedTextEvent(txt, encode))
                }
            })
        }

        DxLogger.catchAndLog { // hook editor text event
            val setComposingSpans = BaseInputConnection::class.java.getMethod(
                "setComposingSpans",
                Spannable::class.java
            )
            XposedBridge.hookMethod(setComposingSpans, object : XC_MethodHook() {
                override fun beforeHookedMethod(param: MethodHookParam?) {
                    if (param == null) {
                        return
                    }
                    val txt = param.args[0] as? Spannable ?: return
                    detector.next(DxActivity(DxActivityStack.top), newEncodedTextEvent(txt, encode))
                }
            })
        }

        DxLogger.catchAndLog { // hook editor key event
            val method =
                BaseInputConnection::class.java.getMethod("sendKeyEvent", KeyEvent::class.java)
            XposedBridge.hookMethod(method, object : XC_MethodHook() {
                override fun beforeHookedMethod(param: MethodHookParam?) {
                    if (param == null) {
                        return
                    }
                    val event = param.args[0] as? KeyEvent ?: return
                    detector.next(DxActivity(DxActivityStack.top), event)
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
    override fun onDown(down: MotionEvent, owner: DxViewOwner) {
        broker.addOwner(owner)
    }

    override fun onTap(down: MotionEvent, owner: DxViewOwner) {
        broker.addEvent(DxTapEvent(down.x, down.y, down.downTime))
        broker.commit()
    }

    override fun onLongTap(down: MotionEvent, owner: DxViewOwner) {
        broker.addEvent(DxLongTapEvent(down.x, down.y, down.downTime))
        broker.commit()
    }

    override fun onDoubleTap(down: MotionEvent, owner: DxViewOwner) {
        broker.addEvent(DxDoubleTapEvent(down.x, down.y, down.downTime))
        broker.commit()
    }

    override fun onSwipeMove(
        down: MotionEvent,
        move: MotionEvent,
        deltaX: Float,
        deltaY: Float,
        owner: DxViewOwner
    ) {
        val last = broker.curr
        // pending to dump until the corresponding UP event happens
        val evt = if (last == null || last.event !is DxSwipeEvent || last.event.t0 != down.downTime) {
            DxSwipeEvent(down.x, down.y, deltaX, deltaY, down.downTime, move.eventTime)
        } else {
            DxSwipeEvent(
                down.x, down.y,
                last.event.dx + deltaX,
                last.event.dy + deltaY,
                down.downTime, move.eventTime)
        }
        broker.addEvent(evt)
    }

    override fun onUp(up: MotionEvent, owner: DxViewOwner) {
        val last = broker.curr ?: return
        // dump the pending swipe event
        if (last.event is DxSwipeEvent) {
            broker.commit()
        }
    }

    override fun onKey(down: KeyEvent, owner: DxViewOwner) {
        broker.addPair(owner, DxKeyEvent(down.keyCode, KeyEvent.keyCodeToString(down.keyCode), down.downTime))
        broker.commit()
    }

    override fun onText(down: TextEvent, owner: DxViewOwner) {
        val last = broker.curr
        // pending to dump until other event happens
        if (last == null || last.event !is DxTextEvent) {
            val evt = DxTextEvent(down.text, down.downTime)
            broker.addPair(owner, evt)
        } else {
            val evt = DxTextEvent(down.text, last.event.t)
            broker.addEvent(evt)
        }
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

    private fun newEncodedTextEvent(cs: CharSequence, encode: Boolean) = TextEvent(
        if (encode) {
            Base64.encodeToString(cs.toString().toByteArray(), Base64.NO_WRAP).trim()
        } else {
            cs.toString()
        }
    )
}