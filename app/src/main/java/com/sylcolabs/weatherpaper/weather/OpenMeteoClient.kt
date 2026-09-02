package com.sylcolabs.weatherpaper.weather

import android.util.Log
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Open-Meteo client built on HttpURLConnection and org.json.
 *
 * Both are in the Android framework, which is the point: Retrofit + OkHttp + a JSON library
 * would add hundreds of kilobytes to an APK whose whole budget is a few hundred.
 *
 * Open-Meteo needs no API key and its data is CC BY 4.0; the attribution is shown in settings.
 */
internal object OpenMeteoClient {

    private const val TAG = "WeatherPaper"
    private const val FORECAST = "https://api.open-meteo.com/v1/forecast"
    private const val GEOCODE = "https://geocoding-api.open-meteo.com/v1/search"
    private const val TIMEOUT_MS = 12_000

    fun fetch(latitude: Double, longitude: Double): Observation? {
        val url = FORECAST +
            "?latitude=" + fmt(latitude) +
            "&longitude=" + fmt(longitude) +
            "&current=temperature_2m,weather_code,cloud_cover,precipitation,wind_speed_10m,is_day" +
            "&daily=sunrise,sunset&timezone=auto&forecast_days=1"

        val body = get(url) ?: return null
        return try {
            val root = JSONObject(body)
            val current = root.getJSONObject("current")
            val daily = root.getJSONObject("daily")
            Observation(
                weatherCode = current.optInt("weather_code", 0),
                tempC = current.optDouble("temperature_2m", 0.0).toFloat(),
                cloudCover = (current.optDouble("cloud_cover", 0.0) / 100.0).toFloat().coerceIn(0f, 1f),
                windKmh = current.optDouble("wind_speed_10m", 0.0).toFloat(),
                sunriseHour = hourOf(daily.getJSONArray("sunrise").optString(0), 6.5f),
                sunsetHour = hourOf(daily.getJSONArray("sunset").optString(0), 19.5f),
                fetchedAt = System.currentTimeMillis(),
            )
        } catch (e: Exception) {
            Log.w(TAG, "Could not parse forecast", e)
            null
        }
    }

    fun geocode(query: String, limit: Int = 6): List<Place> {
        val trimmed = query.trim()
        if (trimmed.isEmpty()) return emptyList()
        val url = GEOCODE + "?name=" + URLEncoder.encode(trimmed, "UTF-8") +
            "&count=" + limit + "&language=en&format=json"

        val body = get(url) ?: return emptyList()
        return try {
            val results = JSONObject(body).optJSONArray("results") ?: return emptyList()
            (0 until results.length()).mapNotNull { i ->
                val o = results.optJSONObject(i) ?: return@mapNotNull null
                Place(
                    name = o.optString("name"),
                    latitude = o.optDouble("latitude"),
                    longitude = o.optDouble("longitude"),
                    region = listOfNotNull(
                        o.optString("admin1").takeIf { it.isNotBlank() },
                        o.optString("country").takeIf { it.isNotBlank() },
                    ).joinToString(", ").takeIf { it.isNotBlank() },
                )
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not parse geocoding response", e)
            emptyList()
        }
    }

    private fun get(spec: String): String? {
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(spec).openConnection() as HttpURLConnection).apply {
                connectTimeout = TIMEOUT_MS
                readTimeout = TIMEOUT_MS
                requestMethod = "GET"
                setRequestProperty("Accept", "application/json")
                setRequestProperty("User-Agent", "WeatherPaper/0.1 (Android live wallpaper)")
            }
            if (conn.responseCode !in 200..299) {
                Log.w(TAG, "HTTP ${conn.responseCode} from ${spec.substringBefore('?')}")
                return null
            }
            conn.inputStream.bufferedReader().use(BufferedReader::readText)
        } catch (e: Exception) {
            Log.w(TAG, "Request failed", e)
            null
        } finally {
            conn?.disconnect()
        }
    }

    /** Open-Meteo returns local ISO times like 2026-09-02T06:15 - we only need the clock part. */
    private fun hourOf(iso: String, fallback: Float): Float {
        val t = iso.indexOf('T')
        if (t < 0 || iso.length < t + 6) return fallback
        val hh = iso.substring(t + 1, t + 3).toIntOrNull() ?: return fallback
        val mm = iso.substring(t + 4, t + 6).toIntOrNull() ?: return fallback
        return hh + mm / 60f
    }

    private fun fmt(v: Double) = String.format(java.util.Locale.US, "%.4f", v)
}
