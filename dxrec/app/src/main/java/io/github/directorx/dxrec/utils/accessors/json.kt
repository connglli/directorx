package io.github.directorx.dxrec.utils.accessors

import org.json.JSONArray

operator fun JSONArray.contains(obj: Any): Boolean {
    for (i in 0 until this.length()) {
        val o = this.opt(i) ?: continue
        if (o == obj) {
            return true
        }
    }
    return false
}