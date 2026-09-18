SETUP FIREBASE - SISTEM PELAPORAN PM
====================================

File yang dipakai:
- index.html           -> form guru
- admin.html           -> login + dashboard admin
- script.js            -> logic Firebase
- firebase-config.js   -> konfigurasi project Firebase
- style.css            -> tampilan asli
- database.rules.json  -> Rules Realtime Database
- storage.rules        -> Rules Firebase Storage

1. BUAT / PILIH PROJECT FIREBASE
--------------------------------
Buka Firebase Console dan buat/pilih project.

2. TAMBAHKAN WEB APP
--------------------
Project settings -> General -> Your apps -> Add app -> Web.
Salin firebaseConfig ke firebase-config.js.

3. AKTIFKAN REALTIME DATABASE
-----------------------------
Build -> Realtime Database -> Create Database.
Pilih lokasi database yang sesuai.
Setelah dibuat, gunakan isi database.rules.json sebagai Rules.

4. AKTIFKAN STORAGE
-------------------
Build -> Storage -> Get started.
Gunakan isi storage.rules sebagai Storage Rules.

5. AKTIFKAN AUTHENTICATION
--------------------------
Authentication -> Sign-in method -> Email/Password -> Enable.

6. AKTIFKAN ANONYMOUS LOGIN UNTUK GURU
---------------------------------------
Authentication -> Sign-in method -> Anonymous -> Enable.
Halaman guru otomatis mendapatkan akun anonymous sehingga guru tidak perlu login.

7. BUAT AKUN ADMIN
------------------
Authentication -> Users -> Add user.
Gunakan:
Email    : admin@primagama.com
Password : password admin pilihan kamu

Username pada form admin tetap bisa diisi "admin" karena script akan
memetakannya ke ADMIN_LOGIN_EMAIL di firebase-config.js.

8. JIKA INGIN PAKAI EMAIL LAIN
-------------------------------
Ubah:
export const ADMIN_LOGIN_EMAIL = "admin@primagama.com";

9. JALANKAN DI HOSTING / LOCAL SERVER
--------------------------------------
Karena script menggunakan ES Module dan Firebase CDN, jalankan melalui
server (mis. VS Code Live Server atau Firebase Hosting), jangan membuka
file HTML dengan file:// langsung.

10. FIREBASE CLI (OPSIONAL)
--------------------------
Untuk deploy Hosting + Rules, salin database.rules.json dan storage.rules
ke project Firebase kamu lalu deploy sesuai konfigurasi firebase.json.

CATATAN KEAMANAN
----------------
Rules di atas membuat guru mendapat akses anonymous untuk menulis laporan dan
mengunggah foto, sedangkan akun admin (Email/Password) dapat membaca dan
menghapus laporan. Guru tidak melihat database laporan. Jangan membuka Rules
menjadi read/write publik karena itu akan memungkinkan siapa pun mengubah data.
