package com.androiddiagnostic

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.androiddiagnostic.databinding.ActivityMainBinding
import com.androiddiagnostic.services.DeviceMonitorService
import com.androiddiagnostic.utils.FirebaseManager
import com.androiddiagnostic.utils.PermissionHelper
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {
    
    private lateinit var binding: ActivityMainBinding
    private lateinit var firebaseManager: FirebaseManager
    private lateinit var auth: FirebaseAuth
    private lateinit var permissionHelper: PermissionHelper
    
    // Permission launchers
    private lateinit var permissionLauncher: ActivityResultLauncher<Array<String>>
    private lateinit var batteryOptimizationLauncher: ActivityResultLauncher<Intent>
    private lateinit var usageStatsLauncher: ActivityResultLauncher<Intent>
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        initializeComponents()
        setupPermissionLaunchers()
        setupUI()
        checkAuthenticationStatus()
    }
    
    private fun initializeComponents() {
        firebaseManager = FirebaseManager()
        auth = FirebaseAuth.getInstance()
        permissionHelper = PermissionHelper(this)
    }
    
    private fun setupPermissionLaunchers() {
        permissionLauncher = registerForActivityResult(
            ActivityResultContracts.RequestMultiplePermissions()
        ) { permissions ->
            val allGranted = permissions.entries.all { it.value }
            if (allGranted) {
                onAllPermissionsGranted()
            } else {
                handlePermissionDenied(permissions)
            }
        }
        
        batteryOptimizationLauncher = registerForActivityResult(
            ActivityResultContracts.StartActivityForResult()
        ) { result ->
            checkBatteryOptimizationStatus()
        }
        
        usageStatsLauncher = registerForActivityResult(
            ActivityResultContracts.StartActivityForResult()
        ) { result ->
            checkUsageStatsPermission()
        }
    }
    
    private fun setupUI() {
        binding.apply {
            btnLogin.setOnClickListener { 
                showLoginDialog() 
            }
            
            btnRegister.setOnClickListener { 
                showRegisterDialog() 
            }
            
            btnStartService.setOnClickListener { 
                startMonitoringService() 
            }
            
            btnStopService.setOnClickListener { 
                stopMonitoringService() 
            }
            
            btnRequestPermissions.setOnClickListener { 
                requestAllPermissions() 
            }
            
            btnSettings.setOnClickListener {
                // Navigate to settings
                startActivity(Intent(this@MainActivity, SettingsActivity::class.java))
            }
        }
    }
    
    private fun checkAuthenticationStatus() {
        val currentUser = auth.currentUser
        if (currentUser != null) {
            // User is signed in
            updateUIForAuthenticatedUser()
            requestAllPermissions()
        } else {
            // User is not signed in
            updateUIForUnauthenticatedUser()
        }
    }
    
    private fun updateUIForAuthenticatedUser() {
        binding.apply {
            layoutAuthenticated.visibility = android.view.View.VISIBLE
            layoutUnauthenticated.visibility = android.view.View.GONE
            textUserEmail.text = auth.currentUser?.email
        }
    }
    
    private fun updateUIForUnauthenticatedUser() {
        binding.apply {
            layoutAuthenticated.visibility = android.view.View.GONE
            layoutUnauthenticated.visibility = android.view.View.VISIBLE
        }
    }
    
    private fun showLoginDialog() {
        // Create and show login dialog
        val dialogFragment = LoginDialogFragment()
        dialogFragment.show(supportFragmentManager, "LoginDialog")
    }
    
    private fun showRegisterDialog() {
        // Create and show register dialog
        val dialogFragment = RegisterDialogFragment()
        dialogFragment.show(supportFragmentManager, "RegisterDialog")
    }
    
    private fun requestAllPermissions() {
        val requiredPermissions = permissionHelper.getRequiredPermissions()
        val missingPermissions = requiredPermissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        
        if (missingPermissions.isNotEmpty()) {
            permissionLauncher.launch(missingPermissions.toTypedArray())
        } else {
            checkSpecialPermissions()
        }
    }
    
    private fun checkSpecialPermissions() {
        // Check battery optimization
        if (!permissionHelper.isBatteryOptimizationDisabled()) {
            requestBatteryOptimizationExemption()
            return
        }
        
        // Check usage stats permission
        if (!permissionHelper.hasUsageStatsPermission()) {
            requestUsageStatsPermission()
            return
        }
        
        // All permissions granted
        onAllPermissionsGranted()
    }
    
    private fun requestBatteryOptimizationExemption() {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:$packageName")
        }
        batteryOptimizationLauncher.launch(intent)
    }
    
    private fun requestUsageStatsPermission() {
        val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
        usageStatsLauncher.launch(intent)
    }
    
    private fun onAllPermissionsGranted() {
        binding.apply {
            textPermissionStatus.text = "All permissions granted"
            textPermissionStatus.setTextColor(ContextCompat.getColor(this@MainActivity, android.R.color.holo_green_dark))
            btnStartService.isEnabled = true
        }
        
        // Initialize device with Firebase
        lifecycleScope.launch {
            try {
                firebaseManager.registerDevice()
                Toast.makeText(this@MainActivity, "Device registered successfully", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                Toast.makeText(this@MainActivity, "Failed to register device: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }
    
    private fun handlePermissionDenied(permissions: Map<String, Boolean>) {
        val deniedPermissions = permissions.filter { !it.value }.keys
        binding.apply {
            textPermissionStatus.text = "Missing permissions: ${deniedPermissions.joinToString(", ")}"
            textPermissionStatus.setTextColor(ContextCompat.getColor(this@MainActivity, android.R.color.holo_red_dark))
            btnStartService.isEnabled = false
        }
    }
    
    private fun checkBatteryOptimizationStatus() {
        if (permissionHelper.isBatteryOptimizationDisabled()) {
            checkUsageStatsPermission()
        } else {
            binding.textPermissionStatus.text = "Battery optimization exemption required"
        }
    }
    
    private fun checkUsageStatsPermission() {
        if (permissionHelper.hasUsageStatsPermission()) {
            onAllPermissionsGranted()
        } else {
            binding.textPermissionStatus.text = "Usage stats permission required"
        }
    }
    
    private fun startMonitoringService() {
        val serviceIntent = Intent(this, DeviceMonitorService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent)
        } else {
            startService(serviceIntent)
        }
        
        binding.apply {
            btnStartService.isEnabled = false
            btnStopService.isEnabled = true
            textServiceStatus.text = "Service running"
            textServiceStatus.setTextColor(ContextCompat.getColor(this@MainActivity, android.R.color.holo_green_dark))
        }
    }
    
    private fun stopMonitoringService() {
        val serviceIntent = Intent(this, DeviceMonitorService::class.java)
        stopService(serviceIntent)
        
        binding.apply {
            btnStartService.isEnabled = true
            btnStopService.isEnabled = false
            textServiceStatus.text = "Service stopped"
            textServiceStatus.setTextColor(ContextCompat.getColor(this@MainActivity, android.R.color.holo_red_dark))
        }
    }
    
    override fun onResume() {
        super.onResume()
        // Update permission status when returning to the activity
        updatePermissionStatus()
    }
    
    private fun updatePermissionStatus() {
        val hasAllPermissions = permissionHelper.hasAllRequiredPermissions()
        binding.btnStartService.isEnabled = hasAllPermissions && auth.currentUser != null
        
        if (hasAllPermissions) {
            binding.textPermissionStatus.text = "All permissions granted"
            binding.textPermissionStatus.setTextColor(ContextCompat.getColor(this, android.R.color.holo_green_dark))
        }
    }
}