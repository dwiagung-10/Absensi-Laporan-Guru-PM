import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";

const firebaseConfig = {
  apiKey: "AIzaSyArJQ7ZsOOcsWVFbhvCah0gsvDwH3M3sv0",
  authDomain: "laporan-pm-77240.firebaseapp.com",
  databaseURL: "https://laporan-pm-77240-default-rtdb.firebaseio.com",
  projectId: "laporan-pm-77240",
  storageBucket: "laporan-pm-77240.firebasestorage.app",
  messagingSenderId: "1071055949276",
  appId: "1:1071055949276:web:f07f1dcdb0b240b20b9319"
};

const app = initializeApp(firebaseConfig);

const ADMIN_LOGIN_EMAIL = "akademik.primagamasugar@gmail.com";

export {
  app,
  firebaseConfig,
  ADMIN_LOGIN_EMAIL
};