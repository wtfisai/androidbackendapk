package com.androiddiagnostic.receivers

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import android.widget.Toast

class DeviceAdminReceiver : DeviceAdminReceiver() {
    
    companion object {
        private const val TAG = "DeviceAdminReceiver"
    }
    
    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Log.d(TAG, "Device admin enabled")
        Toast.makeText(context, "Device admin enabled", Toast.LENGTH_SHORT).show()
    }
    
    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Log.d(TAG, "Device admin disabled")
        Toast.makeText(context, "Device admin disabled", Toast.LENGTH_SHORT).show()
    }
    
    override fun onDisableRequested(context: Context, intent: Intent): CharSequence {
        Log.d(TAG, "Device admin disable requested")
        return "Disabling device admin will remove advanced device management features"
    }
}