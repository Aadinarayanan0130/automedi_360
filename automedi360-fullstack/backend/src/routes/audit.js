const express = require('express');
const { state, save } = require('../store');

const router = express.Router();

// GET /api/audit?limit=25 — newest first
router.get('/', (req, res) => {
  const limit = Math.min(200, parseInt(req.query.limit, 10) || 25);
  const sorted = [...state.auditLog].sort((a, b) => new Date(b.time) - new Date(a.time));
  res.json(sorted.slice(0, limit));
});

// POST /api/audit/approve  { patientId, code, fee }
// Logged whenever a human coder ticks "Approve Code" in the Hospital Billing
// tab — this is the HITL (human-in-the-loop) trail the audit mode badge
// refers to.
router.post('/approve', (req, res) => {
  const { patientId, code, fee } = req.body || {};
  const patient = state.patients.find((p) => p.id === patientId);
  if (!patient) return res.status(404).json({ error: 'Patient not found.' });
  if (!code || typeof fee !== 'number') {
    return res.status(400).json({ error: 'code (string) and fee (number) are required.' });
  }

  const entry = {
    id: 'a' + Date.now(),
    time: new Date().toISOString(),
    patient: patient.uhid + ' · ' + patient.name,
    action: 'Code Approved: ' + code,
    amount: fee,
    status: 'approved',
    dept: patient.department
  };
  state.auditLog.unshift(entry);
  if (state.auditLog.length > 200) state.auditLog.length = 200;
  state.stats.cumulativeApproved += 1;
  save();

  res.status(201).json({ entry, stats: state.stats });
});

module.exports = router;
