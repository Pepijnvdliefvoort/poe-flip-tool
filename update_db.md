This guide explains how to safely download, edit, and upload the SQLite database used by the Fly.io backend.

# Prerequisites
- Ensure you have [Fly.io CLI](https://fly.io/docs/getting-started/installing-flyctl/) installed and configured on your machine.


# Commands

## 1. Login to Fly.io
```pwsh
fly auth login
```

## 2. Download the Database
```pwsh
fly ssh sftp --app poe-flip-backend get /data/poe_cache.db poe_cache.db
```
> **Note:** This outputs the `poe_cache.db` file to your current working directory.

## 3. Backup the Database
```pwsh
cp poe_cache.db poe_cache_backup.db
```

## 4. Edit the Database
You can use any SQLite database editor of your choice. Here are a couple of popular options:
- [DB Browser for SQLite](https://sqlitebrowser.org/)
- [DBeaver](https://dbeaver.io/)

## 5 Delete old .db file (safety overwrite)
```pwsh
fly ssh console --app poe-flip-backend # SSH into the app

cd /data # Change directory to the /data folder

rm poe_cache.db # remove the DB file (fly ssh can't overwrite db files)

exit # exit SSH
```

## 6. Upload the Edited Database
```pwsh
fly ssh sftp --app poe-flip-backend put "C:\Users\pepij\poe_cache.db" /data/poe_cache.db
```

## 7. Redeploy the Fly.io app
```pwsh
fly deploy -a poe-flip-backend
```

## 8. Remove old locally stored db
```pwsh
rm poe_cache.db
```
