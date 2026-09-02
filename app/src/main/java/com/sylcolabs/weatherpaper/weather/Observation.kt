package com.sylcolabs.weatherpaper.weather

/** One weather reading, plus the day's sun times. Everything the scene needs, nothing more. */
internal data class Observation(
    val weatherCode: Int,
    val tempC: Float,
    val cloudCover: Float,   // 0..1
    val windKmh: Float,
    val sunriseHour: Float,
    val sunsetHour: Float,
    val fetchedAt: Long,
)

/** A geocoded place, from Open-Meteo's geocoding API or the device's coarse location. */
internal data class Place(
    val name: String,
    val latitude: Double,
    val longitude: Double,
    val region: String? = null,
) {
    val label: String get() = if (region.isNullOrBlank()) name else "$name, $region"
}
