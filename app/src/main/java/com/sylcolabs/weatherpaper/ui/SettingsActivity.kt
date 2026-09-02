package com.sylcolabs.weatherpaper.ui

import android.app.Activity
import android.os.Bundle
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView
import com.sylcolabs.weatherpaper.R

/**
 * Settings. Built with plain framework views rather than AndroidX/Compose to keep the APK small.
 * Fleshed out in step 6 with the drag-to-position preview and overlay toggles.
 */
class SettingsActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(48, 48, 48, 48)
        }
        root.addView(TextView(this).apply { setText(R.string.app_name) })
        root.addView(TextView(this).apply { setText(R.string.attribution) })
        setContentView(root)
    }
}
