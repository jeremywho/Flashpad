package com.mobile

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.quicksettings.TileService
import androidx.annotation.RequiresApi

@RequiresApi(Build.VERSION_CODES.N)
class QuickCaptureTileService : TileService() {

    override fun onStartListening() {
        super.onStartListening()
        // Update tile state if needed
        qsTile?.let { tile ->
            tile.label = "Quick Note"
            tile.contentDescription = "Capture a quick note"
            tile.updateTile()
        }
    }

    override fun onClick() {
        super.onClick()

        // Create intent to open the app with deep link to QuickCapture
        val intent = Intent(Intent.ACTION_VIEW).apply {
            data = Uri.parse("flashpad://quick-capture")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }

        // Close the notification shade and start the activity
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startActivityAndCollapse(intent)
        } else {
            @Suppress("DEPRECATION")
            startActivityAndCollapse(intent)
        }
    }
}
