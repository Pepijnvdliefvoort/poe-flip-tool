#!/usr/bin/env python3
"""Generate a secure API key for the PoE Trade backend."""
import secrets

api_key = secrets.token_urlsafe(32)
print("Generated API Key:")
print(api_key)
print("\nSetup instructions:")
print("1. Set this key in Fly.io secrets:")
print(f"   fly secrets set API_KEY={api_key} -a poe-flip-backend")
print("\n2. Add this key to GitHub repository secrets:")
print("   - Go to: https://github.com/Pepijnvdliefvoort/poe-flip-tool/settings/secrets/actions")
print("   - Click 'New repository secret'")
print("   - Name: API_KEY")
print(f"   - Value: {api_key}")
print("\n3. For local development, add to backend/.env:")
print(f"   API_KEY={api_key}")
print("\nKeep this key secret and secure!")
