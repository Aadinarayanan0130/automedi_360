const express = require('express');
const { state, save } = require('../store');
const { runEngineOnNote } = require('../engine');

const router = express.Router();

// POST /api/engine/run  { patientId, note }
// The one authoritative compute step: persists the (possibly edited) note
// back onto the patient record, runs the dual engine, logs an audit entry,
// and rolls the result into the running session stats.
router.post('/run', (req, res) => {
  const { patientId, note } = req.body || {};
  if (!patientId) return res.status(400).json({ error: 'patientId is required.' });

  const patient = state.patients.find((p) => p.id === patientId);
  if (!patient) return res.status(404).json({ error: 'Patient not found.' });

  if (typeof note === 'string') patient.note = note;

  const result = runEngineOnNote(patient, patient.note);

  state.auditLog.unshift({
    id: 'a' + Date.now(),
    time: new Date().toISOString(),
    patient: patient.uhid + ' · ' + patient.name,
    action: 'Engine Run',
    amount: result.identifiedRevenue,
    status: 'run',
    dept: patient.department
  });
  if (state.auditLog.length > 200) state.auditLog.length = 200;

  state.stats.cumulativeRevenue += result.identifiedRevenue;
  state.stats.cumulativeCodes += result.entities.length;
  state.stats.complianceAlertsLogged += result.complianceAlerts.filter(
    (a) => a.level === 'warning' || a.level === 'critical'
  ).length;

  save();

  res.json({ result, stats: state.stats });
});

module.exports = router;
