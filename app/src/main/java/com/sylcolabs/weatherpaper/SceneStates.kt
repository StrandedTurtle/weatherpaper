package com.sylcolabs.weatherpaper

import com.sylcolabs.weatherpaper.scene.SceneState
import com.sylcolabs.weatherpaper.weather.WeatherRepository
import java.util.Calendar

/**
 * Builds the scene state from the cached observation and the clock.
 *
 * Shared by the wallpaper and the settings preview so both show exactly the same scene - there
 * is no second, drifting version of this mapping.
 */
internal object SceneStates {

    fun current(prefs: Prefs, repo: WeatherRepository): SceneState {
        val obs = repo.cached()
        val cal = Calendar.getInstance()
        val code = obs?.weatherCode ?: 0
        val cloud = obs?.cloudCover ?: 0.25f
        return SceneState(
            hour = SceneState.hourOfDay(cal),
            sunrise = obs?.sunriseHour ?: 6.5f,
            sunset = obs?.sunsetHour ?: 19.5f,
            cloud = cloud,
            precip = SceneState.precipFor(code),
            condition = SceneState.conditionFor(code, cloud),
            wind = SceneState.windFor(obs?.windKmh ?: 6f),
            season = SceneState.seasonFor(cal.get(Calendar.MONTH) + 1, prefs.lastLatitude.toDouble()),
            thunder = SceneState.thunderFor(code),
            tempC = obs?.tempC,
            place = repo.placeName(),
            moonPhase = SceneState.moonPhaseAt(System.currentTimeMillis()),
        )
    }
}
