// Point this at wherever backend/server.js is running.
//
// If Express is serving this frontend for you (the default — just
// `cd backend && npm start` and open http://localhost:4000), leave this as
// a relative path and everything works with zero changes.
//
// If you deploy the frontend separately (GitHub Pages, Netlify, a static
// bucket) while the backend runs elsewhere (Render, Railway, Fly.io, ...),
// change this to that backend's public URL, e.g.:
//   window.AUTOMEDI_API_BASE = "https://automedi360-api.onrender.com/api";
window.AUTOMEDI_API_BASE = window.AUTOMEDI_API_BASE || '/api';
