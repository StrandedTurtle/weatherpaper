package com.sylcolabs.weatherpaper.weather

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build
import com.sylcolabs.weatherpaper.Prefs

/**
 * Where to ask about the weather.
 *
 * Uses the framework LocationManager's last known fix - no Play Services, and no active GPS
 * request, so it costs essentially nothing. If the permission is refused or there is no fix
 * yet, the manually chosen place is used instead; the wallpaper never blocks on location.
 */
internal object LocationProvider {

    fun hasPermission(context: Context): Boolean =
        context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    fun resolve(context: Context, prefs: Prefs): Place? {
        if (prefs.useDeviceLocation && hasPermission(context)) {
            deviceLocation(context)?.let { return it }
        }
        return prefs.place
    }

    private fun deviceLocation(context: Context): Place? {
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
        val providers = buildList {
            add(LocationManager.PASSIVE_PROVIDER)
            add(LocationManager.NETWORK_PROVIDER)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) add(LocationManager.FUSED_PROVIDER)
            add(LocationManager.GPS_PROVIDER)
        }
        var best: android.location.Location? = null
        for (p in providers) {
            val loc = try {
                if (!lm.isProviderEnabled(p)) null else lm.getLastKnownLocation(p)
            } catch (e: SecurityException) {
                null
            } catch (e: IllegalArgumentException) {
                null
            }
            if (loc != null && (best == null || loc.time > best.time)) best = loc
        }
        val l = best ?: return null
        return Place(name = "", latitude = l.latitude, longitude = l.longitude)
    }
}
