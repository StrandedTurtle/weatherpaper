package com.sylcolabs.weatherpaper.ui

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import com.sylcolabs.weatherpaper.Prefs
import com.sylcolabs.weatherpaper.R
import com.sylcolabs.weatherpaper.SceneStates
import com.sylcolabs.weatherpaper.scene.OverlayConfig
import com.sylcolabs.weatherpaper.weather.LocationProvider
import com.sylcolabs.weatherpaper.weather.OpenMeteoClient
import com.sylcolabs.weatherpaper.weather.Place
import com.sylcolabs.weatherpaper.weather.WeatherRepository

/**
 * Settings, built from plain framework views.
 *
 * No AndroidX and no XML layouts: the whole screen is a ScrollView of stock widgets, which keeps
 * the APK in the hundreds of kilobytes rather than the megabytes a support library would cost.
 */
class SettingsActivity : Activity() {

    private lateinit var prefs: Prefs
    private lateinit var repo: WeatherRepository
    private lateinit var preview: PreviewView
    private lateinit var placeLabel: TextView
    private lateinit var sizeLabel: TextView
    private lateinit var results: LinearLayout

    private val handler = Handler(Looper.getMainLooper())
    private var readout = OverlayConfig()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        repo = WeatherRepository(this, prefs)
        readout = prefs.overlay

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(BG)
            setPadding(dp(20), dp(20), dp(20), dp(28))
        }

        preview = PreviewView(this).apply {
            state = SceneStates.current(prefs, repo)
            readout = this@SettingsActivity.readout
            onReadoutMoved = { x, y ->
                this@SettingsActivity.readout = this@SettingsActivity.readout.copy(x = x, y = y)
                save()
            }
        }
        root.addView(preview, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        root.addView(caption("Drag the preview to move the readout."))

        root.addView(heading("Home-screen readout"))
        root.addView(caption("Shown on the home screen only — the lock screen stays clear."))
        root.addView(check("Clock", readout.showClock) { readout = readout.copy(showClock = it); save() })
        root.addView(check("24-hour clock", readout.clock24) { readout = readout.copy(clock24 = it); save() })
        root.addView(check("Temperature", readout.showTemp) { readout = readout.copy(showTemp = it); save() })
        root.addView(check("Condition", readout.showCondition) { readout = readout.copy(showCondition = it); save() })
        root.addView(check("Location name", readout.showLocation) { readout = readout.copy(showLocation = it); save() })
        root.addView(sizeRow())

        root.addView(heading("Location"))
        root.addView(check("Use my location", prefs.useDeviceLocation) { wanted ->
            if (wanted && !LocationProvider.hasPermission(this)) {
                requestPermissions(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION), REQ_LOCATION)
            } else {
                prefs.useDeviceLocation = wanted
                refreshWeather()
            }
        })
        placeLabel = caption(placeText())
        root.addView(placeLabel)
        root.addView(searchRow())
        results = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(results)

        root.addView(heading("About"))
        root.addView(caption(getString(R.string.attribution)))
        root.addView(caption("Set it as your wallpaper from Settings › Wallpaper › Live wallpapers."))

        setContentView(ScrollView(this).apply {
            setBackgroundColor(BG)
            addView(root)
        })
    }

    override fun onResume() {
        super.onResume()
        preview.animating = true
        refreshWeather()
    }

    override fun onPause() {
        super.onPause()
        preview.animating = false
    }

    override fun onDestroy() {
        preview.release()
        super.onDestroy()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        if (requestCode != REQ_LOCATION) return
        val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
        prefs.useDeviceLocation = granted
        if (!granted) toast("Location declined — searching for a place instead.")
        refreshWeather()
    }

    private fun save() {
        prefs.overlay = readout
        preview.readout = readout
    }

    /** Ask for fresh weather and repaint the preview when it lands. */
    private fun refreshWeather() {
        preview.state = SceneStates.current(prefs, repo)
        repo.refreshIfStale {
            handler.post {
                preview.state = SceneStates.current(prefs, repo)
                placeLabel.text = placeText()
            }
        }
    }

    private fun placeText(): String {
        if (prefs.useDeviceLocation && LocationProvider.hasPermission(this)) return "Following your location."
        val p = prefs.place
        return if (p == null) "No place set — search for one below." else "Showing weather for ${p.label}."
    }

    // ---------------------------------------------------------------- widgets
    private fun sizeRow(): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(6), 0, dp(6))
        }
        row.addView(TextView(this).apply {
            text = "Readout size"
            setTextColor(FG)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
        }, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))

        sizeLabel = TextView(this).apply {
            text = "${readout.size}×"
            setTextColor(MUTED)
            setPadding(dp(12), 0, dp(12), 0)
        }
        fun bump(by: Int) {
            readout = readout.copy(size = (readout.size + by).coerceIn(1, 4))
            sizeLabel.text = "${readout.size}×"
            save()
        }
        row.addView(button("−") { bump(-1) })
        row.addView(sizeLabel)
        row.addView(button("+") { bump(1) })
        return row
    }

    private fun searchRow(): View {
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val input = EditText(this).apply {
            hint = "Town or city"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_WORDS
            setTextColor(FG)
            setHintTextColor(MUTED)
        }
        row.addView(input, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
        row.addView(button("Search") { search(input.text.toString()) })
        return row
    }

    private fun search(query: String) {
        if (query.isBlank()) return
        results.removeAllViews()
        results.addView(caption("Searching…"))
        Thread({
            val found = OpenMeteoClient.geocode(query)
            handler.post { showResults(found) }
        }, "weatherpaper-geocode").apply { isDaemon = true }.start()
    }

    private fun showResults(found: List<Place>) {
        results.removeAllViews()
        if (found.isEmpty()) {
            results.addView(caption("Nothing found. Try a different spelling."))
            return
        }
        for (p in found) {
            results.addView(button(p.label) {
                prefs.place = p
                prefs.lastLatitude = p.latitude.toFloat()
                prefs.observation?.let { prefs.observation = it.copy(fetchedAt = 0L) } // force a refetch
                results.removeAllViews()
                placeLabel.text = placeText()
                refreshWeather()
            })
        }
    }

    private fun heading(text: String) = TextView(this).apply {
        this.text = text
        setTextColor(ACCENT)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
        setPadding(0, dp(22), 0, dp(4))
        letterSpacing = 0.08f
        isAllCaps = true
    }

    private fun caption(text: String) = TextView(this).apply {
        this.text = text
        setTextColor(MUTED)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
        setPadding(0, dp(4), 0, dp(8))
    }

    private fun check(label: String, initial: Boolean, onChange: (Boolean) -> Unit) =
        CheckBox(this).apply {
            text = label
            isChecked = initial
            setTextColor(FG)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            setPadding(dp(8), dp(6), 0, dp(6))
            setOnCheckedChangeListener { _, v -> onChange(v) }
        }

    private fun button(label: String, onClick: () -> Unit) = Button(this).apply {
        text = label
        setTextColor(FG)
        setOnClickListener { onClick() }
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private companion object {
        const val REQ_LOCATION = 1
        val BG = Color.rgb(0x0B, 0x13, 0x10)
        val FG = Color.rgb(0xC6, 0xD4, 0xC9)
        val MUTED = Color.rgb(0x77, 0x8C, 0x80)
        val ACCENT = Color.rgb(0x5F, 0xA8, 0x6B)
    }
}
