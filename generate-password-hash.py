#!/usr/bin/env python3
"""
Generate a SHA256 password hash for authentication.
Usage: python generate-password-hash.py
"""
import hashlib
import getpass

def main():
    print("=== Password Hash Generator ===")
    print("This will generate a SHA256 hash for your password.")
    print()
    
    password = getpass.getpass("Enter password: ")
    confirm = getpass.getpass("Confirm password: ")
    
    if password != confirm:
        print("❌ Passwords don't match!")
        return
    
    if len(password) < 8:
        print("⚠️  Warning: Password is very short (< 8 characters)")
    
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    
    print()
    print("✅ Password hash generated!")
    print()
    print("Add this to your Fly.io secrets:")
    print(f"  fly secrets set AUTH_PASSWORD_HASH={password_hash} -a poe-flip-backend")
    print()
    print("Or add to your .env file:")
    print(f"  AUTH_PASSWORD_HASH={password_hash}")
    print()
    print("You can also set a custom username (default is 'admin'):")
    print(f"  fly secrets set AUTH_USERNAME=yourusername -a poe-flip-backend")

if __name__ == "__main__":
    main()
