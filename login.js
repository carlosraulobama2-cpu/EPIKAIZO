// Default dummy users for demonstration
const dummyUsers = [
  { id: 'USR-001', email: 'admin@epikaizo.com', password: 'admin123', role: 'superadmin', city: 'Todas' },
  { id: 'USR-002', email: 'bata@epikaizo.com', password: 'bata123', role: 'branchadmin', city: 'Bata' },
  { id: 'USR-003', email: 'malabo@epikaizo.com', password: 'malabo123', role: 'branchadmin', city: 'Malabo' }
];

// Initialize users in localStorage if not exists
if (!localStorage.getItem('epk_users')) {
  localStorage.setItem('epk_users', JSON.stringify(dummyUsers));
}

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const errorMsg = document.getElementById('loginError');

  // If already logged in, redirect to dashboard
  if (localStorage.getItem('epk_session')) {
    window.location.href = 'dashboard.html';
  }

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    errorMsg.style.display = 'none';

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    const users = JSON.parse(localStorage.getItem('epk_users') || '[]');
    const user = users.find(u => u.email === email && u.password === password);

    if (user) {
      // Create session object (without password)
      const session = {
        id: user.id,
        email: user.email,
        role: user.role,
        city: user.city,
        name: email.split('@')[0].toUpperCase()
      };
      
      localStorage.setItem('epk_session', JSON.stringify(session));
      window.location.href = 'dashboard.html';
    } else {
      errorMsg.style.display = 'block';
    }
  });
});
