// Seed data for Automedi 360 — hardcoded demo patients + a starter audit log.
// These four patients ship with the prototype so the app opens in a populated,
// realistic state. They are marked `protected: true` so the API refuses to
// delete them; anything added later through POST /api/patients is a normal
// (deletable) record.

const SEED_PATIENTS = [
  {
    id: 'p1',
    uhid: 'UHID-88492',
    name: 'Rajesh Sharma',
    ward: 'IPD',
    location: 'Room 302',
    department: 'Cardiology',
    consultant: 'Dr. Anjali Rao',
    tpa: 'Star Health TPA',
    age: 58,
    gender: 'Male',
    bloodGroup: 'B+',
    phone: '+91 98450 11221',
    group: 'IPD Ward Patients',
    protected: true,
    note:
      'Patient presents with retrosternal chest pain radiating to the left arm, onset 40 minutes ago, ' +
      'associated with diaphoresis and mild dizziness. Ordered 12-lead ECG showing ST depression in leads ' +
      'V4-V6. Administered Sublingual Nitroglycerin 0.4mg with partial relief. Troponin I sent to lab, ' +
      'awaiting result. Patient also reports occasional nausea. Started on IV Saline at 75ml/hr. ' +
      'Plan: serial troponin, cardiology consult, continuous cardiac monitoring.'
  },
  {
    id: 'p2',
    uhid: 'UHID-90211',
    name: 'Priya Nair',
    ward: 'IPD',
    location: 'ICU Bed 04',
    department: 'Neurology',
    consultant: 'Dr. Fahad Ali',
    tpa: 'HDFC ERGO',
    age: 47,
    gender: 'Female',
    bloodGroup: 'O+',
    phone: '+91 98450 33445',
    group: 'IPD Ward Patients',
    protected: true,
    note:
      'Patient admitted with sudden onset slurred speech and right-sided weakness. GCS 14/15. CT Brain shows ' +
      'early ischemic changes in the left MCA territory. Started on IV Saline while closely monitoring for ' +
      'signs of raised intracranial pressure. Reports mild headache and one episode of vomiting overnight. ' +
      'Neurology consult obtained; plan for MRI Brain and a physiotherapy assessment once stable.'
  },
  {
    id: 'p3',
    uhid: 'UHID-10492',
    name: 'Arjun Verma',
    ward: 'OPD',
    location: 'OPD Token #14',
    department: 'General Medicine',
    consultant: 'Dr. Meera Iyer',
    tpa: 'Ayushman Bharat (PM-JAY)',
    age: 34,
    gender: 'Male',
    bloodGroup: 'A+',
    phone: '+91 98450 55678',
    group: 'OPD & ER Admissions',
    protected: true,
    note:
      'Patient reports a low-grade fever for 3 days with generalized body ache and mild dizziness. No chest ' +
      'pain. Throat is mildly congested with audible wheeze on auscultation — advised nebulization. ' +
      'Prescribed a short course of oral antibiotics. Advised rest, hydration, and follow-up in OPD after 3 ' +
      'days if symptoms persist.'
  },
  {
    id: 'p4',
    uhid: 'UHID-11029',
    name: 'Sunita Patel',
    ward: 'ER',
    location: 'ER Triage Bay 2',
    department: 'Orthopedics',
    consultant: 'Dr. Karan Shah',
    tpa: 'Out-of-Pocket',
    age: 29,
    gender: 'Female',
    bloodGroup: 'AB+',
    phone: '+91 98450 77890',
    group: 'OPD & ER Admissions',
    protected: true,
    note:
      'Patient sustained a fall at home resulting in a suspected fracture of the right wrist. X-Ray of the ' +
      'right wrist ordered, confirming a distal radius fracture. A wound noted on the forearm required ' +
      'suturing under local anesthesia; tetanus prophylaxis given. Plan: orthopedic referral, splinting, and ' +
      'pain management.'
  }
];

const now = Date.now();
const SEED_AUDIT = [
  { id: 'a1', time: new Date(now - 1000 * 60 * 60 * 20).toISOString(), patient: 'UHID-88492 · Rajesh Sharma', action: 'Engine Run', amount: 2850, status: 'run', dept: 'Cardiology' },
  { id: 'a2', time: new Date(now - 1000 * 60 * 60 * 27).toISOString(), patient: 'UHID-11029 · Sunita Patel', action: 'Code Approved: S52.501A', amount: 2500, status: 'approved', dept: 'Orthopedics' },
  { id: 'a3', time: new Date(now - 1000 * 60 * 60 * 48).toISOString(), patient: 'UHID-90211 · Priya Nair', action: 'Engine Run', amount: 11200, status: 'run', dept: 'Neurology' },
  { id: 'a4', time: new Date(now - 1000 * 60 * 60 * 47.8).toISOString(), patient: 'UHID-90211 · Priya Nair', action: 'Code Approved: 70450', amount: 3500, status: 'approved', dept: 'Neurology' }
];

const SEED_STATS = {
  cumulativeRevenue: 14050,
  cumulativeCodes: 9,
  cumulativeApproved: 2,
  complianceAlertsLogged: 3
};

module.exports = { SEED_PATIENTS, SEED_AUDIT, SEED_STATS };
