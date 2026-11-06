package com.bestserve.mobile.fieldtracking

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Uploads the phone-side queue (FieldTrackingStore) to POST /api/field-tracking/points from the
 * background service itself, so the route reaches the server every few minutes even while the app is
 * closed. Mirrors flushPoints() in src/leads/fieldTracking.ts: oldest shift's points first, up to
 * BATCH a request, deleted from the phone only once the server took them; 400 / 404 (the server will
 * never take them) are dropped; anything else (no network, server down) stays for the next round.
 *
 * The server address and the signed-in user's token are handed over by the app (setAuth) while a
 * shift runs, kept in the app's private storage and cleared at End Shift and at logout. A 401 / 403
 * pauses uploading until the app hands over a fresh token - the points stay on the phone.
 */
object FieldTrackingUploader {
  private const val TAG = "FieldTrackingUpload"
  private const val PREFS = "field_tracking_upload"
  private const val KEY_BASE = "base_url"
  private const val KEY_TOKEN = "token"
  private const val BATCH = 500
  private const val TIMEOUT_MS = 20_000

  fun setAuth(context: Context, baseUrl: String, token: String) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putString(KEY_BASE, baseUrl.trimEnd('/'))
      .putString(KEY_TOKEN, token)
      .apply()
  }

  fun clearAuth(context: Context) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
  }

  /** One upload round. Runs on the service's background thread; never throws. */
  @Synchronized
  fun flush(context: Context) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val base = prefs.getString(KEY_BASE, null) ?: return
    val token = prefs.getString(KEY_TOKEN, null) ?: return
    val store = FieldTrackingStore.get(context)
    try {
      while (true) {
        val queued = store.pending(BATCH)
        if (queued.isEmpty()) return
        // The queue can hold more than one shift (ended and started again); the oldest one's first.
        val shiftId = queued[0].shiftId
        val batch = queued.filter { it.shiftId == shiftId }
        when (val status = post(base, token, shiftId, batch)) {
          in 200..299, 400, 404 -> store.delete(batch.map { it.id })
          401, 403 -> {
            // Signed out or the token expired: stop until the app hands over a fresh one.
            Log.w(TAG, "Upload refused ($status) - waiting for the app to sign in again")
            prefs.edit().remove(KEY_TOKEN).apply()
            return
          }
          else -> return // no network or server trouble: keep them for the next round
        }
      }
    } catch (e: Exception) {
      Log.w(TAG, "Upload round failed", e)
    }
  }

  /** The HTTP status, or -1 when the request could not be made (no network). */
  private fun post(base: String, token: String, shiftId: String, batch: List<FieldTrackingStore.Point>): Int {
    val points = JSONArray()
    for (p in batch) {
      points.put(
        JSONObject()
          .put("clientPointId", p.clientId)
          .put("capturedAtMs", p.ts)
          .put("latitude", p.lat)
          .put("longitude", p.lng)
          .put("accuracy", p.accuracy ?: JSONObject.NULL)
          .put("speedKmph", p.speedKmph ?: JSONObject.NULL)
          .put("bearing", p.bearing ?: JSONObject.NULL)
          .put("batteryPercent", p.battery ?: JSONObject.NULL),
      )
    }
    val body = JSONObject().put("shiftId", shiftId).put("points", points).toString().toByteArray(Charsets.UTF_8)
    var conn: HttpURLConnection? = null
    return try {
      conn = (URL("$base/api/field-tracking/points").openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = TIMEOUT_MS
        readTimeout = TIMEOUT_MS
        doOutput = true
        setRequestProperty("Content-Type", "application/json")
        setRequestProperty("Accept", "application/json")
        setRequestProperty("Authorization", "Bearer $token")
      }
      conn.outputStream.use { it.write(body) }
      conn.responseCode
    } catch (e: Exception) {
      -1
    } finally {
      conn?.disconnect()
    }
  }
}
