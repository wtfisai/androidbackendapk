package com.androiddiagnostic.agent.ui

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import com.androiddiagnostic.agent.LoginActivity
import com.androiddiagnostic.agent.R
import com.androiddiagnostic.agent.databinding.FragmentSettingsBinding
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore

class SettingsFragment : Fragment() {
    
    private var _binding: FragmentSettingsBinding? = null
    private val binding get() = _binding!!
    
    private val auth = FirebaseAuth.getInstance()
    private val firestore = FirebaseFirestore.getInstance()
    
    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentSettingsBinding.inflate(inflater, container, false)
        return binding.root
    }
    
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        
        loadUserInfo()
        loadDeviceInfo()
        loadSettings()
        setupClickListeners()
    }
    
    private fun loadUserInfo() {
        auth.currentUser?.let { user ->
            binding.userEmailText.text = user.email
            binding.userIdText.text = user.uid
            
            // Load subscription info
            firestore.collection("users")
                .document(user.uid)
                .get()
                .addOnSuccessListener { doc ->
                    val subscription = doc.getString("subscription") ?: "free"
                    binding.subscriptionText.text = subscription.capitalize()
                    
                    // Get device limit
                    val deviceLimit = doc.getLong("deviceLimit") ?: 1
                    binding.deviceLimitText.text = if (deviceLimit == -1L) "Unlimited" else deviceLimit.toString()
                    
                    // Get command limit
                    val commandLimit = doc.getLong("commandLimit") ?: 100
                    binding.commandLimitText.text = if (commandLimit == -1L) "Unlimited" else "$commandLimit/month"
                }
        }
    }
    
    private fun loadDeviceInfo() {
        val deviceId = getDeviceId()
        binding.deviceIdText.text = deviceId
        
        if (deviceId.isNotEmpty()) {
            firestore.collection("devices")
                .document(deviceId)
                .get()
                .addOnSuccessListener { doc ->
                    binding.deviceNameText.text = doc.getString("name") ?: "Unknown"
                    binding.deviceModelText.text = doc.getString("model") ?: "Unknown"
                    binding.androidVersionText.text = doc.getString("androidVersion") ?: "Unknown"
                    
                    val capabilities = doc.get("capabilities") as? Map<*, *>
                    val hasRoot = capabilities?.get("root") as? Boolean ?: false
                    val hasAdb = capabilities?.get("adb") as? Boolean ?: false
                    
                    binding.rootStatusText.text = if (hasRoot) "Available" else "Not Available"
                    binding.adbStatusText.text = if (hasAdb) "Enabled" else "Disabled"
                }
        }
    }
    
    private fun loadSettings() {
        val sharedPrefs = requireContext().getSharedPreferences("app_settings", android.content.Context.MODE_PRIVATE)
        
        // Load notification settings
        binding.notificationSwitch.isChecked = sharedPrefs.getBoolean("notifications_enabled", true)
        binding.alertSoundSwitch.isChecked = sharedPrefs.getBoolean("alert_sound_enabled", true)
        binding.vibrationSwitch.isChecked = sharedPrefs.getBoolean("vibration_enabled", true)
        
        // Load monitoring settings
        binding.autoStartSwitch.isChecked = sharedPrefs.getBoolean("auto_start_enabled", false)
        binding.persistentNotificationSwitch.isChecked = sharedPrefs.getBoolean("persistent_notification", true)
        
        // Load sync interval
        val syncInterval = sharedPrefs.getInt("sync_interval", 15)
        binding.syncIntervalText.text = "$syncInterval minutes"
    }
    
    private fun setupClickListeners() {
        // Notification settings
        binding.notificationSwitch.setOnCheckedChangeListener { _, isChecked ->
            saveSettings("notifications_enabled", isChecked)
        }
        
        binding.alertSoundSwitch.setOnCheckedChangeListener { _, isChecked ->
            saveSettings("alert_sound_enabled", isChecked)
        }
        
        binding.vibrationSwitch.setOnCheckedChangeListener { _, isChecked ->
            saveSettings("vibration_enabled", isChecked)
        }
        
        // Monitoring settings
        binding.autoStartSwitch.setOnCheckedChangeListener { _, isChecked ->
            saveSettings("auto_start_enabled", isChecked)
        }
        
        binding.persistentNotificationSwitch.setOnCheckedChangeListener { _, isChecked ->
            saveSettings("persistent_notification", isChecked)
        }
        
        // Sync interval
        binding.syncIntervalLayout.setOnClickListener {
            showSyncIntervalDialog()
        }
        
        // Threshold settings
        binding.cpuThresholdLayout.setOnClickListener {
            showThresholdDialog("CPU", "cpu_threshold", 80)
        }
        
        binding.memoryThresholdLayout.setOnClickListener {
            showThresholdDialog("Memory", "memory_threshold", 85)
        }
        
        binding.batteryThresholdLayout.setOnClickListener {
            showThresholdDialog("Battery", "battery_threshold", 20)
        }
        
        binding.storageThresholdLayout.setOnClickListener {
            showThresholdDialog("Storage", "storage_threshold", 90)
        }
        
        binding.temperatureThresholdLayout.setOnClickListener {
            showThresholdDialog("Temperature", "temperature_threshold", 50)
        }
        
        // Upgrade subscription
        binding.upgradeButton.setOnClickListener {
            showUpgradeDialog()
        }
        
        // Export data
        binding.exportDataButton.setOnClickListener {
            exportData()
        }
        
        // Clear cache
        binding.clearCacheButton.setOnClickListener {
            showClearCacheDialog()
        }
        
        // Sign out
        binding.signOutButton.setOnClickListener {
            showSignOutDialog()
        }
    }
    
    private fun showSyncIntervalDialog() {
        val intervals = arrayOf("5 minutes", "10 minutes", "15 minutes", "30 minutes", "60 minutes")
        val values = intArrayOf(5, 10, 15, 30, 60)
        
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("Sync Interval")
            .setItems(intervals) { _, which ->
                saveSettings("sync_interval", values[which])
                binding.syncIntervalText.text = intervals[which]
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
    
    private fun showThresholdDialog(name: String, key: String, defaultValue: Int) {
        val inputView = layoutInflater.inflate(R.layout.dialog_threshold_input, null)
        val inputField = inputView.findViewById<com.google.android.material.textfield.TextInputEditText>(R.id.thresholdInput)
        
        val sharedPrefs = requireContext().getSharedPreferences("app_settings", android.content.Context.MODE_PRIVATE)
        val currentValue = sharedPrefs.getInt(key, defaultValue)
        inputField.setText(currentValue.toString())
        
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("$name Threshold")
            .setMessage("Set the threshold value (0-100)")
            .setView(inputView)
            .setPositiveButton("Save") { _, _ ->
                val value = inputField.text.toString().toIntOrNull() ?: defaultValue
                if (value in 0..100) {
                    saveSettings(key, value)
                    updateThresholdDisplay(key, value)
                    
                    // Update in Firestore
                    auth.currentUser?.let { user ->
                        firestore.collection("users")
                            .document(user.uid)
                            .update("settings.${key}Threshold", value)
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
    
    private fun updateThresholdDisplay(key: String, value: Int) {
        when (key) {
            "cpu_threshold" -> binding.cpuThresholdText.text = "$value%"
            "memory_threshold" -> binding.memoryThresholdText.text = "$value%"
            "battery_threshold" -> binding.batteryThresholdText.text = "$value%"
            "storage_threshold" -> binding.storageThresholdText.text = "$value%"
            "temperature_threshold" -> binding.temperatureThresholdText.text = "$value°C"
        }
    }
    
    private fun showUpgradeDialog() {
        val plans = arrayOf("Basic ($9.99/month)", "Professional ($29.99/month)", "Enterprise ($99.99/month)")
        val planIds = arrayOf("basic", "pro", "enterprise")
        
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("Upgrade Subscription")
            .setItems(plans) { _, which ->
                // In production, integrate with payment gateway
                showSuccess("Upgrade to ${plans[which]} - Payment integration pending")
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
    
    private fun exportData() {
        // Export device data to JSON
        showSuccess("Exporting data... (Feature in development)")
    }
    
    private fun showClearCacheDialog() {
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("Clear Cache")
            .setMessage("This will delete all cached data. Continue?")
            .setPositiveButton("Clear") { _, _ ->
                clearCache()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
    
    private fun clearCache() {
        try {
            requireContext().cacheDir.deleteRecursively()
            showSuccess("Cache cleared successfully")
        } catch (e: Exception) {
            showError("Failed to clear cache: ${e.message}")
        }
    }
    
    private fun showSignOutDialog() {
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("Sign Out")
            .setMessage("Are you sure you want to sign out?")
            .setPositiveButton("Sign Out") { _, _ ->
                signOut()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
    
    private fun signOut() {
        // Stop services
        requireContext().stopService(Intent(requireContext(), com.androiddiagnostic.agent.services.DeviceMonitorService::class.java))
        requireContext().stopService(Intent(requireContext(), com.androiddiagnostic.agent.services.CommandExecutorService::class.java))
        
        // Clear device ID
        requireContext().getSharedPreferences("device_prefs", android.content.Context.MODE_PRIVATE)
            .edit()
            .remove("device_id")
            .apply()
        
        // Sign out from Firebase
        auth.signOut()
        
        // Navigate to login
        startActivity(Intent(requireContext(), LoginActivity::class.java))
        requireActivity().finish()
    }
    
    private fun saveSettings(key: String, value: Any) {
        val sharedPrefs = requireContext().getSharedPreferences("app_settings", android.content.Context.MODE_PRIVATE)
        val editor = sharedPrefs.edit()
        
        when (value) {
            is Boolean -> editor.putBoolean(key, value)
            is Int -> editor.putInt(key, value)
            is String -> editor.putString(key, value)
        }
        
        editor.apply()
    }
    
    private fun getDeviceId(): String {
        val sharedPrefs = requireContext().getSharedPreferences("device_prefs", android.content.Context.MODE_PRIVATE)
        return sharedPrefs.getString("device_id", "") ?: ""
    }
    
    private fun showError(message: String) {
        com.google.android.material.snackbar.Snackbar.make(
            binding.root,
            message,
            com.google.android.material.snackbar.Snackbar.LENGTH_LONG
        ).show()
    }
    
    private fun showSuccess(message: String) {
        com.google.android.material.snackbar.Snackbar.make(
            binding.root,
            message,
            com.google.android.material.snackbar.Snackbar.LENGTH_SHORT
        ).show()
    }
    
    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
