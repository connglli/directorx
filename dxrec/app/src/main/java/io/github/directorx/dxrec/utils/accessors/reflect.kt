package io.github.directorx.dxrec.utils.accessors

fun <T, F> Class<T>.getFieldValue(obj: T?, name: String): F? {
    val field = try {
        getDeclaredField(name)
    } catch (t: Throwable) {
        null
    } ?: return null

    // set accessible in case private,
    // protected, and package
    field.isAccessible = true

    @Suppress("UNCHECKED_CAST")
    return field.get(obj) as F?
}

fun <T, F> Class<T>.getFieldValue(name: String): F? {
    return getFieldValue(null, name)
}

fun <T> Class<T>.invokeMethod() {

}
