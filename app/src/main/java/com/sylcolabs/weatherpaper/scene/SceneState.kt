package com.sylcolabs.weatherpaper.scene

import java.util.Calendar
import java.util.TimeZone
import kotlin.math.PI
import kotlin.math.sin

internal enum class Precipitation { NONE, DRIZZLE, RAIN, HEAVY_RAIN, SNOW }
internal enum class SkyCondition { CLEAR, PARTLY, OVERCAST, FOG }
internal enum class Season { SPRING, SUMMER, AUTUMN, WINTER }

/**
 * Everything the renderer is allowed to know about the weather.
 *
 * Deliberately small: the whole scene is a pure function of this, so the layer cache can be
 * invalidated by comparing a handful of fields rather than tracking what changed where.
 */
internal data class SceneState(
    val hour: Float = 12f,
    val sunrise: Float = 6.5f,
    val sunset: Float = 19.5f,
    val cloud: Float = 0.2f,
    val precip: Precipitation = Precipitation.NONE,
    val condition: SkyCondition = SkyCondition.CLEAR,
    val wind: Float = 0.15f,
    val season: Season = Season.SUMMER,
    val thunder: Boolean = false,
    val tempC: Float? = null,
    val place: String? = null,
    val moonPhase: Float = 0.5f,
) {
    /** Normalised sun altitude, -1..1. Drives sky colour, foliage tint and star visibility. */
    fun sunAltitude(): Float {
        val dayLen = sunset - sunrise
        if (dayLen <= 0f) return -1f
        if (hour in sunrise..sunset) return sin(PI * ((hour - sunrise) / dayLen)).toFloat()
        val nightLen = 24f - dayLen
        val since = if (hour > sunset) hour - sunset else hour + 24f - sunset
        return -sin(PI * (since / nightLen)).toFloat()
    }

    val isDay: Boolean get() = hour in sunrise..sunset

    /**
     * Position within the 24h cycle, 0 at midnight, 0.25 at sunrise, 0.5 at solar noon,
     * 0.75 at sunset, wrapping back to 0. Piecewise-linear between those four anchors so the
     * time-of-day frames stay pinned to the real sunrise/sunset rather than to clock hours.
     */
    fun dayPhase(): Float {
        val rise = sunrise.coerceIn(0.01f, 23.98f)
        val set = sunset.coerceIn(rise + 0.01f, 23.99f)
        val noon = (rise + set) / 2f
        val h = ((hour % 24f) + 24f) % 24f
        val p = when {
            h < rise -> 0.25f * (h / rise)
            h < noon -> 0.25f + 0.25f * ((h - rise) / (noon - rise))
            h < set -> 0.5f + 0.25f * ((h - noon) / (set - noon))
            else -> 0.75f + 0.25f * ((h - set) / (24f - set))
        }
        return p.coerceIn(0f, 0.9999f)
    }

    companion object {
        /** WMO 4677 weather codes, as returned by Open-Meteo's `weather_code`. */
        fun precipFor(code: Int): Precipitation = when (code) {
            51, 53, 56 -> Precipitation.DRIZZLE
            55, 57, 61, 63, 66, 80, 81 -> Precipitation.RAIN
            65, 67, 82, 95, 96, 99 -> Precipitation.HEAVY_RAIN
            71, 73, 75, 77, 85, 86 -> Precipitation.SNOW
            else -> Precipitation.NONE
        }

        fun conditionFor(code: Int, cloudCover: Float): SkyCondition = when {
            code == 45 || code == 48 -> SkyCondition.FOG
            cloudCover > 0.85f -> SkyCondition.OVERCAST
            cloudCover > 0.35f -> SkyCondition.PARTLY
            else -> SkyCondition.CLEAR
        }

        fun thunderFor(code: Int) = code == 95 || code == 96 || code == 99

        /** Beaufort-ish normalisation: 0 calm, 1 at roughly gale force. */
        fun windFor(kmh: Float) = (kmh / 62f).coerceIn(0f, 1f)

        /** Meteorological season, flipped below the equator. */
        fun seasonFor(month: Int, latitude: Double): Season {
            val north = when (month) {
                3, 4, 5 -> Season.SPRING
                6, 7, 8 -> Season.SUMMER
                9, 10, 11 -> Season.AUTUMN
                else -> Season.WINTER
            }
            if (latitude >= 0) return north
            return when (north) {
                Season.SPRING -> Season.AUTUMN
                Season.SUMMER -> Season.WINTER
                Season.AUTUMN -> Season.SPRING
                Season.WINTER -> Season.SUMMER
            }
        }

        /** Position in the synodic month, 0 and 1 new, 0.5 full, from a known new moon. */
        fun moonPhaseAt(millis: Long): Float {
            val synodic = 29.530588853
            val known = 947182440000.0 // 2000-01-06T18:14Z
            val days = (millis - known) / 86_400_000.0
            val p = (days % synodic + synodic) % synodic / synodic
            return p.toFloat()
        }

        fun hourOfDay(cal: Calendar): Float =
            cal.get(Calendar.HOUR_OF_DAY) + cal.get(Calendar.MINUTE) / 60f + cal.get(Calendar.SECOND) / 3600f

        fun calendar(tz: TimeZone = TimeZone.getDefault()): Calendar = Calendar.getInstance(tz)
    }
}
