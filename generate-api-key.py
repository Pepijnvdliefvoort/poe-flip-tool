#!/usr/bin/env python3
"""Generate a secure API key for the PoE Trade backend."""
import secrets

api_key = secrets.token_urlsafe(32)
print("=" * 60)
print("Generated API Key:")
print("=" * 60)
print(api_key)
print("=" * 60)
print("\nSetup instructions:")
print("\n1. Set this key in Fly.io secrets:")
print(f"   fly secrets set API_KEY={api_key} -a poe-flip-backend")
print("\n2. Add this key to GitHub repository secrets:")
print("   - Go to: https://github.com/Pepijnvdliefvoort/poe-flip-tool/settings/secrets/actions")
print("   - Click 'New repository secret'")
print("   - Name: API_KEY")
print(f"   - Value: {api_key}")
print("\n3. For local development, add to backend/.env:")
print(f"   API_KEY={api_key}")
print("\n4. To access the frontend, users will need to enter this key at login.")
print("\n⚠️  KEEP THIS KEY SECRET AND SECURE!")
print("   Anyone with this key can access your backend and use your POESESSID.")
print("=" * 60)

