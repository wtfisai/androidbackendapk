package com.androiddiagnostic.agent

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModelProvider
import androidx.navigation.findNavController
import androidx.navigation.ui.AppBarConfiguration
import androidx.navigation.ui.setupActionBarWithNavController
import androidx.navigation.ui.setupWithNavController
import com.androiddiagnostic.agent.databinding.ActivityMainBinding
import com.androiddiagnostic.agent.services.DeviceMonitorService
import com.androiddiagnostic.agent.services.CommandExecutorService
import com.androiddiagnostic.agent.utils.PermissionManager
import com.androiddiagnostic.agent.viewmodels.MainViewModel
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.karumi.dexter.Dexter
import com.karumi.dexter.MultiplePermissionsReport
import com.karumi.dexter.PermissionToken
import com.karumi.dexter.listener.PermissionRequest
import com.karumi.dexter.listener.multi.MultiplePermissionsListener

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var viewModel: MainViewModel
    private lateinit var auth: FirebaseAuth
    private lateinit var firestore: FirebaseFirestore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        // Initialize Firebase
        auth = FirebaseAuth.getInstance()
        firestore = FirebaseFirestore.getInstance()
        
        // Initialize ViewModel
        viewModel = ViewModelProvider(this)[MainViewModel::class.java]
        
        // Setup navigation
        setupNavigation()
        
        // Check authentication
        if (auth.currentUser == null) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }
        
        // Request permissions
        requestRequiredPermissions()
        
        // Start services
        startMonitoringServices()
    }
    
    private fun setupNavigation() {
        val navView: BottomNavigationView = binding.navView
        val navController = findNavController(R.id.nav_host_fragment_activity_main)
        
        val appBarConfiguration = AppBarConfiguration(
            setOf(
                R.id.navigation_dashboard,
                R.id.navigation_devices,
                R.id.navigation_commands,
                R.id.navigation_settings
            )
        )
        
        setupActionBarWithNavController(navController, appBarConfiguration)
        navView.setupWithNavController(navController)
    }
    
    private fun requestRequiredPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.INTERNET,
            Manifest.permission.ACCESS_NETWORK_STATE,
            Manifest.permission.ACCESS_WIFI_STATE,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        
        Dexter.withContext(this)
            .withPermissions(permissions)
            .withListener(object : MultiplePermissionsListener {
                override fun onPermissionsChecked(report: MultiplePermissionsReport) {
                    if (report.areAllPermissionsGranted()) {
                        // All permissions granted
                        checkSpecialPermissions()
                    } else {
                        // Handle denied permissions
                        Toast.makeText(
                            this@MainActivity,
                            "Some permissions are required for full functionality",
                            Toast.LENGTH_LONG
                        ).show()
                    }
                }
                
                override fun onPermissionRationaleShouldBeShown(
                    permissions: List<PermissionRequest>,
                    token: PermissionToken
                ) {
                    token.continuePermissionRequest()
                }
            }).check()
    }
    
    private fun checkSpecialPermissions() {
        // Check for usage stats permission
        if (!PermissionManager.hasUsageStatsPermission(this)) {
            startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
        }
        
        // Check for accessibility service
        if (!PermissionManager.isAccessibilityServiceEnabled(this)) {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }
        
        // Check for device admin
        if (!PermissionManager.isDeviceAdminActive(this)) {
            // Request device admin
            val intent = Intent().apply {
                action = "android.app.action.ADD_DEVICE_ADMIN"
                putExtra("android.app.extra.DEVICE_ADMIN", PermissionManager.getAdminComponentName(this@MainActivity))
                putExtra("android.app.extra.ADD_EXPLANATION", "Device admin access is required for advanced features")
            }
            startActivity(intent)
        }
    }
    
    private fun startMonitoringServices() {
        // Start device monitoring service
        val monitorIntent = Intent(this, DeviceMonitorService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(monitorIntent)
        } else {
            startService(monitorIntent)
        }
        
        // Start command executor service
        val commandIntent = Intent(this, CommandExecutorService::class.java)
        startService(commandIntent)
    }
    
    override fun onResume() {
        super.onResume()
        // Update device status
        viewModel.updateDeviceStatus()
    }
    
    override fun onDestroy() {
        super.onDestroy()
        // Cleanup if needed
    }
}
