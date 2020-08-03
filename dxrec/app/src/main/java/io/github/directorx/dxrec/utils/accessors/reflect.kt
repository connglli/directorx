package io.github.directorx.dxrec.utils.accessors

import java.lang.reflect.Field
import java.lang.reflect.Method
import java.util.*

// Attention, all reflection always fails when come across obfuscations

// Get a field value (if does exist, search its parent)
fun <F> Class<*>.getFieldValue(obj: Any?, name: String, parent: Boolean = true): F? {
    val field = try {
        if (parent) {
            getDeclaredFieldIncludingParent(name)
        } else {
            getDeclaredField(name)
        }
    } catch (t: Throwable) {
        null
    } ?: return null

    // set accessible in case private,
    // protected, and package
    field.isAccessible = true

    @Suppress("UNCHECKED_CAST")
    return field.get(obj) as F?
}

// Get a field value (if does exist, search its parent)
fun <F> Class<*>.getFieldValue(name: String, parent: Boolean = true): F? {
    return getFieldValue(null, name, parent)
}

fun Class<*>.getDeclaredFieldIncludingParent(name: String): Field? {
    var currClass: Class<*>? = this
    while (currClass != null) {
        val field = try {
            currClass.getDeclaredField(name)
        } catch (e: NoSuchFieldException) {
            null
        }
        if (field != null) {
            field.isAccessible = true
            return field
        }
        currClass = currClass.superclass
    }
    return null
}

fun Class<*>.getDeclaredMethodIncludingParent(name: String, vararg parameterTypes: Class<*>): Method? {
    var currClass: Class<*>? = this
    while (currClass != null) {
        val method = try {
            currClass.getDeclaredMethod(name, *parameterTypes)
        } catch (e: NoSuchMethodException) {
            null
        }
        if (method != null) {
            method.isAccessible = true
            return method
        }
        currClass = currClass.superclass
    }
    return null
}

// One can never use the `is` operator (i.e. instanceof) on a class
// belonging to a 2nd or 3rd party libraries, because the same class
// of different versions are still different, and the operator
// returns false thereby
infix fun Any.instanceof(clsName: String): Boolean {
    val queue = LinkedList<Class<*>>()
    queue.offer(this.javaClass)
    while (queue.isNotEmpty()) {
        val currClass = queue.poll()!!
        if (currClass.name == clsName) {
            return true
        }
        if (currClass.superclass != null) {
            queue.offer(currClass.superclass)
        }
        for (inf in currClass.interfaces) {
            queue.offer(inf)
        }
    }
    return false
}