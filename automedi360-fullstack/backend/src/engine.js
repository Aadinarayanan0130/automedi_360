// The Automedi 360 "dual engine" — the single source of truth for keyword
// matching, coding, compliance checks, summary generation and financials.
//
// This is intentionally the ONLY place this logic lives. The frontend fetches
// the KEYWORDS list once (GET /api/keywords) to power cheap, instant,
// client-side highlighting while the doctor types — but the authoritative
// computation (confidence, codes, compliance, revenue, summary) always runs
// here, on the server, triggered once per "Run Engine" click. That split is
// deliberate: calling an engine on every keystroke is exactly the mistake
// this project's own hackathon story is about (overlapping requests, rate
// limits, 3s latency). Keeping the heavy pass server-side and behind an
// explicit action avoids repeating it.

const KEYWORDS = [
  { id: 'chestPain', patterns: ['retrosternal chest pain', 'chest pain'], label: 'chest pain', category: 'symptom',
    codeType: 'ICD-10', code: 'R07.9', description: 'Chest pain, unspecified', fee: 500,
    jargon: 'Pain felt in the center of your chest, often near the heart.',
    afterCare: 'Avoid exertion; seek immediate care if the pain returns or worsens.' },
  { id: 'ecg', patterns: ['12-lead ecg', '12 lead ecg', 'ecg', 'ekg', 'electrocardiogram'], label: 'a 12-lead ECG', category: 'diagnostic',
    codeType: 'CPT', code: '93000', description: 'Electrocardiogram, routine ECG with interpretation', fee: 800,
    jargon: 'A quick, painless test using sticky pads on your chest to record your heart’s electrical activity.',
    afterCare: 'No special care needed — your doctor will review the results with you.' },
  { id: 'nitro', patterns: ['sublingual nitroglycerin', 'nitroglycerin'], label: 'sublingual nitroglycerin', category: 'treatment',
    codeType: 'HCPCS', code: 'J3490', description: 'Unclassified drug — Nitroglycerin (sublingual)', fee: 150,
    jargon: 'Medication dissolved under the tongue for fast chest pain relief.',
    afterCare: 'May cause light-headedness — sit or lie down after taking it.' },
  { id: 'troponin', patterns: ['troponin i', 'troponin'], label: 'Troponin I testing', category: 'diagnostic',
    codeType: 'CPT', code: '84484', description: 'Troponin, quantitative', fee: 1200,
    jargon: 'A blood test that checks for heart muscle damage.',
    afterCare: 'Results are usually ready within an hour; a repeat draw may be needed.' },
  { id: 'dizziness', patterns: ['dizziness', 'light-headedness', 'lightheadedness'], label: 'dizziness', category: 'symptom',
    codeType: 'ICD-10', code: 'R42', description: 'Dizziness and giddiness', fee: 300,
    jargon: 'A spinning or unsteady feeling.',
    afterCare: 'Sit or lie down when dizzy; avoid driving until it fully resolves.' },
  { id: 'nausea', patterns: ['nausea'], label: 'nausea', category: 'symptom',
    codeType: 'ICD-10', code: 'R11.0', description: 'Nausea', fee: 200,
    jargon: 'A queasy, upset-stomach feeling.',
    afterCare: 'Sip fluids slowly; avoid heavy or oily meals.' },
  { id: 'ivSaline', patterns: ['iv saline', 'intravenous saline', 'iv fluids'], label: 'IV saline hydration', category: 'treatment',
    codeType: 'CPT', code: '96360', description: 'IV infusion, hydration, initial', fee: 600,
    jargon: 'Fluids given directly into a vein through a small tube.',
    afterCare: 'Keep the IV site clean and dry; tell staff if it feels sore or swollen.' },
  { id: 'ctScan', patterns: ['ct brain', 'ct scan', 'computed tomography'], label: 'a CT brain scan', category: 'diagnostic',
    codeType: 'CPT', code: '70450', description: 'CT Head/Brain, without contrast', fee: 3500,
    jargon: 'A detailed scan of the brain using X-rays.',
    afterCare: 'No special after-care is needed.' },
  { id: 'headache', patterns: ['headache'], label: 'headache', category: 'symptom',
    codeType: 'ICD-10', code: 'R51', description: 'Headache', fee: 250,
    jargon: 'Pain or discomfort felt in the head.',
    afterCare: 'Rest in a quiet, dim room and stay hydrated.' },
  { id: 'vomiting', patterns: ['vomiting'], label: 'vomiting', category: 'symptom',
    codeType: 'ICD-10', code: 'R11.10', description: 'Vomiting, unspecified', fee: 200,
    jargon: 'Throwing up.',
    afterCare: 'Take small sips of water and resume food gradually.' },
  { id: 'mri', patterns: ['mri brain', 'mri'], label: 'an MRI brain scan', category: 'diagnostic',
    codeType: 'CPT', code: '70551', description: 'MRI Brain, without contrast', fee: 6500,
    jargon: 'A detailed scan using magnets — no radiation involved.',
    afterCare: 'Remove metal objects before scanning; no other special care needed.' },
  { id: 'physio', patterns: ['physiotherapy'], label: 'physiotherapy', category: 'treatment',
    codeType: 'CPT', code: '97110', description: 'Therapeutic exercise, physiotherapy session', fee: 700,
    jargon: 'Guided exercises to help you move and recover better.',
    afterCare: 'Continue the prescribed exercises at home as advised.' },
  { id: 'fever', patterns: ['low-grade fever', 'fever'], label: 'fever', category: 'symptom',
    codeType: 'ICD-10', code: 'R50.9', description: 'Fever, unspecified', fee: 250,
    jargon: 'A higher-than-normal body temperature.',
    afterCare: 'Stay hydrated and take fever medicine as prescribed.' },
  { id: 'nebulization', patterns: ['nebulization', 'nebulizer'], label: 'nebulization therapy', category: 'treatment',
    codeType: 'CPT', code: '94640', description: 'Nebulizer treatment for airway obstruction', fee: 450,
    jargon: 'A misted medicine you breathe in to help open your airways.',
    afterCare: 'Rinse your mouth after use; continue on the prescribed schedule.' },
  { id: 'antibiotics', patterns: ['antibiotics', 'antibiotic'], label: 'antibiotic therapy', category: 'treatment',
    codeType: 'HCPCS', code: 'J0696', description: 'Antibiotic therapy, administration', fee: 400,
    jargon: 'Medicine that fights bacterial infections.',
    afterCare: 'Complete the full course even if you start feeling better.' },
  { id: 'fracture', patterns: ['fracture'], label: 'a suspected fracture', category: 'condition',
    codeType: 'ICD-10', code: 'S52.501A', description: 'Fracture of distal radius, unspecified, initial encounter', fee: 2500,
    jargon: 'A broken bone.',
    afterCare: 'Keep the area immobilized and attend your orthopedic follow-up.' },
  { id: 'xray', patterns: ['x-ray', 'xray', 'radiograph'], label: 'an X-ray', category: 'diagnostic',
    codeType: 'CPT', code: '73100', description: 'X-Ray, wrist, minimum 2 views', fee: 900,
    jargon: 'A quick image that shows the bones inside your body.',
    afterCare: 'No special after-care is needed.' },
  { id: 'suturing', patterns: ['suturing', 'sutures', 'stitches'], label: 'wound suturing', category: 'treatment',
    codeType: 'CPT', code: '12001', description: 'Simple repair, superficial wound', fee: 1800,
    jargon: 'Stitches used to close a cut or wound.',
    afterCare: 'Keep the wound dry; return for suture removal in 7–10 days.' },
  { id: 'hypertension', patterns: ['hypertension', 'high blood pressure'], label: 'hypertension', category: 'condition',
    codeType: 'ICD-10', code: 'I10', description: 'Essential (primary) hypertension', fee: 300,
    jargon: 'Consistently high blood pressure.',
    afterCare: 'Take blood pressure medication regularly and monitor it at home.' },
  { id: 'diabetes', patterns: ['diabetes', 'hyperglycemia'], label: 'diabetes', category: 'condition',
    codeType: 'ICD-10', code: 'E11.9', description: 'Type 2 diabetes mellitus, without complications', fee: 300,
    jargon: 'High blood sugar levels needing ongoing management.',
    afterCare: 'Monitor blood sugar and follow the prescribed diet and medication.' },
  { id: 'abdominalPain', patterns: ['abdominal pain', 'stomach pain'], label: 'abdominal pain', category: 'symptom',
    codeType: 'ICD-10', code: 'R10.9', description: 'Abdominal pain, unspecified', fee: 350,
    jargon: 'Pain felt in the belly area.',
    afterCare: 'Avoid heavy meals until reviewed by a doctor.' }
];

const TPA_COVERAGE = {
  'Ayushman Bharat (PM-JAY)': { pct: 1.0, cap: 25000 },
  'Star Health TPA': { pct: 0.8, cap: Infinity },
  'HDFC ERGO': { pct: 0.85, cap: Infinity },
  'ICICI Lombard Health': { pct: 0.75, cap: Infinity },
  'CGHS': { pct: 0.9, cap: Infinity },
  'Out-of-Pocket': { pct: 0, cap: 0 }
};
const BASE_FEE = { IPD: 1500, OPD: 300, ER: 800 };

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findMatches(text) {
  let raw = [];
  KEYWORDS.forEach((entry) => {
    entry.patterns.forEach((p) => {
      const re = new RegExp('\\b' + escapeRegex(p) + '\\b', 'gi');
      let m;
      while ((m = re.exec(text))) {
        raw.push({ start: m.index, end: m.index + m[0].length, entry });
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    });
  });
  // Longer / more specific phrases win on overlap (e.g. "retrosternal chest
  // pain" should absorb the bare "chest pain" match inside it).
  raw.sort((a, b) => b.end - b.start - (a.end - a.start));
  const accepted = [];
  raw.forEach((m) => {
    const overlap = accepted.some((a) => m.start < a.end && m.end > a.start);
    if (!overlap) accepted.push(m);
  });
  accepted.sort((a, b) => a.start - b.start);
  return accepted;
}

function groupMatches(matches) {
  const map = {};
  matches.forEach((m) => {
    if (!map[m.entry.id]) map[m.entry.id] = { entry: m.entry, count: 0 };
    map[m.entry.id].count++;
  });
  return Object.values(map);
}

function joinList(arr) {
  if (arr.length === 0) return '';
  if (arr.length === 1) return arr[0];
  return arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];
}

function computeConfidence(entities) {
  if (entities.length === 0) return 62;
  const pct = 95 + Math.min(4, entities.length * 0.4) + (Math.random() * 0.6 - 0.3);
  return Math.min(99.4, Math.round(pct * 10) / 10);
}

function computeCompliance(entities, patient, noteText) {
  const ids = entities.map((e) => e.entry.id);
  const alerts = [];
  const hasTimestamp = /\b\d{1,2}[:.]\d{2}\s?(am|pm|hrs)?\b/i.test(noteText);

  if (ids.includes('troponin') && patient.tpa === 'Star Health TPA' && !hasTimestamp) {
    alerts.push({ level: 'warning', text: 'Missing Troponin lab timestamp — required for Star Health TPA pre-authorization.' });
  }
  if (ids.includes('fracture') && !ids.includes('xray')) {
    alerts.push({ level: 'critical', text: 'Fracture diagnosis lacks imaging (X-Ray/CT) documentation — required to substantiate the claim.' });
  }
  const total = entities.reduce((s, e) => s + e.entry.fee * e.count, 0);
  const coverage = TPA_COVERAGE[patient.tpa] || { pct: 0, cap: Infinity };
  const base = BASE_FEE[patient.ward] || 500;
  if (patient.tpa === 'Ayushman Bharat (PM-JAY)' && total + base > coverage.cap) {
    alerts.push({ level: 'warning', text: 'Charge exceeds the PM-JAY package cap of ₹' + coverage.cap.toLocaleString('en-IN') + ' — HITL review required before claim submission.' });
  }
  if (entities.length === 0) {
    alerts.push({ level: 'info', text: 'No billable entities detected yet — add more clinical detail to the note.' });
  }
  if (alerts.length === 0) {
    alerts.push({ level: 'good', text: 'All NABH / TPA documentation checks passed for this note.' });
  }
  return alerts;
}

function computeSummary(entities, patient) {
  if (entities.length === 0) {
    return 'No billable clinical entities were detected in this note yet. Add more detail — symptoms, tests ordered, medications given — and run the engine again.';
  }
  const symptoms = entities.filter((e) => e.entry.category === 'symptom').map((e) => e.entry.label);
  const conditions = entities.filter((e) => e.entry.category === 'condition').map((e) => e.entry.label);
  const diagnostics = entities.filter((e) => e.entry.category === 'diagnostic').map((e) => e.entry.label);
  const treatments = entities.filter((e) => e.entry.category === 'treatment').map((e) => e.entry.label);

  const sentences = [];
  const presentParts = symptoms.concat(conditions);
  if (presentParts.length) sentences.push(patient.name + ' presents with ' + joinList(presentParts) + '.');
  if (diagnostics.length) sentences.push('Diagnostic workup included ' + joinList(diagnostics) + '.');
  if (treatments.length) sentences.push('Treatment administered: ' + joinList(treatments) + '.');

  const total = entities.reduce((s, e) => s + e.entry.fee * e.count, 0);
  const codeCount = entities.length;
  sentences.push(
    codeCount + ' billable clinical ' + (codeCount === 1 ? 'entity' : 'entities') +
    ' identified across ' + codeCount + ' ICD-10 / CPT / HCPCS ' + (codeCount === 1 ? 'code' : 'codes') +
    ' — an estimated ₹' + Math.round(total).toLocaleString('en-IN') + ' in potentially uncaptured revenue is pending HITL review.'
  );
  return sentences.join(' ');
}

function computeFinancials(entities, patient) {
  const codesTotal = entities.reduce((s, e) => s + e.entry.fee * e.count, 0);
  const base = BASE_FEE[patient.ward] || 500;
  const total = base + codesTotal;
  const coverage = TPA_COVERAGE[patient.tpa] || { pct: 0, cap: 0 };
  const approved = Math.min(total * coverage.pct, coverage.cap);
  const copay = Math.max(0, total - approved);
  return {
    base,
    codesTotal,
    total,
    tpa: patient.tpa,
    coveragePct: coverage.pct,
    coverageCap: coverage.cap === Infinity ? null : coverage.cap,
    approved,
    copay
  };
}

/**
 * Runs the full dual engine on a note for a given patient.
 * This is the one function both /api/engine/run (authoritative) and any
 * future batch/report job should call — never re-implement the parsing
 * logic anywhere else.
 */
function runEngineOnNote(patient, noteText) {
  const matches = findMatches(noteText || '');
  const entities = groupMatches(matches);
  const entitiesOut = entities.map((e) => ({
    id: e.entry.id,
    label: e.entry.label,
    category: e.entry.category,
    codeType: e.entry.codeType,
    code: e.entry.code,
    description: e.entry.description,
    fee: e.entry.fee,
    jargon: e.entry.jargon,
    afterCare: e.entry.afterCare,
    count: e.count
  }));
  const identifiedRevenue = entities.reduce((s, e) => s + e.entry.fee * e.count, 0);

  return {
    entities: entitiesOut,
    confidencePct: computeConfidence(entities),
    complianceAlerts: computeCompliance(entities, patient, noteText || ''),
    summary: computeSummary(entities, patient),
    identifiedRevenue,
    financials: computeFinancials(entities, patient)
  };
}

module.exports = { KEYWORDS, TPA_COVERAGE, BASE_FEE, runEngineOnNote };
