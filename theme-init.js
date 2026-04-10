// Apply saved theme immediately to prevent flash of wrong theme
const t = localStorage.getItem('ad-theme');
if (t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches)) {
  document.documentElement.classList.add('ad-dark');
}
