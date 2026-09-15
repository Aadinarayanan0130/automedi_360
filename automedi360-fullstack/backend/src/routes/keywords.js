const express = require('express');
const { KEYWORDS } = require('../engine');

const router = express.Router();

// GET /api/keywords — fetched ONCE on page load by the frontend so it can do
// cheap, instant, client-side highlighting of matched phrases as the doctor
// types. This deliberately does not require a round trip per keystroke; the
// authoritative parse (codes, confidence, compliance, revenue) still only
// happens through POST /api/engine/run.
router.get('/', (req, res) => {
  res.json(KEYWORDS);
});

module.exports = router;
