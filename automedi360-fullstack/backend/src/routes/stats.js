const express = require('express');
const { state } = require('../store');

const router = express.Router();

// GET /api/stats — the numbers behind the home page stat strip and the
// Analytics page, including revenue-by-department aggregated from the audit
// log's "Engine Run" entries.
router.get('/', (req, res) => {
  const deptTotals = {};
  state.auditLog.forEach((a) => {
    if (a.status === 'run') {
      deptTotals[a.dept] = (deptTotals[a.dept] || 0) + a.amount;
    }
  });

  res.json({
    patientsCount: state.patients.length,
    cumulativeRevenue: state.stats.cumulativeRevenue,
    cumulativeCodes: state.stats.cumulativeCodes,
    cumulativeApproved: state.stats.cumulativeApproved,
    complianceAlertsLogged: state.stats.complianceAlertsLogged,
    deptTotals
  });
});

module.exports = router;
