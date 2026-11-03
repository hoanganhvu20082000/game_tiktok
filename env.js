// Nạp biến môi trường từ file .env (Node >= 20.12). Phải được import trước config.js.
try {
  process.loadEnvFile();
} catch {
  // không có .env: dùng giá trị mặc định / giọng trình duyệt
}
