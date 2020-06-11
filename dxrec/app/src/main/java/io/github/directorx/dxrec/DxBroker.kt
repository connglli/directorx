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

    fun add(act: Activity, evt: DxEvent, refresh: Boolean = false) {
        buffer.setLength(0)
        act.dump(buffer)
        if (refresh) {
            refresh(act.javaClass.name, buffer.toString(), evt)
        } else {
            push(act.javaClass.name, buffer.toString(), evt)
        }
    }

    fun add(act: String, tree: String, evt: DxEvent, refresh: Boolean = false) =
        if (refresh) {
            refresh(act, tree, evt)
        } else {
            push(act, tree, evt)
        }

    fun commit() {
        for (i in indexed) {
            if (!i.committed) {
                i.committed = true
                staged.put(i)
            }
        }
    }

    // replace the newest with the new evt
    private fun refresh(act: String, tree: String, evt: DxEvent) {
        indexed.removeAt(indexed.size - 1)
        indexed.add(Item(act, evt, tree))
    }

    // push new, if full pop head
    private fun push(act: String, tree: String, evt: DxEvent) {
        if (indexed.size >= capacity) {
            indexed.removeAt(0)
        }
        indexed.add(Item(act, evt, tree))
    }

    // activity, event, decor_view
    data class Item(val act: String, val evt: DxEvent, val dump: String, var committed: Boolean = false)
}