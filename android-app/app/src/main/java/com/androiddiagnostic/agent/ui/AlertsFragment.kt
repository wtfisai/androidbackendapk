package com.androiddiagnostic.agent.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import com.androiddiagnostic.agent.R
import com.androiddiagnostic.agent.databinding.FragmentAlertsBinding
import com.androiddiagnostic.agent.ui.adapters.AlertsAdapter
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query

class AlertsFragment : Fragment() {
    
    private var _binding: FragmentAlertsBinding? = null
    private val binding get() = _binding!!
    
    private lateinit var alertsAdapter: AlertsAdapter
    private val firestore = FirebaseFirestore.getInstance()
    private val auth = FirebaseAuth.getInstance()
    
    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentAlertsBinding.inflate(inflater, container, false)
        return binding.root
    }
    
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        
        setupRecyclerView()
        setupClickListeners()
        loadAlerts()
    }
    
    private fun setupRecyclerView() {
        alertsAdapter = AlertsAdapter(
            onItemClick = { alert ->
                showAlertDetails(alert)
            },
            onAcknowledge = { alert ->
                acknowledgeAlert(alert)
            }
        )
        
        binding.alertsRecyclerView.apply {
            layoutManager = LinearLayoutManager(requireContext())
            adapter = alertsAdapter
        }
    }
    
    private fun setupClickListeners() {
        binding.filterChipGroup.setOnCheckedChangeListener { _, checkedId ->
            when (checkedId) {
                R.id.chipActive -> loadAlerts("active")
                R.id.chipAcknowledged -> loadAlerts("acknowledged")
                R.id.chipResolved -> loadAlerts("resolved")
                R.id.chipAll -> loadAlerts()
            }
        }
        
        binding.swipeRefreshLayout.setOnRefreshListener {
            loadAlerts()
        }
        
        binding.clearAllButton.setOnClickListener {
            showClearAllDialog()
        }
    }
    
    private fun loadAlerts(statusFilter: String? = null) {
        val deviceId = getDeviceId()
        if (deviceId.isEmpty()) {
            binding.swipeRefreshLayout.isRefreshing = false
            return
        }
        
        var query: Query = firestore.collection("alerts")
            .whereEqualTo("deviceId", deviceId)
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .limit(50)
        
        if (statusFilter != null) {
            query = query.whereEqualTo("status", statusFilter)
        }
        
        query.addSnapshotListener { snapshot, error ->
            binding.swipeRefreshLayout.isRefreshing = false
            
            if (error != null) {
                showError("Failed to load alerts: ${error.message}")
                return@addSnapshotListener
            }
            
            val alerts = snapshot?.documents?.map { doc ->
                AlertsAdapter.Alert(
                    id = doc.id,
                    type = doc.getString("type") ?: "",
                    severity = doc.getString("severity") ?: "medium",
                    message = doc.getString("message") ?: "",
                    status = doc.getString("status") ?: "active",
                    value = doc.getDouble("value") ?: 0.0,
                    threshold = doc.getDouble("threshold") ?: 0.0,
                    createdAt = doc.getTimestamp("createdAt")?.toDate()?.time ?: 0
                )
            } ?: emptyList()
            
            alertsAdapter.submitList(alerts)
            
            // Update counts
            val activeCount = alerts.count { it.status == "active" }
            binding.activeCountText.text = "Active: $activeCount"
            
            binding.emptyStateText.visibility = if (alerts.isEmpty()) View.VISIBLE else View.GONE
        }
    }
    
    private fun showAlertDetails(alert: AlertsAdapter.Alert) {
        val details = StringBuilder()
        details.append("Type: ${alert.type.capitalize()}\n")
        details.append("Severity: ${alert.severity.capitalize()}\n")
        details.append("Status: ${alert.status.capitalize()}\n")
        details.append("Value: ${alert.value}\n")
        details.append("Threshold: ${alert.threshold}\n\n")
        details.append("Message:\n${alert.message}")
        
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("Alert Details")
            .setMessage(details.toString())
            .setPositiveButton("OK", null)
            .apply {
                if (alert.status == "active") {
                    setNeutralButton("Acknowledge") { _, _ ->
                        acknowledgeAlert(alert)
                    }
                }
            }
            .show()
    }
    
    private fun acknowledgeAlert(alert: AlertsAdapter.Alert) {
        firestore.collection("alerts")
            .document(alert.id)
            .update(
                mapOf(
                    "status" to "acknowledged",
                    "acknowledgedAt" to com.google.firebase.firestore.FieldValue.serverTimestamp()
                )
            )
            .addOnSuccessListener {
                showSuccess("Alert acknowledged")
            }
            .addOnFailureListener { e ->
                showError("Failed to acknowledge alert: ${e.message}")
            }
    }
    
    private fun showClearAllDialog() {
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("Clear All Alerts")
            .setMessage("Are you sure you want to mark all active alerts as resolved?")
            .setPositiveButton("Clear All") { _, _ ->
                clearAllAlerts()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
    
    private fun clearAllAlerts() {
        val deviceId = getDeviceId()
        if (deviceId.isEmpty()) return
        
        firestore.collection("alerts")
            .whereEqualTo("deviceId", deviceId)
            .whereEqualTo("status", "active")
            .get()
            .addOnSuccessListener { snapshot ->
                val batch = firestore.batch()
                snapshot.documents.forEach { doc ->
                    batch.update(doc.reference, mapOf(
                        "status" to "resolved",
                        "resolvedAt" to com.google.firebase.firestore.FieldValue.serverTimestamp(),
                        "autoResolved" to false
                    ))
                }
                
                batch.commit()
                    .addOnSuccessListener {
                        showSuccess("All alerts cleared")
                    }
                    .addOnFailureListener { e ->
                        showError("Failed to clear alerts: ${e.message}")
                    }
            }
            .addOnFailureListener { e ->
                showError("Failed to fetch alerts: ${e.message}")
            }
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
