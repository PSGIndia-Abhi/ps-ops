package com.bestserve.mobile.fieldtracking

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.util.UUID

/**
 * The phone-side queue of GPS points taken during a sales executive's shift. FieldTrackingService
 * writes every fix here first, so nothing is lost with no network; the JS uploader
 * (src/leads/fieldTracking.ts) reads them in batches, POSTs them to /api/field-tracking/points, and
 * deletes what the server accepted. Each point carries its own client_id, so a batch uploaded twice
 * (a retry after a dropped connection) is stored once on the server.
 *
 * Android's built-in SQLite - no extra library.
 */
class FieldTrackingStore(context: Context) :
  SQLiteOpenHelper(context.applicationContext, "field_tracking.db", null, 1) {

  data class Point(
    val id: Long,
    val clientId: String,
    val shiftId: String,
    val ts: Long,
    val lat: Double,
    val lng: Double,
    val accuracy: Double?,
    val speedKmph: Double?,
    val bearing: Double?,
    val battery: Int?,
  )

  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL(
      """
      CREATE TABLE points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT NOT NULL,
        shift_id TEXT NOT NULL,
        ts INTEGER NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        accuracy REAL,
        speed_kmph REAL,
        bearing REAL,
        battery INTEGER
      )
      """.trimIndent()
    )
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

  fun insert(shiftId: String, ts: Long, lat: Double, lng: Double, accuracy: Double?, speedKmph: Double?, bearing: Double?, battery: Int?) {
    val values = ContentValues().apply {
      put("client_id", UUID.randomUUID().toString())
      put("shift_id", shiftId)
      put("ts", ts)
      put("lat", lat)
      put("lng", lng)
      put("accuracy", accuracy)
      put("speed_kmph", speedKmph)
      put("bearing", bearing)
      put("battery", battery)
    }
    writableDatabase.insert("points", null, values)
  }

  /** Oldest first. */
  fun pending(limit: Int): List<Point> {
    val out = ArrayList<Point>()
    readableDatabase.rawQuery(
      "SELECT id, client_id, shift_id, ts, lat, lng, accuracy, speed_kmph, bearing, battery FROM points ORDER BY id ASC LIMIT ?",
      arrayOf(limit.toString())
    ).use { c ->
      while (c.moveToNext()) {
        out.add(
          Point(
            id = c.getLong(0),
            clientId = c.getString(1),
            shiftId = c.getString(2),
            ts = c.getLong(3),
            lat = c.getDouble(4),
            lng = c.getDouble(5),
            accuracy = if (c.isNull(6)) null else c.getDouble(6),
            speedKmph = if (c.isNull(7)) null else c.getDouble(7),
            bearing = if (c.isNull(8)) null else c.getDouble(8),
            battery = if (c.isNull(9)) null else c.getInt(9),
          )
        )
      }
    }
    return out
  }

  fun delete(ids: List<Long>) {
    if (ids.isEmpty()) return
    val db = writableDatabase
    db.beginTransaction()
    try {
      ids.chunked(500).forEach { chunk ->
        db.execSQL("DELETE FROM points WHERE id IN (${chunk.joinToString(",")})")
      }
      db.setTransactionSuccessful()
    } finally {
      db.endTransaction()
    }
  }

  fun count(): Int =
    readableDatabase.rawQuery("SELECT COUNT(*) FROM points", null).use { c -> if (c.moveToFirst()) c.getInt(0) else 0 }

  companion object {
    @Volatile private var instance: FieldTrackingStore? = null
    fun get(context: Context): FieldTrackingStore =
      instance ?: synchronized(this) { instance ?: FieldTrackingStore(context).also { instance = it } }
  }
}
