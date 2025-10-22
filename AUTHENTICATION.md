# Authentication Setup

The application now uses **username/password authentication** instead of API keys.

## How It Works

1. **Login**: Users enter username and password on the login screen
2. **Session Token**: Backend generates a secure session token (valid for 24 hours)
3. **Authentication**: All API requests use the session token via `X-API-Key` header
4. **Logout**: Explicitly invalidate the session token

## Local Development Setup

### 1. Generate Password Hash

Run the password hash generator:

```powershell
python generate-password-hash.py
```

Enter your desired password when prompted. This will output a SHA256 hash.

### 2. Configure Backend

Add to `backend/.env`:

```env
AUTH_USERNAME=admin
AUTH_PASSWORD_HASH=<your-generated-hash>
```

Or use a plain password for development (not recommended for production):

```env
AUTH_USERNAME=admin
AUTH_PASSWORD=yourpassword
```

### 3. Start Backend

```powershell
cd backend
python main.py
```

Default credentials (if not configured):
- Username: `admin`
- Password: `changeme`

## Production Deployment (Fly.io)

### 1. Generate Password Hash

```powershell
python generate-password-hash.py
```

### 2. Set Fly Secrets

```powershell
# Set password hash (required)
fly secrets set AUTH_PASSWORD_HASH=<your-hash> -a poe-flip-backend

# Set custom username (optional, defaults to "admin")
fly secrets set AUTH_USERNAME=yourusername -a poe-flip-backend
```

### 3. Deploy

```powershell
git add .
git commit -m "Switch to username/password authentication"
git push origin develop
```

The GitHub Actions workflows will automatically deploy both backend and frontend.

## Security Notes

- ✅ Session tokens expire after 24 hours
- ✅ Passwords are hashed with SHA256 (never stored in plain text)
- ✅ Session tokens are stored client-side in sessionStorage (cleared on browser close)
- ✅ Logout endpoint invalidates the session token on the server
- ⚠️  Session tokens are stored in-memory on the server (lost on restart)
- ⚠️  Consider using HTTPS for production to protect credentials in transit

## User Experience

1. Visit the application
2. See login screen with username/password fields
3. Enter credentials and click "Sign in"
4. Session lasts 24 hours or until logout/browser close
5. Click "Logout" button to end session

## Troubleshooting

**"Invalid username or password"**
- Check that `AUTH_USERNAME` and `AUTH_PASSWORD_HASH` are set correctly
- Verify the password hash was generated correctly
- Check backend logs for authentication attempts

**"Connection error"**
- Backend may not be running
- Check `VITE_BACKEND_URL` is set correctly in frontend build

**Session expired after refresh**
- Normal if backend was restarted (sessions are in-memory)
- Simply log in again

## Migration from API Key

The old API key system has been completely replaced. No API keys are needed anymore - just username and password.

If you had `API_KEY` in your Fly secrets, you can remove it:
```powershell
fly secrets unset API_KEY -a poe-flip-backend
```
