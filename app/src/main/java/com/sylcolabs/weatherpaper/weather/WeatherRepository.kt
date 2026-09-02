package com.sylcolabs.weatherpaper.weather

import android.content.Context
import com.sylcolabs.weatherpaper.Prefs
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Weather with no background work at all.
 *
 * There is no JobScheduler, no WorkManager and no alarm: the wallpaper is only worth updating
 * while it is on screen, so a refresh is attempted when it becomes visible and the cache has
 * gone stale. The last good reading is persisted, so there is always something to draw.
 */
internal class WeatherRepository(context: Context, private val prefs: Prefs) {

    private val appContext = context.applicationContext
    private val fetching = AtomicBoolean(false)

    /** The most recent reading, however old. */
    fun cached(): Observation? = prefs.observation

    fun isStale(now: Long = System.currentTimeMillis()): Boolean {
        val obs = prefs.observation ?: return true
        return now - obs.fetchedAt > STALE_AFTER_MS
    }

    /**
     * Refresh on a background thread if the cache is stale. [onUpdated] runs on that thread when
     * a new reading lands; callers post back to their own looper.
     */
    fun refreshIfStale(onUpdated: (Observation) -> Unit) {
        if (!isStale()) return
        if (!fetching.compareAndSet(false, true)) return
        Thread({
            try {
                val place = LocationProvider.resolve(appContext, prefs)
                if (place != null) {
                    val obs = OpenMeteoClient.fetch(place.latitude, place.longitude)
                    if (obs != null) {
                        prefs.observation = obs
                        prefs.lastLatitude = place.latitude.toFloat()
                        onUpdated(obs)
                    }
                }
            } finally {
                fetching.set(false)
            }
        }, "weatherpaper-fetch").apply { isDaemon = true }.start()
    }

    /** Name to show in the readout: the chosen place, or nothing when following device location. */
    fun placeName(): String? = prefs.place?.name?.takeIf { it.isNotBlank() }

    private companion object {
        const val STALE_AFTER_MS = 30L * 60L * 1000L
    }
}
