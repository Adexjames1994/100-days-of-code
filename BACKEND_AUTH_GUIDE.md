# Backend Auth Update Guide (Admin Domain Rule + Testing + Frontend Connection)

Use this guide to update your backend so that **only `@anchorbridge.com` emails become `ADMIN`**, and all other signups become `CLIENT`.

## 1) Update `signup` logic

In your `authController.js`, replace your current `signup` with this version:

```js
export const signup = async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const isAnchorBridgeAdmin = normalizedEmail.endsWith("@anchorbridge.com");
    const assignedRole = isAnchorBridgeAdmin ? "ADMIN" : "CLIENT";

    if (assignedRole === "CLIENT" && !fullName) {
      return res.status(400).json({ message: "Full name is required for clients" });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const user = await User.create({
      fullName: assignedRole === "CLIENT" ? fullName?.trim() : undefined,
      email: normalizedEmail,
      password,
      role: assignedRole,
      isVerified: assignedRole === "ADMIN", // optional
    });

    const token = generateToken(user);

    res.status(201).json({
      message: "Signup successful",
      token,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Signup failed", error: error.message });
  }
};
```

### Why this works
- Ignores incoming `role` from client payload (prevents privilege escalation).
- Automatically maps:
  - `user@anchorbridge.com` → `ADMIN`
  - everything else → `CLIENT`
- Prevents duplicate response keys and enforces clean payload.

---

## 2) Update `createAdmin` logic (if you keep this route)

In `adminUserController.js`, update to enforce domain rule:

```js
export const createAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail.endsWith("@anchorbridge.com")) {
      return res.status(400).json({
        message: "Only @anchorbridge.com emails can be registered as ADMIN",
      });
    }

    const adminExists = await User.findOne({ email: normalizedEmail });
    if (adminExists) {
      return res.status(400).json({ message: "Admin already exists" });
    }

    const admin = await User.create({
      email: normalizedEmail,
      password,
      role: "ADMIN",
      isVerified: true,
    });

    res.status(201).json({
      message: "Admin created",
      admin: {
        id: admin._id,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Create admin failed", error: error.message });
  }
};
```

---

## 3) Important bug fix in `User` model

Your current `pre('save')` hash hook is missing `next()` when password changes.
Use this:

```js
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});
```

Without `next()`, request flow may hang while saving users.

---

## 4) Middleware naming mismatch fix

You currently export `allowRoles` but import `authorize`.
Pick one name consistently.

Example (`middlewares/roleMiddleware.js`):

```js
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }
    next();
  };
};
```

Then your route import works:

```js
import { authorize } from "../middlewares/roleMiddleware.js";
```

---

## 5) Thunder Client test checklist

Base URL example:
- `http://localhost:5000/api/v1`

### A) Signup with admin domain
**POST** `/signup`

```json
{
  "email": "owner@anchorbridge.com",
  "password": "secret123"
}
```

Expected:
- `201`
- `user.role = "ADMIN"`

### B) Signup with non-admin domain
**POST** `/signup`

```json
{
  "fullName": "Jane Client",
  "email": "jane@gmail.com",
  "password": "secret123"
}
```

Expected:
- `201`
- `user.role = "CLIENT"`

### C) Attempt role injection (must fail silently to CLIENT)
**POST** `/signup`

```json
{
  "fullName": "Hacker",
  "email": "hacker@yahoo.com",
  "password": "secret123",
  "role": "ADMIN"
}
```

Expected:
- still `CLIENT`

### D) Login
**POST** `/login`

```json
{
  "email": "owner@anchorbridge.com",
  "password": "secret123"
}
```

Expected:
- `200`
- returns `token`

---

## 6) Connect to frontend

In React app:

1. Create `.env`:

```bash
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

2. Example API call:

```js
const API = import.meta.env.VITE_API_BASE_URL;

await fetch(`${API}/signup`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    fullName: "Jane Client",
    email: "jane@gmail.com",
    password: "secret123",
  }),
});
```

3. For protected routes:
- Save JWT in localStorage/session (or HTTP-only cookie if you later implement that).
- Send header:

```js
Authorization: `Bearer ${token}`
```

---

## 7) Quick cleanup suggestions
- Remove old commented duplicate controller versions.
- Remove duplicate keys in JSON responses (`email`, `fullName` repeated).
- Ensure routes include admin routes in `server.js`, e.g.:

```js
import adminRoutes from "./routes/adminRoutes.js";
app.use(`${apiVersion}admin`, adminRoutes);
```

