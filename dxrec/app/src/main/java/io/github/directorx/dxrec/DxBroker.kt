package io.github.directorx.dxrec

import java.util.*
import java.util.concurrent.BlockingQueue
import java.util.concurrent.LinkedBlockingQueue

class DxBroker(private val capacity: Int) {
    private val buffer: StringBuffer = StringBuffer()

    val committed: BlockingQueue<Item> = LinkedBlockingQueue()
    private val staged: LinkedList<Item> = LinkedList()

    val curr: Item?
    get() = staged.lastOrNull()

    fun addOwner(owner: DxViewOwner) {
        // each time an owner is added, a new item should
        // be created, and pushed
        addPair(owner, DxDummyEvent(-1))
    }

    fun addEvent(event: DxEvent) {
        // each time an event is added, last item should
        // be refreshed, and re-pushed
        val item = staged.removeAt(staged.size - 1)
        staged.add(item.copy(event = event))
    }

    fun addPair(owner: DxViewOwner, evt: DxEvent) {
        buffer.setLength(0)
        owner.dump(buffer)
        if (staged.size >= capacity) {
            staged.removeAt(0)
        }
        staged.add(Item(owner.name(), evt, buffer.toString()))
    }

    fun commit() {
        for (i in staged) {
            if (!i.committed) {
                i.committed = true
                committed.put(i)
            }
        }
    }

    data class Item(val owner: String, val event: DxEvent, val dump: String, var committed: Boolean = false)
}