package com.androiddiagnostic.agent.ui.adapters

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.androiddiagnostic.agent.R
import com.google.android.material.card.MaterialCardView
import java.text.SimpleDateFormat
import java.util.*

class CommandsAdapter(
    private val onItemClick: (Command) -> Unit
) : ListAdapter<CommandsAdapter.Command, CommandsAdapter.CommandViewHolder>(CommandDiffCallback()) {
    
    data class Command(
        val id: String,
        val type: String,
        val payload: String,
        val status: String,
        val createdAt: Long,
        val result: String? = null
    )
    
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): CommandViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_command, parent, false)
        return CommandViewHolder(view)
    }
    
    override fun onBindViewHolder(holder: CommandViewHolder, position: Int) {
        holder.bind(getItem(position), onItemClick)
    }
    
    class CommandViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val cardView: MaterialCardView = itemView.findViewById(R.id.commandCard)
        private val typeText: TextView = itemView.findViewById(R.id.commandTypeText)
        private val payloadText: TextView = itemView.findViewById(R.id.commandPayloadText)
        private val statusText: TextView = itemView.findViewById(R.id.commandStatusText)
        private val statusIcon: ImageView = itemView.findViewById(R.id.commandStatusIcon)
        private val timeText: TextView = itemView.findViewById(R.id.commandTimeText)
        
        private val dateFormat = SimpleDateFormat("MMM dd, HH:mm", Locale.getDefault())
        
        fun bind(command: Command, onItemClick: (Command) -> Unit) {
            typeText.text = command.type.uppercase()
            payloadText.text = command.payload
            statusText.text = command.status.capitalize()
            timeText.text = dateFormat.format(Date(command.createdAt))
            
            // Set status icon and color
            when (command.status) {
                "pending" -> {
                    statusIcon.setImageResource(R.drawable.ic_pending)
                    statusText.setTextColor(itemView.context.getColor(R.color.status_pending))
                }
                "processing" -> {
                    statusIcon.setImageResource(R.drawable.ic_processing)
                    statusText.setTextColor(itemView.context.getColor(R.color.status_processing))
                }
                "completed" -> {
                    statusIcon.setImageResource(R.drawable.ic_check_circle)
                    statusText.setTextColor(itemView.context.getColor(R.color.status_completed))
                }
                "failed" -> {
                    statusIcon.setImageResource(R.drawable.ic_error)
                    statusText.setTextColor(itemView.context.getColor(R.color.status_failed))
                }
                "cancelled" -> {
                    statusIcon.setImageResource(R.drawable.ic_cancel)
                    statusText.setTextColor(itemView.context.getColor(R.color.status_cancelled))
                }
            }
            
            cardView.setOnClickListener {
                onItemClick(command)
            }
        }
    }
    
    class CommandDiffCallback : DiffUtil.ItemCallback<Command>() {
        override fun areItemsTheSame(oldItem: Command, newItem: Command): Boolean {
            return oldItem.id == newItem.id
        }
        
        override fun areContentsTheSame(oldItem: Command, newItem: Command): Boolean {
            return oldItem == newItem
        }
    }
}
