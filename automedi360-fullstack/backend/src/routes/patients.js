const express = require('express');
const { state, save } = require('../store');

const router = express.Router();

const REQUIRED_FIELDS = ['name', 'age', 'gender', 'ward', 'location', 'department', 'consultant', 'tpa'];
const VALID_WARDS = ['IPD', 'OPD', 'ER'];

function genUhid() {
  let id;
  do {
    id = 'UHID-' + (10000 + Math.floor(Math.random() * 89999));
  } while (state.patients.some((p) => p.uhid === id));
  return id;
}

function groupForWard(ward) {
  // Matches the roster's optgroups: seed data keeps its original two groups,
  // anything registered through the API lands in its own "Newly Registered"
  // group so it's obvious in the UI where a new patient came from.
  return 'Newly Registered';
}

// GET /api/patients — full roster (seed + everything registered since boot)
router.get('/', (req, res) => {
  res.json(state.patients);
});

// GET /api/patients/:id
router.get('/:id', (req, res) => {
  const patient = state.patients.find((p) => p.id === req.params.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found.' });
  res.json(patient);
});

// POST /api/patients — register a new IPD / OPD / ER patient
router.post('/', (req, res) => {
  const body = req.body || {};
  const missing = REQUIRED_FIELDS.filter((f) => !String(body[f] ?? '').trim());
  if (missing.length) {
    return res.status(400).json({ error: 'Missing required field(s): ' + missing.join(', ') });
  }
  if (!VALID_WARDS.includes(body.ward)) {
    return res.status(400).json({ error: 'ward must be one of ' + VALID_WARDS.join(', ') });
  }

  const patient = {
    id: 'custom-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    uhid: genUhid(),
    name: String(body.name).trim(),
    ward: body.ward,
    location: String(body.location).trim(),
    department: body.department,
    consultant: String(body.consultant).trim(),
    tpa: body.tpa,
    age: body.age,
    gender: body.gender,
    bloodGroup: body.bloodGroup || 'Unknown',
    phone: body.phone || '',
    group: groupForWard(body.ward),
    protected: false,
    note: String(body.note || '').trim() || 'No clinical note recorded yet. Open in Workspace to begin documentation.'
  };

  state.patients.push(patient);
  save();
  res.status(201).json(patient);
});

// PATCH /api/patients/:id — used by the Workspace to persist note edits
router.patch('/:id', (req, res) => {
  const patient = state.patients.find((p) => p.id === req.params.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found.' });
  const allowed = ['note', 'consultant', 'location', 'tpa'];
  allowed.forEach((field) => {
    if (typeof req.body[field] === 'string') patient[field] = req.body[field];
  });
  save();
  res.json(patient);
});

// DELETE /api/patients/:id — refused for the four seed patients
router.delete('/:id', (req, res) => {
  const patient = state.patients.find((p) => p.id === req.params.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found.' });
  if (patient.protected) {
    return res.status(403).json({ error: 'This is a seed demo patient and cannot be removed.' });
  }
  state.patients = state.patients.filter((p) => p.id !== req.params.id);
  save();
  res.status(204).end();
});

module.exports = router;
