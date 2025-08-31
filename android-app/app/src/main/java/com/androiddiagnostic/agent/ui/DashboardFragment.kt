package com.androiddiagnostic.agent.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.lifecycle.ViewModelProvider
import androidx.recyclerview.widget.LinearLayoutManager
import com.androiddiagnostic.agent.R
import com.androiddiagnostic.agent.databinding.FragmentDashboardBinding
import com.androiddiagnostic.agent.viewmodels.MainViewModel

class DashboardFragment : Fragment() {
    
    private var _binding: FragmentDashboardBinding? = null
    private val binding get() = _binding!!
    
    private lateinit var viewModel: MainViewModel
    
    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentDashboardBinding.inflate(inflater, container, false)
        return binding.root
    }
    
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        
        viewModel = ViewModelProvider(requireActivity()).get(MainViewModel::class.java)
        
        setupObservers()
        setupClickListeners()
    }
    
    private fun setupObservers() {
        // Observe device status
        viewModel.deviceStatus.observe(viewLifecycleOwner) { status ->
            updateDeviceStatus(status)
        }
        
        // Observe metrics
        viewModel.metrics.observe(viewLifecycleOwner) { metrics ->
            updateMetricsDisplay(metrics)
        }
        
        // Observe command count
        viewModel.commandCount.observe(viewLifecycleOwner) { count ->
            binding.commandsCountText.text = count.toString()
        }
        
        // Observe alert count  
        viewModel.alertCount.observe(viewLifecycleOwner) { count ->
            binding.alertsCountText.text = count.toString()
            binding.alertsBadge.visibility = if (count > 0) View.VISIBLE else View.GONE
            binding.alertsBadge.text = count.toString()
        }
    }
    
    private fun setupClickListeners() {
        binding.refreshButton.setOnClickListener {
            viewModel.updateDeviceStatus()
        }
        
        binding.commandsCard.setOnClickListener {
            // Navigate to commands screen
            parentFragmentManager.beginTransaction()
                .replace(R.id.nav_host_fragment, CommandsFragment())
                .addToBackStack(null)
                .commit()
        }
        
        binding.alertsCard.setOnClickListener {
            // Navigate to alerts screen
            parentFragmentManager.beginTransaction()
                .replace(R.id.nav_host_fragment, AlertsFragment())
                .addToBackStack(null)
                .commit()
        }
        
        binding.settingsButton.setOnClickListener {
            // Navigate to settings
            parentFragmentManager.beginTransaction()
                .replace(R.id.nav_host_fragment, SettingsFragment())
                .addToBackStack(null)
                .commit()
        }
    }
    
    private fun updateDeviceStatus(status: MainViewModel.DeviceStatus) {
        binding.apply {
            // Update connection status
            connectionStatusText.text = if (status.isOnline) "Online" else "Offline"
            connectionStatusIcon.setImageResource(
                if (status.isOnline) R.drawable.ic_wifi else R.drawable.ic_wifi_off
            )
            
            // Update network type
            networkTypeText.text = if (status.isWifi) "Wi-Fi" else "Mobile"
            
            // Update battery
            batteryLevelText.text = "${status.batteryLevel}%"
            batteryProgressBar.progress = status.batteryLevel
            
            // Update capabilities
            rootStatusText.text = if (status.isRooted) "Available" else "Not Available"
            adbStatusText.text = if (status.hasAdb) "Enabled" else "Disabled"
            
            // Update last sync
            val minutes = (System.currentTimeMillis() - status.lastSync) / 60000
            lastSyncText.text = if (minutes < 1) "Just now" else "$minutes min ago"
        }
    }
    
    private fun updateMetricsDisplay(metrics: com.androiddiagnostic.agent.data.models.DeviceMetrics) {
        binding.apply {
            // CPU Usage
            cpuUsageText.text = "${metrics.cpu.toInt()}%"
            cpuProgressBar.progress = metrics.cpu.toInt()
            
            // Memory Usage
            memoryUsageText.text = "${metrics.memory.toInt()}%"
            memoryProgressBar.progress = metrics.memory.toInt()
            
            // Storage Usage
            storageUsageText.text = "${metrics.storage.toInt()}%"
            storageProgressBar.progress = metrics.storage.toInt()
            
            // Temperature
            temperatureText.text = "${metrics.temperature}°C"
            
            // Processes
            processCountText.text = metrics.processes.toString()
            
            // Uptime
            val hours = metrics.uptime / 3600000
            uptimeText.text = "$hours hours"
        }
    }
    
    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
