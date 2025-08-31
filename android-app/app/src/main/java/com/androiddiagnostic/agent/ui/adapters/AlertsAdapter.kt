package com.androiddiagnostic.agent.ui.adapters

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.androiddiagnostic.agent.R
import com.google.android.material.card.MaterialCardView
import java.text.SimpleDateFormat
import java.util.*

class AlertsAdapter(
    private val onItemClick: (Alert) -> Unit,
    private val onAcknowledge: (Alert) -> Unit
) : ListAdapter<AlertsAdapter.Alert, AlertsAdapter.AlertViewHolder>(AlertDiffCallback()) {
    
    data class Alert(
        val id: String,
        val type: String,
        val severity: String,
        val message: String,
        val status: String,
        val value: Double,
        val threshold: Double,
        val createdAt: Long
    )
    
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): AlertViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_alert, parent, false)
        return AlertViewHolder(view)
    }
    
    override fun onBindViewHolder(holder: AlertViewHolder, position: Int) {
        holder.bind(getItem(position), onItemClick, onAcknowledge)
    }
    
    class AlertViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val cardView: MaterialCardView = itemView.findViewById(R.id.alertCard)
        private val severityIcon: ImageView = itemView.findViewById(R.id.alertSeverityIcon)
        private val typeText: TextView = itemView.findViewById(R.id.alertTypeText)
        private val messageText: TextView = itemView.findViewById(R.id.alertMessageText)
        private val severityText: TextView = itemView.findViewById(R.id.alertSeverityText)
        private val timeText: TextView = itemView.findViewById(R.id.alertTimeText)
        private val acknowledgeButton: Button = itemView.findViewById(R.id.acknowledgeButton)
        
        private val dateFormat = SimpleDateFormat("MMM dd, HH:mm", Locale.getDefault())
        
        fun bind(alert: Alert, onItemClick: (Alert) -> Unit, onAcknowledge: (Alert) -> Unit) {
            typeText.text = alert.type.uppercase()
            messageText.text = alert.message
            severityText.text = alert.severity.capitalize()
            timeText.text = dateFormat.format(Date(alert.createdAt))
            
            // Set severity icon and color
            when (alert.severity) {
                "critical" -> {
                    severityIcon.setImageResource(R.drawable.ic_error)
                    severityText.setTextColor(itemView.context.getColor(R.color.severity_critical))
                    cardView.strokeColor = itemView.context.getColor(R.color.severity_critical)
                }
                "high" -> {
                    severityIcon.setImageResource(R.drawable.ic_warning)
                    severityText.setTextColor(itemView.context.getColor(R.color.severity_high))
                    cardView.strokeColor = itemView.context.getColor(R.color.severity_high)
                }
                "medium" -> {
                    severityIcon.setImageResource(R.drawable.ic_info)
                    severityText.setTextColor(itemView.context.getColor(R.color.severity_medium))
                    cardView.strokeColor = itemView.context.getColor(R.color.severity_medium)
                }
                "low" -> {
                    severityIcon.setImageResource(R.drawable.ic_info_outline)
                    severityText.setTextColor(itemView.context.getColor(R.color.severity_low))
                    cardView.strokeColor = itemView.context.getColor(R.color.severity_low)
                }
            }
            
            // Show/hide acknowledge button based on status
            acknowledgeButton.visibility = if (alert.status == "active") View.VISIBLE else View.GONE
            
            acknowledgeButton.setOnClickListener {
                onAcknowledge(alert)
            }
            
            cardView.setOnClickListener {
                onItemClick(alert)
            }
        }
    }
    
    class AlertDiffCallback : DiffUtil.ItemCallback<Alert>() {
        override fun areItemsTheSame(oldItem: Alert, newItem: Alert): Boolean {
            return oldItem.id == newItem.id
        }
        
        override fun areContentsTheSame(oldItem: Alert, newItem: Alert): Boolean {
            return oldItem == newItem
        }
    }
}
