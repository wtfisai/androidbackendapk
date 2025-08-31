package com.androiddiagnostic.agent.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import com.androiddiagnostic.agent.R
import com.androiddiagnostic.agent.databinding.FragmentCommandsBinding
import com.androiddiagnostic.agent.ui.adapters.CommandsAdapter
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query

class CommandsFragment : Fragment() {
    
    private var _binding: FragmentCommandsBinding? = null
    private val binding get() = _binding!!
    
    private lateinit var commandsAdapter: CommandsAdapter
    private val firestore = FirebaseFirestore.getInstance()
    private val auth = FirebaseAuth.getInstance()
    
    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentCommandsBinding.inflate(inflater, container, false)
        return binding.root
    }
    
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        
        setupRecyclerView()
        setupClickListeners()
        loadCommands()
    }
    
    private fun setupRecyclerView() {
        commandsAdapter = CommandsAdapter { command ->
            // Handle command click
            showCommandDetails(command)
        }
        
        binding.commandsRecyclerView.apply {
            layoutManager = LinearLayoutManager(requireContext())
            adapter = commandsAdapter
        }
    }
    
    private fun setupClickListeners() {
        binding.addCommandFab.setOnClickListener {
            showNewCommandDialog()
        }
        
        binding.filterChipGroup.setOnCheckedChangeListener { _, checkedId ->
            when (checkedId) {
                R.id.chipAll -> loadCommands()
                R.id.chipPending -> loadCommands("pending")
                R.id.chipProcessing -> loadCommands("processing")
                R.id.chipCompleted -> loadCommands("completed")
                R.id.chipFailed -> loadCommands("failed")
            }
        }
        
        binding.swipeRefreshLayout.setOnRefreshListener {
            loadCommands()
        }
    }
    
    private fun loadCommands(statusFilter: String? = null) {
        val deviceId = getDeviceId()
        if (deviceId.isEmpty()) {
            binding.swipeRefreshLayout.isRefreshing = false
            return
        }
        
        var query: Query = firestore.collection("commands")
            .whereEqualTo("deviceId", deviceId)
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .limit(50)
        
        if (statusFilter != null) {
            query = query.whereEqualTo("status", statusFilter)
        }
        
        query.addSnapshotListener { snapshot, error ->
            binding.swipeRefreshLayout.isRefreshing = false
            
            if (error != null) {
                showError("Failed to load commands: ${error.message}")
                return@addSnapshotListener
            }
            
            val commands = snapshot?.documents?.map { doc ->
                CommandsAdapter.Command(
                    id = doc.id,
                    type = doc.getString("type") ?: "",
                    payload = doc.getString("payload") ?: "",
                    status = doc.getString("status") ?: "pending",
                    createdAt = doc.getTimestamp("createdAt")?.toDate()?.time ?: 0,
                    result = doc.getString("result")
                )
            } ?: emptyList()
            
            commandsAdapter.submitList(commands)
            
            binding.emptyStateText.visibility = if (commands.isEmpty()) View.VISIBLE else View.GONE
        }
    }
    
    private fun showNewCommandDialog() {
        val commandTypes = arrayOf(
            "shell", "root", "adb", "reboot", "screenshot", 
            "logcat", "install_app", "uninstall_app", "clear_cache"
        )
        
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("New Command")
            .setItems(commandTypes) { _, which ->
                showCommandInputDialog(commandTypes[which])
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
    
    private fun showCommandInputDialog(type: String) {
        val inputView = layoutInflater.inflate(R.layout.dialog_command_input, null)
        val inputField = inputView.findViewById<com.google.android.material.textfield.TextInputEditText>(R.id.commandInput)
        
        // Set hint based on command type
        inputField.hint = when (type) {
            "shell" -> "ls -la /sdcard"
            "root" -> "pm list packages"
            "adb" -> "dumpsys battery"
            "install_app" -> "Package path or URL"
            "uninstall_app" -> "Package name"
            else -> "Command payload"
        }
        
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("Execute $type Command")
            .setView(inputView)
            .setPositiveButton("Execute") { _, _ ->
                val payload = inputField.text.toString()
                if (payload.isNotEmpty()) {
                    executeCommand(type, payload)
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
    
    private fun executeCommand(type: String, payload: String) {
        val deviceId = getDeviceId()
        if (deviceId.isEmpty()) {
            showError("Device not registered")
            return
        }
        
        val command = hashMapOf(
            "deviceId" to deviceId,
            "userId" to (auth.currentUser?.uid ?: ""),
            "type" to type,
            "payload" to payload,
            "priority" to 0,
            "status" to "pending",
            "createdAt" to com.google.firebase.firestore.FieldValue.serverTimestamp(),
            "updatedAt" to com.google.firebase.firestore.FieldValue.serverTimestamp()
        )
        
        firestore.collection("commands")
            .add(command)
            .addOnSuccessListener {
                showSuccess("Command queued successfully")
            }
            .addOnFailureListener { e ->
                showError("Failed to queue command: ${e.message}")
            }
    }
    
    private fun showCommandDetails(command: CommandsAdapter.Command) {
        val details = StringBuilder()
        details.append("Type: ${command.type}\n")
        details.append("Status: ${command.status}\n")
        details.append("Payload: ${command.payload}\n")
        
        if (!command.result.isNullOrEmpty()) {
            details.append("\nResult:\n${command.result}")
        }
        
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("Command Details")
            .setMessage(details.toString())
            .setPositiveButton("OK", null)
            .apply {
                if (command.status == "pending" || command.status == "processing") {
                    setNegativeButton("Cancel") { _, _ ->
                        cancelCommand(command.id)
                    }
                }
            }
            .show()
    }
    
    private fun cancelCommand(commandId: String) {
        firestore.collection("commands")
            .document(commandId)
            .update("status", "cancelled")
            .addOnSuccessListener {
                showSuccess("Command cancelled")
            }
            .addOnFailureListener { e ->
                showError("Failed to cancel command: ${e.message}")
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
