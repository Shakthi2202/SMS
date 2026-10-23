/* ============================================
   Campus Connect — auth.js
   Registration & login, kept in their own file.
   Plain script (no import/export) — load AFTER app.js:
     <script src="app.js"></script>
     <script src="auth.js"></script>
   Uses showToast() and localStorage, both defined in app.js.
   ============================================ */

/* ---------- Mock user store (localStorage) ---------- */

function getUsers(){
    return JSON.parse(localStorage.getItem("users")) || [];
}

function saveUsers(list){
    localStorage.setItem("users", JSON.stringify(list));
}

function getCurrentUser(){
    return JSON.parse(localStorage.getItem("currentUser")) || null;
}

function logoutUser(){
    localStorage.removeItem("currentUser");
}

/* ---------- Registration ---------- */

function registerUser(name, email, password, confirmPassword){
    name = (name || "").trim();
    email = (email || "").trim();

    if(!name || !email || !password || !confirmPassword){
        showToast("Please fill in every field.", "error");
        return false;
    }

    if(password.length < 6){
        showToast("Password must be at least 6 characters.", "error");
        return false;
    }

    if(password !== confirmPassword){
        showToast("Passwords don't match.", "error");
        return false;
    }

    const users = getUsers();
    const exists = users.some(u => u.email.toLowerCase() === email.toLowerCase());

    if(exists){
        showToast("An account with that email already exists.", "error");
        return false;
    }

    users.push({ name, email, password });
    saveUsers(users);
    localStorage.setItem("currentUser", JSON.stringify({ name, email }));

    showToast("Account created — welcome, " + name.split(" ")[0] + "!", "success");
    return true;
}

/* ---------- Login ---------- */

function loginUser(email, password){
    email = (email || "").trim();

    if(!email || !password){
        showToast("Please fill in both fields.", "error");
        return false;
    }

    if(password.length < 4){
        showToast("Password looks too short.", "error");
        return false;
    }

    const users = getUsers();
    const match = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if(!match){
        showToast("No account found for that email — try registering.", "error");
        return false;
    }

    if(match.password !== password){
        showToast("Incorrect password.", "error");
        return false;
    }

    localStorage.setItem("currentUser", JSON.stringify({ name: match.name, email: match.email }));
    showToast("Signed in — welcome back, " + match.name.split(" ")[0] + "!", "success");
    return true;
}
