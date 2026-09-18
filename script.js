import { app, ADMIN_LOGIN_EMAIL } from "./firebase-config.js";

import {
  getDatabase,
  ref,
  push,
  set,
  onValue,
  remove,
  get
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

// ===============================
// CLOUDINARY
// ===============================
const CLOUDINARY_CLOUD_NAME = "xlrhfbcg";
const CLOUDINARY_UPLOAD_PRESET = "laporan_pm";

// ===============================
// FIREBASE
// ===============================
const db = getDatabase(app);
const auth = getAuth(app);

const REPORTS_PATH = "reports";

const MIN_PHOTOS = 2;
const MAX_PHOTOS = 5;
const MAX_FILE_SIZE_MB = 10;

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp"
];

let reportsCache = [];
let reportsLoaded = false;
let dashboardState = {
  keywordGuru: "",
  filterTanggal: ""
};
let unsubscribeReports = null;

/* =========================================================
   UTILITY
   ========================================================= */
function showToast(message, isError = false) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle("toast--error", !!isError);
  toast.classList.add("is-visible");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove("is-visible"), 3500);
}

function generateId() {
  return "pm_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function getPhotoUrl(foto) {
  if (!foto) return "";

  // Jika Firebase menyimpan URL langsung sebagai string
  if (typeof foto === "string") {
    return foto;
  }

  // Jika Firebase menyimpan object hasil upload Cloudinary
  return foto.url || foto.secure_url || foto.dataUrl || "";
}

function normalizePhotos(dokumentasi) {
  if (!dokumentasi) return [];

  // Array
  if (Array.isArray(dokumentasi)) {
    return dokumentasi.filter(Boolean);
  }

  // Object dari Firebase Realtime Database
  if (typeof dokumentasi === "object") {
    return Object.values(dokumentasi).filter(Boolean);
  }

  // URL langsung
  if (typeof dokumentasi === "string") {
    return [dokumentasi];
  }

  return [];
}

function formatTanggal(tanggalStr) {
  if (!tanggalStr) return "-";
  const d = new Date(tanggalStr + "T00:00:00");
  if (isNaN(d.getTime())) return tanggalStr;
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatWaktu(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function friendlyFirebaseError(error) {
  const code = error?.code || "";
  const map = {
    "auth/invalid-credential": "Email/username atau password salah.",
    "auth/invalid-login-credentials": "Email/username atau password salah.",
    "auth/user-not-found": "Akun admin belum dibuat di Firebase Authentication.",
    "auth/wrong-password": "Password admin salah.",
    "auth/too-many-requests": "Terlalu banyak percobaan login. Coba lagi beberapa saat.",
    "auth/network-request-failed": "Koneksi internet bermasalah.",
    "permission-denied": "Akses Firebase ditolak. Periksa Firebase Rules.",
    "storage/unauthorized": "Upload foto ditolak oleh Storage Rules.",
  };
  return map[code] || error?.message || "Terjadi kesalahan. Silakan coba lagi.";
}

/* =========================================================
   FIREBASE DATA LAYER
   ========================================================= */
async function saveReport(report) {
  const reportRef = push(ref(db, REPORTS_PATH));
  await set(reportRef, {
    ...report,
    id: reportRef.key,
  });
  return reportRef.key;
}

async function deleteReport(id) {
  const report = reportsCache.find((item) => item.id === id);

  if (!report) return;

  await remove(ref(db, `${REPORTS_PATH}/${id}`));
}

function subscribeReports() {
  if (unsubscribeReports) unsubscribeReports();

  const reportsRef = ref(db, REPORTS_PATH);
  unsubscribeReports = onValue(
    reportsRef,
    (snapshot) => {
      const value = snapshot.val() || {};
     reportsCache = Object.entries(value).map(([id, report]) => ({
  id,
  ...report,
  dokumentasi: normalizePhotos(report?.dokumentasi),
}));

      reportsCache.sort((a, b) => (b.waktuInput || 0) - (a.waktuInput || 0));
      reportsLoaded = true;
      renderDashboard();
    },
    (error) => {
      console.error("Gagal membaca Firebase:", error);
      reportsLoaded = true;
      showToast(friendlyFirebaseError(error), true);
    }
  );
}

async function getReports() {
  if (reportsLoaded) return reportsCache;
  const snapshot = await get(ref(db, REPORTS_PATH));
  const value = snapshot.val() || {};
 reportsCache = Object.entries(value).map(([id, report]) => ({
  id,
  ...report,
  dokumentasi: normalizePhotos(report?.dokumentasi),
}));
  reportsCache.sort((a, b) => (b.waktuInput || 0) - (a.waktuInput || 0));
  reportsLoaded = true;
  return reportsCache;
}

/* =========================================================
   HALAMAN GURU
   ========================================================= */
(function initGuruForm() {
  const form = document.getElementById("form-laporan");
  if (!form) return;

  const inputNama = document.getElementById("namaGuru");
  const inputSekolah = document.getElementById("sekolah");
  const inputTanggal = document.getElementById("tanggal");
  const inputMateri = document.getElementById("materi");
  const inputFoto = document.getElementById("dokumentasi");
  const previewGrid = document.getElementById("preview-grid");
  const uploadCountEl = document.getElementById("upload-count");
  const formAlert = document.getElementById("form-alert");
  const submitBtn = form.querySelector('button[type="submit"]');

  let selectedPhotos = [];

  // Guru tidak perlu login. Browser otomatis mendapatkan akun anonymous
  // agar Firebase Rules bisa membedakan guru dari admin.
  signInAnonymously(auth).catch((error) => {
    console.error("Gagal mengaktifkan akses guru:", error);
    showToast(friendlyFirebaseError(error), true);
  });

  function setFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    const wrapper = field.closest(".field");
    const errorEl = wrapper?.querySelector(".field-error");
    wrapper?.classList.toggle("has-error", !!message);
    if (errorEl) errorEl.textContent = message || "";
  }

  function setUploadError(message) {
    const wrapper = document.getElementById("upload-wrapper");
    const errorEl = document.getElementById("upload-error");
    wrapper?.classList.toggle("has-error", !!message);
    if (errorEl) errorEl.textContent = message || "";
  }

  function renderPreview() {
  previewGrid.innerHTML = "";

  selectedPhotos.forEach((photo, index) => {
    const item = document.createElement("div");
    item.className = "preview-item";

    // Tampilkan foto yang baru dipilih dari HP
    const img = document.createElement("img");
    img.src = photo.previewUrl;
    img.alt = "Preview dokumentasi " + (index + 1);

    img.addEventListener("error", () => {
      console.error("Preview foto gagal ditampilkan:", photo.name);
    });

    // Tombol hapus foto
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "preview-item__remove";
    removeBtn.setAttribute(
      "aria-label",
      "Hapus foto " + (index + 1)
    );
    removeBtn.textContent = "×";

    removeBtn.addEventListener("click", () => {
      URL.revokeObjectURL(photo.previewUrl);

      selectedPhotos.splice(index, 1);

      renderPreview();
    });

    item.append(img, removeBtn);
    previewGrid.appendChild(item);
  });

  // Tampilkan jumlah foto
  uploadCountEl.innerHTML =
    `Terpilih: <strong>${selectedPhotos.length}</strong> ` +
    `dari maksimal ${MAX_PHOTOS} foto ` +
    `(minimal ${MIN_PHOTOS}).`;

  if (selectedPhotos.length >= MIN_PHOTOS) {
    setUploadError("");
  }
}
  inputFoto.addEventListener("change", (e) => {
  const files = Array.from(e.target.files || []);

  console.log("FILE DIPILIH:", files);

  if (files.length === 0) {
    console.log("Tidak ada file yang dipilih.");
    return;
  }

  let ditolakFormat = 0;
  let ditolakUkuran = 0;
  let ditolakMaks = 0;

  for (const file of files) {

    // Beberapa HP/browser bisa memberikan MIME kosong.
    // Karena itu kita cek MIME DAN ekstensi file.
    const extension = file.name
      .split(".")
      .pop()
      .toLowerCase();

    const allowedExtensions = ["jpg", "jpeg", "png", "webp"];

    const formatValid =
      ALLOWED_TYPES.includes(file.type) ||
      allowedExtensions.includes(extension);

    if (!formatValid) {
      ditolakFormat++;
      continue;
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      ditolakUkuran++;
      continue;
    }

    if (selectedPhotos.length >= MAX_PHOTOS) {
      ditolakMaks++;
      continue;
    }

    const previewUrl = URL.createObjectURL(file);

    selectedPhotos.push({
      file: file,
      name: file.name,
      previewUrl: previewUrl
    });
  }

  console.log("FOTO TERPILIH:", selectedPhotos);

  if (ditolakFormat > 0) {
    setUploadError(
      "Ada foto yang tidak didukung. Gunakan JPG, JPEG, PNG, atau WEBP."
    );
  } else if (ditolakUkuran > 0) {
    setUploadError(
      `Ukuran setiap foto maksimal ${MAX_FILE_SIZE_MB} MB.`
    );
  } else if (ditolakMaks > 0) {
    setUploadError(
      `Maksimal ${MAX_PHOTOS} foto dokumentasi.`
    );
  } else {
    setUploadError("");
  }

  renderPreview();

  // Reset input supaya guru bisa memilih foto lagi
  // walaupun memilih file yang sama.
  e.target.value = "";
});
  function validateForm() {
    let valid = true;

    if (!inputNama.value.trim()) {
      setFieldError("namaGuru", "Nama guru wajib diisi.");
      valid = false;
    } else setFieldError("namaGuru", "");

    if (!inputSekolah.value.trim()) {
      setFieldError("sekolah", "Tempat pelaksanaan PM wajib diisi.");
      valid = false;
    } else setFieldError("sekolah", "");

    if (!inputTanggal.value) {
      setFieldError("tanggal", "Tanggal pelaksanaan wajib diisi.");
      valid = false;
    } else setFieldError("tanggal", "");

    if (!inputMateri.value.trim()) {
      setFieldError("materi", "Materi Pendalaman Materi wajib diisi.");
      valid = false;
    } else setFieldError("materi", "");

    if (selectedPhotos.length < MIN_PHOTOS) {
      setUploadError(`Minimal upload ${MIN_PHOTOS} foto dokumentasi.`);
      valid = false;
    }

    return valid;
  }

  function resetForm() {
    selectedPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    selectedPhotos = [];
    form.reset();
    renderPreview();
    ["namaGuru", "sekolah", "tanggal", "materi"].forEach((id) => setFieldError(id, ""));
    setUploadError("");
    formAlert?.classList.remove("is-visible");
  }

async function uploadPhotos(reportId) {
  const dokumentasi = [];

  for (let i = 0; i < selectedPhotos.length; i++) {
    const photo = selectedPhotos[i];

    const formData = new FormData();

    formData.append("file", photo.file);
    formData.append(
      "upload_preset",
      CLOUDINARY_UPLOAD_PRESET
    );

    formData.append(
      "folder",
      `laporan-pm/${reportId}`
    );

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      {
        method: "POST",
        body: formData
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        "Cloudinary error:",
        errorText
      );

      throw new Error(
        "Gagal mengupload foto."
      );
    }

    const data = await response.json();

    dokumentasi.push({
      name: photo.name,
      url: data.secure_url,
      publicId: data.public_id
    });
  }

  return dokumentasi;
}
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      formAlert.textContent = "Periksa kembali isian yang ditandai merah di bawah.";
      formAlert.classList.add("is-visible");
      const firstError = form.querySelector(".has-error");
      if (firstError) firstError.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    formAlert.classList.remove("is-visible");
    submitBtn.disabled = true;
    submitBtn.dataset.originalText = submitBtn.textContent;
    submitBtn.textContent = "Mengirim laporan...";

    const reportId = generateId();
    let uploadedPhotos = [];

    try {
      uploadedPhotos = await uploadPhotos(reportId);

      await saveReport({
        id: reportId,
        namaGuru: inputNama.value.trim(),
        sekolah: inputSekolah.value.trim(),
        tanggal: inputTanggal.value,
        materi: inputMateri.value.trim(),
        dokumentasi: uploadedPhotos,
        waktuInput: Date.now(),
      });

      showToast("Laporan berhasil dikirim ke Firebase.");
      resetForm();
    } catch (error) {
      console.error(error);

      // Jika database gagal setelah foto ter-upload, coba bersihkan foto.

      formAlert.textContent = friendlyFirebaseError(error);
      formAlert.classList.add("is-visible");
      showToast("Laporan gagal dikirim.", true);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = submitBtn.dataset.originalText || "Simpan Laporan";
    }
  });

  renderPreview();
})();

/* =========================================================
   LOGIN ADMIN - Firebase Authentication
   ========================================================= */
(function initAdminLogin() {
  const loginForm = document.getElementById("form-admin-login");
  if (!loginForm) return;

  const loginSection = document.getElementById("admin-login-view");
  const dashboardSection = document.getElementById("admin-dashboard-view");
  const loginError = document.getElementById("login-error");
  const usernameInput = document.getElementById("adminUsername");
  const passwordInput = document.getElementById("adminPassword");
  const submitBtn = loginForm.querySelector('button[type="submit"]');

  function showLoginError(message) {
    loginError.textContent = message;
    loginError.classList.add("is-visible");
  }

  function showDashboard() {
    loginSection.style.display = "none";
    dashboardSection.style.display = "block";
    subscribeReports();
    renderDashboard();
  }

  function showLogin() {
    loginSection.style.display = "flex";
    dashboardSection.style.display = "none";
    if (unsubscribeReports) {
      unsubscribeReports();
      unsubscribeReports = null;
    }
  }

  onAuthStateChanged(auth, (user) => {
    // Akun anonymous dipakai halaman guru dan bukan admin.
    if (user && !user.isAnonymous) showDashboard();
    else showLogin();
  });

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.classList.remove("is-visible");

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      showLoginError("Username dan password wajib diisi.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Memeriksa...";

    try {
      // UI tetap memakai username "admin", tetapi Firebase Auth memakai email.
      // Jika ingin email lain, ubah ADMIN_LOGIN_EMAIL di firebase-config.js.
      const email = username.includes("@") ? username : ADMIN_LOGIN_EMAIL;
      await signInWithEmailAndPassword(auth, email, password);
      passwordInput.value = "";
    } catch (error) {
      console.error(error);
      showLoginError(friendlyFirebaseError(error));
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Masuk";
    }
  });
})();

/* =========================================================
   DASHBOARD ADMIN
   ========================================================= */
function initAdminDashboard() {
  const dashboard = document.getElementById("admin-dashboard-view");
  if (!dashboard) return;

  const logoutBtn = document.getElementById("btn-logout");
  const searchInput = document.getElementById("search-guru");
  const filterTanggalInput = document.getElementById("filter-tanggal");
  const clearFilterBtn = document.getElementById("btn-clear-filter");

  logoutBtn?.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (error) {
      showToast(friendlyFirebaseError(error), true);
    }
  });

  searchInput?.addEventListener("input", (e) => {
    dashboardState.keywordGuru = e.target.value.trim().toLowerCase();
    renderDashboard();
  });

  filterTanggalInput?.addEventListener("change", (e) => {
    dashboardState.filterTanggal = e.target.value;
    renderDashboard();
  });

  const exportBtn = document.getElementById("btn-export-excel");
  exportBtn?.addEventListener("click", () => exportReportsToExcel(exportBtn));

  clearFilterBtn?.addEventListener("click", () => {
    dashboardState = { keywordGuru: "", filterTanggal: "" };
    if (searchInput) searchInput.value = "";
    if (filterTanggalInput) filterTanggalInput.value = "";
    renderDashboard();
  });

  document.querySelectorAll("[data-modal-close]").forEach((btn) => {
    btn.addEventListener("click", (e) => closeModal(e.target.closest(".modal-overlay")));
  });

  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal(overlay);
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal-overlay.is-visible").forEach(closeModal);
    }
  });
}

function openModal(overlay) {
  overlay?.classList.add("is-visible");
}

function closeModal(overlay) {
  overlay?.classList.remove("is-visible");
}

function getFilteredReports() {
  return reportsCache.filter((r) => {
    const kw = dashboardState.keywordGuru;
    const nama = String(r.namaGuru || "").toLowerCase();
    const sekolah = String(r.sekolah || "").toLowerCase();
    const cocokKeyword = !kw || nama.includes(kw) || sekolah.includes(kw);
    const cocokTanggal = !dashboardState.filterTanggal || r.tanggal === dashboardState.filterTanggal;
    return cocokKeyword && cocokTanggal;
  });
}

function renderDashboard() {
  const dashboard = document.getElementById("admin-dashboard-view");
  if (!dashboard || dashboard.style.display === "none") return;

  const reports = reportsCache;
  const filtered = getFilteredReports();

  const totalLaporanEl = document.getElementById("stat-total-laporan");
  const totalGuruEl = document.getElementById("stat-total-guru");
  const totalDokEl = document.getElementById("stat-total-dokumentasi");

  if (totalLaporanEl) totalLaporanEl.textContent = reports.length;
  if (totalGuruEl) {
    const guruUnik = new Set(reports.map((r) => String(r.namaGuru || "").trim().toLowerCase()));
    totalGuruEl.textContent = guruUnik.size;
  }
  if (totalDokEl) {
    totalDokEl.textContent = reports.reduce(
      (sum, r) => sum + (Array.isArray(r.dokumentasi) ? r.dokumentasi.length : 0),
      0
    );
  }

  const tbody = document.getElementById("report-table-body");
  const emptyState = document.getElementById("table-empty-state");
  const tableWrap = document.getElementById("table-wrap");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!reportsLoaded) {
    if (tableWrap) tableWrap.style.display = "none";
    if (emptyState) {
      emptyState.style.display = "block";
      emptyState.innerHTML = "<p class='empty-state__title'>Memuat data...</p><p>Mengambil laporan dari Firebase.</p>";
    }
    return;
  }

  if (filtered.length === 0) {
    if (tableWrap) tableWrap.style.display = "none";
    if (emptyState) {
      emptyState.style.display = "block";
      emptyState.innerHTML = "<p class='empty-state__title'>Belum ada laporan</p><p>Belum ada laporan yang cocok dengan pencarian, atau guru belum mengisi laporan.</p>";
    }
    return;
  }

  if (tableWrap) tableWrap.style.display = "block";
  if (emptyState) emptyState.style.display = "none";

  filtered.forEach((report, idx) => {
    const tr = document.createElement("tr");
    const materi = String(report.materi || "");
    const materiSingkat = materi.length > 70 ? materi.slice(0, 70).trim() + "..." : materi;

    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${escapeHtml(report.namaGuru)}</td>
      <td>${escapeHtml(report.sekolah)}</td>
      <td>${formatTanggal(report.tanggal)}</td>
      <td class="materi-cell"><span class="materi-cell__text">${escapeHtml(materiSingkat)}</span></td>
      <td class="dokumentasi-cell"></td>
      <td class="action-cell"></td>
    `;

    const dokCell = tr.querySelector(".dokumentasi-cell");
    const thumbRow = document.createElement("div");
    thumbRow.className = "thumb-row";

    const photos = Array.isArray(report.dokumentasi) ? report.dokumentasi : [];
    photos.slice(0, 3).forEach((foto) => {
      const img = document.createElement("img");
      img.src = foto.url || foto.dataUrl || "";
      img.alt = "Dokumentasi " + String(report.namaGuru || "");
      img.className = "thumb";
      img.loading = "lazy";
      img.addEventListener("click", () => showImageModal(img.src));
      thumbRow.appendChild(img);
    });

    if (photos.length > 3) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "thumb-more";
      more.textContent = "+" + (photos.length - 3);
      more.addEventListener("click", () => showDetailModal(report.id));
      thumbRow.appendChild(more);
    }

    dokCell.appendChild(thumbRow);

    const actionCell = tr.querySelector(".action-cell");
    const detailBtn = document.createElement("button");
    detailBtn.type = "button";
    detailBtn.className = "btn btn-secondary btn-small";
    detailBtn.textContent = "Lihat Detail";
    detailBtn.addEventListener("click", () => showDetailModal(report.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-danger btn-small";
    deleteBtn.textContent = "Hapus";
    deleteBtn.addEventListener("click", () => showDeleteConfirm(report.id));

    actionCell.append(detailBtn, deleteBtn);
    tbody.appendChild(tr);
  });
}

/* =========================================================
   EKSPOR KE EXCEL (dengan gambar dokumentasi)
   ========================================================= */
function loadImageElement(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(blob);
    img.onload = () => resolve({ img, objectUrl });
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Gagal memuat gambar"));
    };
    img.src = objectUrl;
  });
}

async function blobToPngBase64(blob) {
  const { img, objectUrl } = await loadImageElement(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function exportReportsToExcel(triggerBtn) {
  const ExcelJSLib = window.ExcelJS;
  if (!ExcelJSLib) {
    showToast("Modul Excel belum siap, coba lagi sebentar.", true);
    return;
  }

  const reports = getFilteredReports();
  if (reports.length === 0) {
    showToast("Tidak ada data laporan untuk diekspor.", true);
    return;
  }

  const originalLabel = triggerBtn.textContent;
  triggerBtn.disabled = true;

  try {
    const workbook = new ExcelJSLib.Workbook();
    workbook.creator = "Sistem Pelaporan PM";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Rekap Laporan PM");

    const maxFoto = reports.reduce(
      (max, r) => Math.max(max, Array.isArray(r.dokumentasi) ? r.dokumentasi.length : 0),
      0
    ) || 1;

    const columns = [
      { header: "No", key: "no", width: 6 },
      { header: "Nama Guru", key: "namaGuru", width: 22 },
      { header: "Sekolah/Tempat PM", key: "sekolah", width: 24 },
      { header: "Tanggal", key: "tanggal", width: 14 },
      { header: "Materi", key: "materi", width: 40 }
    ];
    for (let i = 1; i <= maxFoto; i++) {
      columns.push({ header: `Foto ${i}`, key: `foto${i}`, width: 18 });
    }
    sheet.columns = columns;

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 22;

    const IMG_ROW_HEIGHT = 90;
    const IMG_PX = 100;
    const FIXED_COL_COUNT = 5; // No, Nama Guru, Sekolah, Tanggal, Materi

    for (let i = 0; i < reports.length; i++) {
      const report = reports[i];
      const rowNumber = i + 2;
      const row = sheet.getRow(rowNumber);

      row.getCell("no").value = i + 1;
      row.getCell("namaGuru").value = report.namaGuru || "";
      row.getCell("sekolah").value = report.sekolah || "";
      row.getCell("tanggal").value = formatTanggal(report.tanggal);
      row.getCell("materi").value = report.materi || "";
      row.alignment = { vertical: "middle", wrapText: true };

      const photos = Array.isArray(report.dokumentasi) ? report.dokumentasi : [];
      let hasPhoto = false;

      for (let p = 0; p < photos.length; p++) {
        const url = photos[p]?.url || photos[p]?.dataUrl;
        if (!url) continue;

        triggerBtn.textContent = `Mengunduh foto laporan ${i + 1}/${reports.length}...`;

        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error("Gagal mengambil gambar");
          const blob = await response.blob();
          const base64 = await blobToPngBase64(blob);
          const imageId = workbook.addImage({ base64, extension: "png" });

          sheet.addImage(imageId, {
            tl: { col: FIXED_COL_COUNT + p, row: rowNumber - 1 },
            ext: { width: IMG_PX, height: IMG_PX }
          });
          hasPhoto = true;
        } catch (err) {
          console.error("Gagal memuat gambar untuk Excel:", url, err);
          row.getCell(FIXED_COL_COUNT + 1 + p).value = "Gagal memuat foto";
        }
      }

      row.height = hasPhoto ? IMG_ROW_HEIGHT : 20;
      row.commit();
    }

    triggerBtn.textContent = "Menyusun file...";

    const bufferOut = await workbook.xlsx.writeBuffer();
    const blobOut = new Blob([bufferOut], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

    const today = new Date().toISOString().slice(0, 10);
    const filename = `Rekap-Laporan-PM-${today}.xlsx`;

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blobOut);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);

    showToast(`Berhasil mengekspor ${reports.length} laporan ke Excel.`);
  } catch (error) {
    console.error(error);
    showToast("Gagal membuat file Excel. Coba lagi.", true);
  } finally {
    triggerBtn.disabled = false;
    triggerBtn.textContent = originalLabel;
  }
}

function showDetailModal(reportId) {
  const report = reportsCache.find((r) => r.id === reportId);
  if (!report) return;

  const overlay = document.getElementById("modal-detail");
  const body = document.getElementById("modal-detail-body");
  if (!overlay || !body) return;

  const photos = Array.isArray(report.dokumentasi) ? report.dokumentasi : [];
  body.innerHTML = `
    <dl class="detail-grid">
      <div class="detail-row"><dt>Nama Guru</dt><dd>${escapeHtml(report.namaGuru)}</dd></div>
      <div class="detail-row"><dt>Sekolah/Tempat PM</dt><dd>${escapeHtml(report.sekolah)}</dd></div>
      <div class="detail-row"><dt>Tanggal Pelaksanaan</dt><dd>${formatTanggal(report.tanggal)}</dd></div>
      <div class="detail-row"><dt>Materi PM</dt><dd>${escapeHtml(report.materi)}</dd></div>
      <div class="detail-row"><dt>Dokumentasi Kegiatan</dt><dd><div class="detail-photos"></div></dd></div>
      <div class="detail-row"><dt>Waktu Laporan Dibuat</dt><dd>${formatWaktu(report.waktuInput)}</dd></div>
    </dl>
  `;

  const photoContainer = body.querySelector(".detail-photos");
 photos.forEach((foto, i) => {
  const img = document.createElement("img");

  const photoUrl = getPhotoUrl(foto);

  console.log("URL dokumentasi " + (i + 1) + ":", photoUrl);

  img.src = photoUrl;
  img.alt = "Dokumentasi " + (i + 1);

  img.addEventListener("error", () => {
    console.error("Gambar Cloudinary gagal dimuat:", photoUrl);
    img.alt = "Gambar dokumentasi tidak dapat dimuat";
  });

  img.addEventListener("click", () => {
    if (photoUrl) {
      showImageModal(photoUrl);
    }
  });

  photoContainer.appendChild(img);
});

  openModal(overlay);
}

function showImageModal(url) {
  const overlay = document.getElementById("modal-image");
  const img = document.getElementById("modal-image-el");
  if (!overlay || !img) return;
  img.src = url;
  openModal(overlay);
}

function showDeleteConfirm(reportId) {
  const overlay = document.getElementById("modal-confirm");
  const confirmBtn = document.getElementById("btn-confirm-delete");
  if (!overlay || !confirmBtn) return;

  const newBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);

  newBtn.addEventListener("click", async () => {
    newBtn.disabled = true;
    newBtn.textContent = "Menghapus...";

    try {
      await deleteReport(reportId);
      closeModal(overlay);
      showToast("Laporan dan dokumentasi berhasil dihapus.");
    } catch (error) {
      console.error(error);
      showToast(friendlyFirebaseError(error), true);
    } finally {
      newBtn.disabled = false;
      newBtn.textContent = "Ya, Hapus";
    }
  });

  openModal(overlay);
}

initAdminDashboard();