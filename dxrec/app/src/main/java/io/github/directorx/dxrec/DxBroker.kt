package io.github.directorx.dxrec

import android.app.Activity
import io.github.directorx.dxrec.utils.accessors.dump
import java.util.*
import java.util.concurrent.BlockingQueue
import java.util.concurrent.LinkedBlockingQueue

class DxBroker(private val capacity: Int) {
    private val buffer: StringBuffer = StringBuffer()

    val staged: BlockingQueue<Item> = LinkedBlockingQueue()
    val indexed: LinkedList<Item> = LinkedList()

    val curr: Item?
    get() = indexed.lastOrNull()

    fun addActivity(act: Activity) {
        // each time an activity is added, a new item should
        // be created, and pushed
        addPair(act, DxDummyEvent(-1))
    }

    fun addEvent(evt: DxEvent) {
        // each time an event is added, last item should
        // be refreshed, and re-pushed
        val item = indexed.removeAt(indexed.size - 1)
        indexed.add(item.copy(evt = evt))
    }

    fun addPair(act: Activity, evt: DxEvent) {
        buffer.setLength(0)
        act.dump(buffer)
        if (indexed.size >= capacity) {
            indexed.removeAt(0)
        }
        indexed.add(Item(act.javaClass.name, evt, buffer.toString()))
    }

    fun commit() {
        for (i in indexed) {
            if (!i.committed) {
                i.committed = true
                staged.put(i)
            }
        }
    }

    // activity, event, decor_view
    data class Item(val act: String, val evt: DxEvent, val dump: String, var committed: Boolean = false)
}