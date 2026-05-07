/**
 * AuditLog.js — Mongoose model for system audit trail
 * Records every sensitive write action (create/update/delete) with
 * actor, resource, change diff and IP address.
 */

const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  'User',
    },
    actorName:  { type: String },      // denormalised for readability after user deletion
    actorRole:  { type: String },
    action:     {
      type: String,
      enum: ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'ASSIGN', 'EXPORT', 'RETRAIN'],
      required: true,
    },
    resource:   { type: String, required: true },  // e.g. 'Schedule', 'Driver', 'Bus'
    resourceId: { type: String },                  // MongoDB _id of affected document
    diff:       { type: mongoose.Schema.Types.Mixed }, // { before: {}, after: {} }
    ip:         { type: String },
    userAgent:  { type: String },
    metadata:   { type: mongoose.Schema.Types.Mixed }, // extra context
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Index for fast lookups by actor, resource, and date
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ resource: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
