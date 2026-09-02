package com.sylcolabs.weatherpaper

import android.content.Context
import android.content.SharedPreferences
import com.sylcolabs.weatherpaper.scene.OverlayConfig
import com.sylcolabs.weatherpaper.weather.Observation
import com.sylcolabs.weatherpaper.weather.Place

/**
 * All persisted state, on plain SharedPreferences.
 *
 * Deliberately not DataStore or Room: this is a handful of scalars, and the framework API costs
 * nothing to ship. Holding the last good observation here means the first frame after a reboot
 * is never blank.
 */
internal class Prefs(context: Context) {

    private val sp: SharedPreferences =
        context.applicationContext.getSharedPreferences("weatherpaper", Context.MODE_PRIVATE)

    // ---- overlay ----
    var overlay: OverlayConfig
        get() = OverlayConfig(
            enabled = sp.getBoolean(K_OV_ENABLED, true),
            showClock = sp.getBoolean(K_OV_CLOCK, true),
            showTemp = sp.getBoolean(K_OV_TEMP, true),
            showCondition = sp.getBoolean(K_OV_COND, false),
            showLocation = sp.getBoolean(K_OV_PLACE, false),
            x = sp.getFloat(K_OV_X, 0.5f),
            y = sp.getFloat(K_OV_Y, 0.30f),
            size = sp.getInt(K_OV_SIZE, 2),
            clock24 = sp.getBoolean(K_OV_24H, true),
        )
        set(v) = sp.edit()
            .putBoolean(K_OV_ENABLED, v.enabled)
            .putBoolean(K_OV_CLOCK, v.showClock)
            .putBoolean(K_OV_TEMP, v.showTemp)
            .putBoolean(K_OV_COND, v.showCondition)
            .putBoolean(K_OV_PLACE, v.showLocation)
            .putFloat(K_OV_X, v.x)
            .putFloat(K_OV_Y, v.y)
            .putInt(K_OV_SIZE, v.size)
            .putBoolean(K_OV_24H, v.clock24)
            .apply()

    // ---- location ----
    /** True when the user has opted into following the device's coarse location. */
    var useDeviceLocation: Boolean
        get() = sp.getBoolean(K_USE_GPS, false)
        set(v) = sp.edit().putBoolean(K_USE_GPS, v).apply()

    /** The manually chosen fallback place, used when device location is off or unavailable. */
    var place: Place?
        get() {
            val name = sp.getString(K_PLACE_NAME, null) ?: return null
            return Place(
                name = name,
                latitude = sp.getFloat(K_PLACE_LAT, 0f).toDouble(),
                longitude = sp.getFloat(K_PLACE_LON, 0f).toDouble(),
                region = sp.getString(K_PLACE_REGION, null),
            )
        }
        set(v) {
            val e = sp.edit()
            if (v == null) {
                e.remove(K_PLACE_NAME).remove(K_PLACE_LAT).remove(K_PLACE_LON).remove(K_PLACE_REGION)
            } else {
                e.putString(K_PLACE_NAME, v.name)
                    .putFloat(K_PLACE_LAT, v.latitude.toFloat())
                    .putFloat(K_PLACE_LON, v.longitude.toFloat())
                    .putString(K_PLACE_REGION, v.region)
            }
            e.apply()
        }

    /** Latitude of the last successful fetch, used to pick the hemisphere for seasons. */
    var lastLatitude: Float
        get() = sp.getFloat(K_LAST_LAT, 51f)
        set(v) = sp.edit().putFloat(K_LAST_LAT, v).apply()

    // ---- last good observation ----
    var observation: Observation?
        get() {
            val at = sp.getLong(K_OBS_AT, 0L)
            if (at == 0L) return null
            return Observation(
                weatherCode = sp.getInt(K_OBS_CODE, 0),
                tempC = sp.getFloat(K_OBS_TEMP, 0f),
                cloudCover = sp.getFloat(K_OBS_CLOUD, 0f),
                windKmh = sp.getFloat(K_OBS_WIND, 0f),
                sunriseHour = sp.getFloat(K_OBS_RISE, 6.5f),
                sunsetHour = sp.getFloat(K_OBS_SET, 19.5f),
                fetchedAt = at,
            )
        }
        set(v) {
            if (v == null) return
            sp.edit()
                .putInt(K_OBS_CODE, v.weatherCode)
                .putFloat(K_OBS_TEMP, v.tempC)
                .putFloat(K_OBS_CLOUD, v.cloudCover)
                .putFloat(K_OBS_WIND, v.windKmh)
                .putFloat(K_OBS_RISE, v.sunriseHour)
                .putFloat(K_OBS_SET, v.sunsetHour)
                .putLong(K_OBS_AT, v.fetchedAt)
                .apply()
        }

    fun registerListener(l: SharedPreferences.OnSharedPreferenceChangeListener) =
        sp.registerOnSharedPreferenceChangeListener(l)

    fun unregisterListener(l: SharedPreferences.OnSharedPreferenceChangeListener) =
        sp.unregisterOnSharedPreferenceChangeListener(l)

    private companion object {
        const val K_OV_ENABLED = "ov_enabled"; const val K_OV_CLOCK = "ov_clock"
        const val K_OV_TEMP = "ov_temp"; const val K_OV_COND = "ov_cond"
        const val K_OV_PLACE = "ov_place"; const val K_OV_X = "ov_x"
        const val K_OV_Y = "ov_y"; const val K_OV_SIZE = "ov_size"; const val K_OV_24H = "ov_24h"
        const val K_USE_GPS = "use_gps"; const val K_LAST_LAT = "last_lat"
        const val K_PLACE_NAME = "place_name"; const val K_PLACE_LAT = "place_lat"
        const val K_PLACE_LON = "place_lon"; const val K_PLACE_REGION = "place_region"
        const val K_OBS_CODE = "obs_code"; const val K_OBS_TEMP = "obs_temp"
        const val K_OBS_CLOUD = "obs_cloud"; const val K_OBS_WIND = "obs_wind"
        const val K_OBS_RISE = "obs_rise"; const val K_OBS_SET = "obs_set"
        const val K_OBS_AT = "obs_at"
    }
}
