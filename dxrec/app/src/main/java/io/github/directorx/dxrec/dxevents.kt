package io.github.directorx.dxrec

sealed class DxEvent

data class DxTapEvent(
    val x: Float,
    val y: Float,
    val t: Long   // down time
) : DxEvent()

data class DxLongTapEvent(
    val x: Float,
    val y: Float,
    val t: Long   // down time
) : DxEvent()

data class DxDoubleTapEvent(
    val x: Float,
    val y: Float,
    val t: Long
) : DxEvent()

data class DxSwipeEvent(
    val x:  Float, // from y
    val y:  Float, // from x
    val dx: Float, // delta x
    val dy: Float, // delta y
    val t0: Long,  // down time
    val t1: Long   // up time
) : DxEvent()

data class DxKeyEvent(
    val c: Int,    // key code
    val k: String, // key str
    val t: Long    // down time
) : DxEvent()

data class DxDummyEvent(val t: Long) : DxEvent()